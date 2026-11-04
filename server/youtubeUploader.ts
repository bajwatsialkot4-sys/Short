import fs from 'fs';
import path from 'path';
import { AuthState, VideoJob } from './types.ts';
import { getMediaDir, loadAuthState, saveAuthState, updateAuthState, logActivity } from './storage.ts';

export interface ChannelInfo {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
}

// Clean and sanitize credential strings (remove leading/trailing spaces, quotes, newlines)
export function cleanCredentialString(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

// Translate Google OAuth API errors into clear, actionable messages
export function parseGoogleOAuthError(status: number, errText: string): string {
  try {
    const parsed = JSON.parse(errText);
    const err = parsed.error;
    const desc = parsed.error_description || '';

    if (err === 'unauthorized_client') {
      return (
        `Google OAuth Error 401 (unauthorized_client): The Refresh Token is not authorized for this specific Client ID. ` +
        `In Google Cloud, each refresh token is cryptographically locked to the single Client ID that created it. ` +
        `If the refresh token was generated via OAuth Playground using default credentials, or belongs to a different client (e.g. Web Client 1-4), Google rejects it. ` +
        `Solution: Click "1-Tap Connect with Google" in the app to generate a matching refresh token automatically, or authorize using your Client ID in OAuth Playground.`
      );
    }

    if (err === 'invalid_client') {
      if (desc.toLowerCase().includes('client was not found') || desc.toLowerCase().includes('not found')) {
        return (
          `Google OAuth Error 401 (invalid_client): "The OAuth client was not found." ` +
          `Google Cloud could not locate an OAuth Web Client with this Client ID. ` +
          `Please check that you copied the complete Client ID (ending in .apps.googleusercontent.com) from Google Cloud Console Web Client 5 without extra characters or quotes.`
        );
      }
      if (desc.toLowerCase().includes('secret') || desc.toLowerCase().includes('invalid')) {
        return (
          `Google OAuth Error 401 (invalid_client): "The provided client secret is invalid." ` +
          `The Client Secret does not match Web Client 5's Client ID in Google Cloud Console.`
        );
      }
      return `Google OAuth Error (${status}): ${err} - ${desc}`;
    }

    if (err === 'invalid_grant') {
      return `Google OAuth Error 400 (invalid_grant): The authorization code or refresh token has expired, been revoked, or already used. Please re-authorize by clicking "1-Tap Connect with Google".`;
    }

    if (err === 'redirect_uri_mismatch') {
      return `Google OAuth Error 400 (redirect_uri_mismatch): The redirect URI sent does not match the Authorized redirect URIs configured for Web Client 5 in Google Cloud Console. Add the redirect URI shown in settings to your Google Cloud Console.`;
    }

    return `Google OAuth Error (${status}): ${desc || err || errText}`;
  } catch (e) {
    return `Google OAuth Error (${status}): ${errText}`;
  }
}

// Fetch channel information for the authenticated user with explicit error reporting
export async function getYouTubeChannelInfo(accessToken: string): Promise<{ channel: ChannelInfo | null; error?: string }> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Channel fetch failed:', res.status, errText);
      let parsedErr = errText;
      try {
        const json = JSON.parse(errText);
        parsedErr = json.error?.message || errText;
      } catch (e) {}

      if (res.status === 403 && (errText.includes('accessNotConfigured') || errText.includes('SERVICE_DISABLED'))) {
        return {
          channel: null,
          error: 'YouTube Data API v3 is disabled in your Google Cloud project. Please enable "YouTube Data API v3" in Google Cloud Console -> APIs & Services -> Library.',
        };
      }
      return { channel: null, error: `YouTube Data API v3 error (${res.status}): ${parsedErr}` };
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
      return {
        channel: null,
        error: 'Authenticated with Google, but no YouTube channel was found on this Google account. Please create a channel on youtube.com for this account first.',
      };
    }

    return {
      channel: {
        id: item.id,
        title: item.snippet.title,
        customUrl: item.snippet.customUrl,
        thumbnailUrl: item.snippet.thumbnails?.default?.url || item.snippet.thumbnails?.medium?.url,
        subscriberCount: item.statistics?.subscriberCount || '0',
        videoCount: item.statistics?.videoCount || '0',
      },
    };
  } catch (e: any) {
    console.error('Error fetching YouTube channel:', e.message);
    return { channel: null, error: e.message };
  }
}

// Refresh an expired Google OAuth access token using refresh_token
export async function refreshGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const cleanId = cleanCredentialString(clientId);
  const cleanSecret = cleanCredentialString(clientSecret);
  const cleanToken = cleanCredentialString(refreshToken);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cleanId,
      client_secret: cleanSecret,
      refresh_token: cleanToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const friendlyError = parseGoogleOAuthError(res.status, errText);
    throw new Error(friendlyError);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

// Exchange an authorization code for access and refresh tokens
export async function exchangeGoogleAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const cleanId = cleanCredentialString(clientId);
  const cleanSecret = cleanCredentialString(clientSecret);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cleanId,
      client_secret: cleanSecret,
      code: code.trim(),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri.trim(),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const friendlyError = parseGoogleOAuthError(res.status, errText);
    throw new Error(friendlyError);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 3600,
  };
}

// Real YouTube API verification test for saved credentials
export async function verifyYouTubeCredentials(): Promise<{
  success: boolean;
  channel?: ChannelInfo;
  error?: string;
}> {
  const authState = loadAuthState();

  if (!authState.clientId || !authState.clientSecret) {
    return {
      success: false,
      error: 'Google OAuth Client ID and Client Secret are not configured. Please enter them in Settings.',
    };
  }

  if (!authState.refreshToken) {
    return {
      success: false,
      error: 'No Refresh Token saved. Tap "1-Tap Connect with Google" in Settings to connect your channel.',
    };
  }

  try {
    logActivity('auth', 'Executing real verification test against Google OAuth & YouTube Data API...');
    const { accessToken, expiresIn } = await refreshGoogleAccessToken(
      authState.clientId,
      authState.clientSecret,
      authState.refreshToken
    );

    const { channel, error: channelErr } = await getYouTubeChannelInfo(accessToken);
    if (!channel) {
      throw new Error(channelErr || 'Authenticated with Google, but could not retrieve YouTube channel details. Ensure YouTube Data API v3 is enabled.');
    }

    // Persist verified state
    updateAuthState({
      connected: true,
      accessToken,
      tokenSavedAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
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

    logActivity('auth', `YouTube connection verified: ${channel.title} (${channel.id})`);
    return { success: true, channel };
  } catch (err: any) {
    logActivity('error', `YouTube verification test failed: ${err.message}`);
    // DO NOT erase clientId or clientSecret or refreshToken!
    updateAuthState({
      connected: false,
      lastVerificationError: err.message,
    });
    return { success: false, error: err.message };
  }
}

// Ensure access token is fresh before any YouTube API call
export async function getValidAccessToken(): Promise<string> {
  const authState = loadAuthState();

  if (!authState.connected || !authState.accessToken) {
    throw new Error('YouTube channel is not connected. Please connect your YouTube account in the app.');
  }

  const now = Date.now();
  const isExpiringSoon = authState.expiresAt && authState.expiresAt - now < 5 * 60 * 1000; // < 5 mins

  if (isExpiringSoon) {
    if (authState.refreshToken && authState.clientId && authState.clientSecret) {
      logActivity('auth', 'OAuth token expiring. Automatically refreshing using refresh token...');
      try {
        const { accessToken, expiresIn } = await refreshGoogleAccessToken(
          authState.clientId,
          authState.clientSecret,
          authState.refreshToken
        );

        updateAuthState({
          accessToken,
          expiresAt: Date.now() + expiresIn * 1000,
          tokenSavedAt: Date.now(),
        });
        logActivity('auth', 'Google OAuth token successfully refreshed!');
        return accessToken;
      } catch (refreshErr: any) {
        logActivity('error', `Token refresh failed: ${refreshErr.message}`);
        throw new Error(`Google OAuth refresh failed: ${refreshErr.message}`);
      }
    } else {
      logActivity('system', 'Google OAuth token is near or past expiration.');
    }
  }

  return authState.accessToken;
}

// Upload a video to YouTube using Resumable Upload
export async function uploadVideoToYouTube(
  job: VideoJob,
  privacyStatus: 'private' | 'unlisted' | 'public' = 'private',
  publishAtIso?: string,
  onProgress?: (percent: number, statusMsg: string) => void
): Promise<{ videoId: string; youtubeUrl: string }> {
  const accessToken = await getValidAccessToken();
  const authState = loadAuthState();

  const mediaDir = getMediaDir();
  const videoPath = path.join(mediaDir, job.videoFilename!);

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found at ${job.videoFilename}`);
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const script = job.script!;

  onProgress?.(10, 'Initiating YouTube resumable upload session...');
  logActivity('upload', `Starting YouTube upload for "${script.title}" (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

  const metadata: any = {
    snippet: {
      title: script.title.slice(0, 100),
      description: `${script.description}\n\nAutomated by Auto Shorts Creator.\n#shorts #mrbeast #challenge`,
      tags: script.tags || ['shorts', 'challenge', 'mrbeast'],
      categoryId: '24', // Entertainment
      defaultLanguage: 'en',
      defaultAudioLanguage: 'en',
    },
    status: {
      privacyStatus: publishAtIso ? 'private' : privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  if (publishAtIso) {
    metadata.status.publishAt = publishAtIso;
  }

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': fileSize.toString(),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errorBody = await initRes.text();
    let parsedMsg = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      parsedMsg = parsed.error?.message || errorBody;
    } catch (e) {}

    if (initRes.status === 401) {
      throw new Error('Google OAuth token expired. Please re-authenticate YouTube channel in the app.');
    }
    if (initRes.status === 403 && errorBody.includes('quotaExceeded')) {
      throw new Error('YouTube API quota limit reached for today (10,000 units). Quota resets at midnight PST.');
    }

    throw new Error(`YouTube API upload session error (${initRes.status}): ${parsedMsg}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Failed to retrieve YouTube resumable upload URL from response headers.');
  }

  onProgress?.(30, 'Streaming video bytes to YouTube servers...');

  // Step 2: Upload file stream / buffer
  const videoBuffer = fs.readFileSync(videoPath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize.toString(),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`YouTube video upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadResult = await uploadRes.json();
  const videoId = uploadResult.id;
  const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

  onProgress?.(85, `Video uploaded! Setting custom thumbnail...`);
  logActivity('upload', `Video successfully uploaded to YouTube! Video ID: ${videoId}`);

  // Step 3: Upload thumbnail if available
  if (job.thumbnailFilename) {
    const thumbPath = path.join(mediaDir, job.thumbnailFilename);
    if (fs.existsSync(thumbPath)) {
      try {
        const thumbBuffer = fs.readFileSync(thumbPath);
        const thumbRes = await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'image/jpeg',
              'Content-Length': thumbBuffer.length.toString(),
            },
            body: thumbBuffer,
          }
        );

        if (thumbRes.ok) {
          logActivity('upload', `Custom thumbnail set for video ${videoId}`);
        } else {
          console.warn('Thumbnail set warning:', thumbRes.status);
        }
      } catch (thumbErr: any) {
        console.warn('Thumbnail upload warning:', thumbErr.message);
      }
    }
  }

  onProgress?.(100, `Complete! Live on YouTube: ${youtubeUrl}`);
  return { videoId, youtubeUrl };
}
