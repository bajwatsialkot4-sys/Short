import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  getMediaDir,
  loadAuthState,
  saveAuthState,
  updateAuthState,
  loadSchedulerConfig,
  saveSchedulerConfig,
  loadJobs,
  updateJob,
  loadLogs,
  logActivity,
  loadSettings,
  saveSettings,
} from './storage.ts';
import {
  getYouTubeChannelInfo,
  uploadVideoToYouTube,
  refreshGoogleAccessToken,
  exchangeGoogleAuthCode,
  verifyYouTubeCredentials,
  cleanCredentialString,
  parseGoogleOAuthError,
} from './youtubeUploader.ts';
import {
  getKarachiTime,
  getNextSlotInfo,
  runAutomatedPipeline,
  startScheduler,
} from './scheduler.ts';

// Helper to determine canonical HTTPS Redirect URI for Google Cloud OAuth Web Clients
export function getCanonicalRedirectUri(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'] as string;
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  const host = forwardedHost || req.get('host') || 'localhost:3000';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const proto = isLocal ? (req.protocol || 'http') : (forwardedProto || 'https');
  return `${proto}://${host}/api/auth/callback`;
}

// Helper to return recommended Authorized JavaScript Origins
export function getAuthorizedOrigins(req: Request): string[] {
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  const origins = new Set<string>();
  if (host.includes('localhost')) {
    origins.add(`http://${host}`);
    origins.add('http://localhost:3000');
  } else {
    origins.add(`https://${host}`);
  }
  origins.add('https://ais-dev-4rudwnyalwoejvn3czvszv-982797818827.asia-southeast1.run.app');
  origins.add('https://ais-pre-4rudwnyalwoejvn3czvszv-982797818827.asia-southeast1.run.app');
  return Array.from(origins);
}

export function createApiApp(): express.Application {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());

  // Initialize background server scheduler
  startScheduler();

  // 1. System & Channel Status
  app.get('/api/status', (req: Request, res: Response) => {
    try {
      const auth = loadAuthState();
      const scheduler = loadSchedulerConfig();
      const settings = loadSettings();
      const karachi = getKarachiTime();
      const nextSlot = getNextSlotInfo();
      const jobs = loadJobs();
      const activeJob = jobs.find(j => ['generating_script', 'generating_audio', 'rendering_scenes', 'encoding_video', 'uploading'].includes(j.status));

      const apiKey = (settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
      const hasGeminiKey = !!apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.length > 5;
      const hasRefreshToken = Boolean(auth.refreshToken && auth.refreshToken.trim().length > 0);
      const hasClientId = Boolean(auth.clientId && auth.clientId.trim().length > 0);
      const hasClientSecret = Boolean(auth.clientSecret && auth.clientSecret.trim().length > 0);
      const isTokenExpired = auth.expiresAt ? Date.now() > auth.expiresAt : false;
      const expiresInSeconds = auth.expiresAt ? Math.max(0, Math.floor((auth.expiresAt - Date.now()) / 1000)) : 0;

      const canonicalRedirectUri = getCanonicalRedirectUri(req);
      const authorizedOrigins = getAuthorizedOrigins(req);

      // Mask client ID for safe frontend display (never display client secret or refresh token)
      let clientIdMasked = '';
      if (auth.clientId) {
        const parts = auth.clientId.split('-');
        if (parts.length > 1) {
          clientIdMasked = `${parts[0]}-••••••••.apps.googleusercontent.com`;
        } else {
          clientIdMasked = `${auth.clientId.substring(0, 10)}••••••••`;
        }
      }

      res.json({
        auth: {
          connected: Boolean(auth.connected),
          channelId: auth.channelId,
          channelTitle: auth.channelTitle,
          channelHandle: auth.channelHandle,
          channelThumbnail: auth.channelThumbnail,
          subscribers: auth.subscribers,
          videoCount: auth.videoCount,
          email: auth.email,
          displayName: auth.displayName,
          tokenSavedAt: auth.tokenSavedAt,
          hasRefreshToken,
          hasClientId,
          hasClientSecret,
          clientIdMasked,
          isTokenExpired,
          expiresInSeconds,
          authMethod: 'custom_oauth',
          lastVerifiedAt: auth.lastVerifiedAt,
          lastVerificationError: auth.lastVerificationError,
          redirectUri: canonicalRedirectUri,
          authorizedOrigins,
        },
        scheduler: {
          ...scheduler,
          cronSecret: settings.cronSecret,
          karachiTime: `${karachi.timeStr} PKT (${karachi.dateStr})`,
          nextScheduledSlot: nextSlot.nextSlot,
          secondsUntilNextSlot: nextSlot.secondsRemaining,
        },
        system: {
          ffmpegAvailable: true,
          hasGeminiKey,
          aiMode: hasGeminiKey ? 'Gemini 3.8 Flash AI' : 'Built-in Viral Challenge Templates (Free/Offline)',
          serverTimeUTC: new Date().toISOString(),
          activeJob: activeJob || null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Save Google OAuth / YouTube Token
  app.post('/api/auth/save-token', async (req: Request, res: Response) => {
    try {
      const { accessToken, user } = req.body;
      if (!accessToken) {
        return res.status(400).json({ error: 'accessToken is required' });
      }

      logActivity('auth', 'Connecting YouTube channel with provided OAuth token...');
      const { channel, error: channelErr } = await getYouTubeChannelInfo(accessToken);

      const authState = {
        connected: true,
        accessToken,
        tokenSavedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
        channelId: channel?.id || 'Connected Account',
        channelTitle: channel?.title || user?.displayName || 'My YouTube Channel',
        channelHandle: channel?.customUrl || '@channel',
        channelThumbnail: channel?.thumbnailUrl || user?.photoURL,
        subscribers: channel?.subscriberCount || '0',
        videoCount: channel?.videoCount || '0',
        email: user?.email,
        displayName: user?.displayName,
        photoURL: user?.photoURL,
      };

      saveAuthState(authState);
      logActivity('auth', `YouTube Channel successfully connected: ${authState.channelTitle} (${authState.channelId})`);

      res.json({
        success: true,
        channel: authState,
      });
    } catch (e: any) {
      logActivity('error', `YouTube connection failed: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Disconnect YouTube Channel (preserves Client ID & Secret configuration)
  app.post('/api/auth/disconnect', (req: Request, res: Response) => {
    try {
      const auth = loadAuthState();
      saveAuthState({
        connected: false,
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        refreshToken: undefined,
        accessToken: undefined,
        expiresAt: undefined,
        tokenSavedAt: undefined,
        channelId: undefined,
        channelTitle: undefined,
        channelHandle: undefined,
        channelThumbnail: undefined,
        subscribers: undefined,
        videoCount: undefined,
        lastVerifiedAt: undefined,
        lastVerificationError: undefined,
      });
      logActivity('auth', 'YouTube channel disconnected (Client ID and Secret preserved on server).');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. Update Scheduler Settings
  app.post('/api/scheduler/update', (req: Request, res: Response) => {
    try {
      const config = loadSchedulerConfig();
      const { enabled, timeSlot1, timeSlot2, privacyStatus, autoUpload } = req.body;

      if (enabled !== undefined) config.enabled = Boolean(enabled);
      if (timeSlot1) config.timeSlot1 = timeSlot1;
      if (timeSlot2) config.timeSlot2 = timeSlot2;
      if (privacyStatus) config.privacyStatus = privacyStatus;
      if (autoUpload !== undefined) config.autoUpload = Boolean(autoUpload);

      saveSchedulerConfig(config);
      logActivity('scheduler', `Scheduler settings updated: ${config.enabled ? 'Enabled' : 'Disabled'} (${config.timeSlot1} & ${config.timeSlot2} PKT, ${config.privacyStatus})`);

      res.json({ success: true, scheduler: config });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 5. Trigger Immediate Video Generation
  app.post('/api/videos/generate', async (req: Request, res: Response) => {
    try {
      const { topic, autoUpload } = req.body;
      logActivity('generation', `Manual trigger requested: ${topic || 'random MrBeast challenge'}`);

      // Start pipeline in background so HTTP response returns fast with job object
      const pipelinePromise = runAutomatedPipeline(topic, Boolean(autoUpload));

      // Get newly created job
      const jobs = loadJobs();
      const currentJob = jobs[0];

      res.json({
        success: true,
        job: currentJob,
      });

      // Catch any background rejection to prevent crash
      pipelinePromise.catch(err => {
        console.error('Pipeline background error:', err);
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 6. List Generated Videos
  app.get('/api/videos', (req: Request, res: Response) => {
    try {
      const jobs = loadJobs();
      res.json({ jobs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 7. Get Single Video Job
  app.get('/api/videos/:id', (req: Request, res: Response) => {
    try {
      const jobs = loadJobs();
      const job = jobs.find(j => j.id === req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json({ job });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 8. Stream Video File (with HTTP 206 Partial Content support for mobile video players)
  app.get('/api/videos/file/:id', (req: Request, res: Response) => {
    try {
      const jobs = loadJobs();
      const job = jobs.find(j => j.id === req.params.id);
      if (!job || !job.videoFilename) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const mediaDir = getMediaDir();
      const filePath = path.join(mediaDir, job.videoFilename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File on disk not found' });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 9. Stream Thumbnail Image
  app.get('/api/videos/thumb/:id', (req: Request, res: Response) => {
    try {
      const jobs = loadJobs();
      const job = jobs.find(j => j.id === req.params.id);
      if (!job || !job.thumbnailFilename) {
        return res.status(404).json({ error: 'Thumbnail not found' });
      }

      const mediaDir = getMediaDir();
      const filePath = path.join(mediaDir, job.thumbnailFilename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Thumbnail file not found' });
      }

      res.setHeader('Content-Type', 'image/jpeg');
      fs.createReadStream(filePath).pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 10. Upload a specific generated video to YouTube
  app.post('/api/videos/:id/upload', async (req: Request, res: Response) => {
    try {
      const jobs = loadJobs();
      const job = jobs.find(j => j.id === req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const { privacyStatus } = req.body;
      const config = loadSchedulerConfig();
      const effectivePrivacy = privacyStatus || job.youtubePrivacyStatus || config.privacyStatus || 'private';

      updateJob(job.id, {
        status: 'uploading',
        progress: 85,
        statusMessage: 'Uploading video to YouTube...',
      });

      // Background upload
      uploadVideoToYouTube(job, effectivePrivacy, undefined, (percent, msg) => {
        updateJob(job.id, { progress: Math.min(99, 85 + Math.floor(percent * 0.14)), statusMessage: msg });
      })
        .then(({ videoId, youtubeUrl }) => {
          updateJob(job.id, {
            status: 'uploaded',
            progress: 100,
            statusMessage: `Uploaded to YouTube: ${youtubeUrl}`,
            youtubeVideoId: videoId,
            youtubeUrl,
          });
        })
        .catch(err => {
          updateJob(job.id, {
            status: 'ready',
            statusMessage: `Upload error: ${err.message}`,
            error: err.message,
          });
        });

      res.json({ success: true, message: 'Upload started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 11. Activity Logs
  app.get('/api/logs', (req: Request, res: Response) => {
    try {
      const logs = loadLogs();
      res.json({ logs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 12. Save / Update Gemini API Key
  app.post('/api/settings/gemini-key', (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      const settings = loadSettings();
      settings.geminiApiKey = apiKey ? apiKey.trim() : '';
      saveSettings(settings);
      logActivity('system', apiKey ? 'Gemini API key configured.' : 'Gemini API key cleared (using built-in viral templates).');
      res.json({ success: true, hasGeminiKey: !!settings.geminiApiKey });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 13. Save Google Cloud Client ID & Secret (allows saving Web Client 5 without requiring a refresh token upfront)
  app.post('/api/auth/save-client', (req: Request, res: Response) => {
    try {
      const { clientId, clientSecret } = req.body;
      const cleanId = cleanCredentialString(clientId);
      const cleanSecret = cleanCredentialString(clientSecret);

      if (!cleanId || !cleanSecret) {
        return res.status(400).json({ error: 'Both Client ID and Client Secret are required.' });
      }

      if (!cleanId.includes('.apps.googleusercontent.com')) {
        return res.status(400).json({
          error: 'Invalid Client ID format. Google OAuth Client IDs must end with ".apps.googleusercontent.com"',
        });
      }

      updateAuthState({
        clientId: cleanId,
        clientSecret: cleanSecret,
        lastVerificationError: undefined,
      });

      logActivity('auth', 'Google OAuth Client ID & Secret saved to persistent server storage.');
      res.json({
        success: true,
        message: 'Client credentials saved successfully. You can now tap "1-Tap Connect with Google".',
        hasClientId: true,
        hasClientSecret: true,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 14. Save & Verify Custom Google OAuth Credentials (for Permanent Unattended Uploads)
  app.post('/api/auth/oauth-credentials', async (req: Request, res: Response) => {
    try {
      const auth = loadAuthState();
      const rawClientId = req.body.clientId || auth.clientId;
      const rawClientSecret = req.body.clientSecret || auth.clientSecret;
      const rawRefreshToken = req.body.refreshToken || auth.refreshToken;

      const cleanId = cleanCredentialString(rawClientId);
      const cleanSecret = cleanCredentialString(rawClientSecret);
      const cleanToken = cleanCredentialString(rawRefreshToken);

      if (!cleanId || !cleanSecret) {
        return res.status(400).json({ error: 'Client ID and Client Secret are required.' });
      }

      if (!cleanId.includes('.apps.googleusercontent.com')) {
        return res.status(400).json({
          error: 'Invalid Client ID format. Google OAuth Client IDs must end with ".apps.googleusercontent.com"',
        });
      }

      // CRITICAL: Always persist credentials FIRST so they are NEVER wiped on failure
      updateAuthState({
        clientId: cleanId,
        clientSecret: cleanSecret,
        refreshToken: cleanToken || auth.refreshToken,
      });

      if (!cleanToken) {
        return res.json({
          success: true,
          message: 'Client credentials saved. You can now tap "1-Tap Connect with Google" to connect your channel.',
          hasClientId: true,
          hasClientSecret: true,
          hasRefreshToken: false,
        });
      }

      logActivity('auth', 'Testing and persisting Google OAuth credentials for YouTube...');
      const { accessToken, expiresIn } = await refreshGoogleAccessToken(
        cleanId,
        cleanSecret,
        cleanToken
      );

      const { channel, error: channelErr } = await getYouTubeChannelInfo(accessToken);
      if (!channel) {
        throw new Error(channelErr || 'Authenticated with Google, but failed to fetch YouTube channel details. Ensure YouTube Data API v3 is enabled on this Google Cloud project.');
      }

      // Persist verified state
      updateAuthState({
        connected: true,
        clientId: cleanId,
        clientSecret: cleanSecret,
        refreshToken: cleanToken,
        accessToken,
        expiresAt: Date.now() + expiresIn * 1000,
        tokenSavedAt: Date.now(),
        authMethod: 'custom_oauth',
        channelId: channel.id,
        channelTitle: channel.title,
        channelHandle: channel.customUrl || '@channel',
        channelThumbnail: channel.thumbnailUrl,
        subscribers: channel.subscriberCount,
        videoCount: channel.videoCount,
        lastVerifiedAt: Date.now(),
        lastVerificationError: undefined,
      });

      logActivity('auth', `YouTube channel verified and stored: ${channel.title} (${channel.id})`);

      // Return safe metadata ONLY - never return secrets
      res.json({
        success: true,
        channel,
      });
    } catch (e: any) {
      logActivity('error', `OAuth credentials validation failed: ${e.message}`);
      // Keep credentials saved! Do NOT erase clientId, clientSecret, or refreshToken
      updateAuthState({
        connected: false,
        lastVerificationError: e.message,
      });
      res.status(400).json({ error: e.message });
    }
  });

  // 15. Verify Saved YouTube OAuth Credentials via Live API Call
  app.post('/api/auth/verify', async (req: Request, res: Response) => {
    try {
      const result = await verifyYouTubeCredentials();
      if (!result.success) {
        return res.status(400).json({
          verified: false,
          error: result.error || 'Failed to verify YouTube connection.',
        });
      }
      res.json({
        verified: true,
        channel: result.channel,
      });
    } catch (e: any) {
      res.status(500).json({ verified: false, error: e.message });
    }
  });

  // 16. Get Google OAuth Authorization URL (for 1-Tap Official Consent Flow)
  app.get('/api/auth/google/url', (req: Request, res: Response) => {
    try {
      const auth = loadAuthState();
      const rawClientId = (req.query.clientId as string) || auth.clientId;
      const clientId = cleanCredentialString(rawClientId);

      if (!clientId) {
        return res.status(400).json({
          error: 'Client ID is not configured. Please enter your Google Cloud OAuth Client ID in Settings first.',
        });
      }

      const redirectUri = getCanonicalRedirectUri(req);
      const scopes = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'openid',
        'profile',
        'email',
      ].join(' ');

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        access_type: 'offline',
        prompt: 'consent select_account',
        include_granted_scopes: 'true',
      });

      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      res.json({ url, redirectUri });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 17. Google OAuth Web Callback
  app.get('/api/auth/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const error = req.query.error as string;
      if (error) {
        logActivity('error', `OAuth consent denied by user: ${error}`);
        return res.redirect(`/?auth_error=${encodeURIComponent('Google Authorization cancelled: ' + error)}`);
      }
      if (!code) {
        return res.redirect('/?auth_error=Missing+authorization+code+from+Google');
      }

      const auth = loadAuthState();
      if (!auth.clientId || !auth.clientSecret) {
        return res.redirect('/?auth_error=Missing+Client+ID+or+Client+Secret+on+server');
      }

      const redirectUri = getCanonicalRedirectUri(req);
      logActivity('auth', 'Exchanging Google auth code for Web Client 5...');

      const { accessToken, refreshToken, expiresIn } = await exchangeGoogleAuthCode(
        auth.clientId,
        auth.clientSecret,
        code,
        redirectUri
      );

      const effectiveRefreshToken = refreshToken || auth.refreshToken;
      if (!effectiveRefreshToken) {
        throw new Error('Google did not return a refresh token. Please re-authorize and ensure you accept all permissions.');
      }

      const { channel, error: channelErr } = await getYouTubeChannelInfo(accessToken);
      if (!channel) {
        throw new Error(channelErr || 'Authenticated with Google, but could not fetch YouTube channel details. Ensure YouTube Data API v3 is enabled.');
      }

      updateAuthState({
        connected: true,
        accessToken,
        refreshToken: effectiveRefreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        tokenSavedAt: Date.now(),
        channelId: channel.id,
        channelTitle: channel.title,
        channelHandle: channel.customUrl || '@channel',
        channelThumbnail: channel.thumbnailUrl,
        subscribers: channel.subscriberCount,
        videoCount: channel.videoCount,
        authMethod: 'custom_oauth',
        lastVerifiedAt: Date.now(),
        lastVerificationError: undefined,
      });

      logActivity('auth', `YouTube connected successfully via OAuth flow: ${channel.title} (${channel.id})`);
      res.redirect('/?auth_success=true');
    } catch (e: any) {
      logActivity('error', `OAuth callback failed: ${e.message}`);
      res.redirect(`/?auth_error=${encodeURIComponent(e.message)}`);
    }
  });

  // 14. External Cron Webhook Trigger (for cron-job.org / GitHub Actions / Vercel Cron)
  const handleCronTrigger = async (req: Request, res: Response) => {
    try {
      const settings = loadSettings();
      const authHeader = req.headers.authorization;
      const headerSecret = req.headers['x-cron-secret'] as string;
      const queryToken = req.query.token as string;

      // Enforce secret verification (via header x-cron-secret, Bearer token, or query param)
      const providedToken = headerSecret || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '') || queryToken;

      if (!settings.cronSecret || providedToken !== settings.cronSecret) {
        return res.status(401).json({
          error: 'Unauthorized: Missing or invalid cron secret. Provide header "x-cron-secret" or "Authorization: Bearer <token>"',
        });
      }

      const karachi = getKarachiTime();
      logActivity('scheduler', `[CRON TRIGGER] External ping received at ${karachi.timeStr} PKT (${karachi.dateStr})`);

      const config = loadSchedulerConfig();
      if (!config.enabled) {
        return res.json({ status: 'skipped', reason: 'Scheduler is paused in app settings.' });
      }

      // Check slot matching
      const isSlot1 = karachi.timeStr === config.timeSlot1;
      const isSlot2 = karachi.timeStr === config.timeSlot2;
      const force = req.query.force === 'true';

      if (!isSlot1 && !isSlot2 && !force) {
        return res.json({
          status: 'idle',
          currentTimePKT: karachi.timeStr,
          slots: [config.timeSlot1, config.timeSlot2],
          message: 'Not currently scheduled slot time. Pass ?force=true to run immediately.',
        });
      }

      // Check duplicate prevention
      if (isSlot1 && config.lastRunDateSlot1 === karachi.dateStr && !force) {
        return res.json({ status: 'already_run', slot: 'Slot 1', date: karachi.dateStr });
      }
      if (isSlot2 && config.lastRunDateSlot2 === karachi.dateStr && !force) {
        return res.json({ status: 'already_run', slot: 'Slot 2', date: karachi.dateStr });
      }

      // Record slot run
      if (isSlot1) config.lastRunDateSlot1 = karachi.dateStr;
      if (isSlot2) config.lastRunDateSlot2 = karachi.dateStr;
      config.lastRunTimestamp = Date.now();
      config.lastRunStatus = `Cron trigger executed at ${karachi.timeStr} PKT`;
      saveSchedulerConfig(config);

      // Execute pipeline
      const job = await runAutomatedPipeline(undefined, true);
      res.json({
        status: 'executed',
        jobId: job.id,
        videoFilename: job.videoFilename,
        youtubeUrl: job.youtubeUrl,
      });
    } catch (e: any) {
      logActivity('error', `Cron trigger execution error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  };

  app.get('/api/cron/trigger', handleCronTrigger);
  app.post('/api/cron/trigger', handleCronTrigger);

  return app;
}
