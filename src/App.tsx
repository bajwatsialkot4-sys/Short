import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Upload,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Youtube,
  Settings,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Flame,
  Info,
  Smartphone,
  Eye,
  Lock,
  Globe,
  FileText,
} from 'lucide-react';

interface SceneData {
  index: number;
  durationSec: number;
  narration: string;
  headline: string;
  badgeText: string;
  statNumber: string;
  statLabel: string;
  accentColor: string;
}

interface VideoJob {
  id: string;
  createdAt: string;
  status: string;
  progress: number;
  statusMessage: string;
  script?: {
    title: string;
    description: string;
    tags: string[];
    hook: string;
    climax: string;
    scenes: SceneData[];
  };
  videoFilename?: string;
  thumbnailFilename?: string;
  durationSec?: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubePrivacyStatus?: string;
  error?: string;
}

interface AppStatus {
  auth: {
    connected: boolean;
    channelId?: string;
    channelTitle?: string;
    channelHandle?: string;
    channelThumbnail?: string;
    subscribers?: string;
    videoCount?: string;
    email?: string;
    displayName?: string;
    tokenSavedAt?: number;
    hasRefreshToken?: boolean;
    hasClientId?: boolean;
    hasClientSecret?: boolean;
    clientId?: string;
    clientIdMasked?: string;
    isTokenExpired?: boolean;
    expiresInSeconds?: number;
    authMethod?: string;
    lastVerifiedAt?: number;
    lastVerificationError?: string;
    redirectUri?: string;
    authorizedOrigins?: string[];
  };
  scheduler: {
    enabled: boolean;
    timeSlot1: string;
    timeSlot2: string;
    timezone: string;
    privacyStatus: 'private' | 'unlisted' | 'public';
    autoUpload: boolean;
    cronSecret?: string;
    karachiTime: string;
    nextScheduledSlot: string;
    secondsUntilNextSlot: number;
    lastRunStatus?: string;
  };
  system: {
    ffmpegAvailable: boolean;
    hasGeminiKey: boolean;
    activeJob: VideoJob | null;
  };
}

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [customTopic, setCustomTopic] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<VideoJob | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>('');
  const [customClientId, setCustomClientId] = useState<string>('');
  const [customClientSecret, setCustomClientSecret] = useState<string>('');
  const [customRefreshToken, setCustomRefreshToken] = useState<string>('');
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to parse JSON safely without throwing on HTML or network errors
  const safeJson = async (res: Response) => {
    try {
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch (e) {
      // Ignore parse errors on transient network issues
    }
    return null;
  };

  // Load status and jobs
  const fetchState = async () => {
    try {
      const [resStatus, resJobs, resLogs] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/videos'),
        fetch('/api/logs'),
      ]);

      const [dataStatus, dataJobs, dataLogs] = await Promise.all([
        safeJson(resStatus),
        safeJson(resJobs),
        safeJson(resLogs),
      ]);

      if (dataStatus) {
        setStatus(dataStatus);
      }
      if (dataJobs && dataJobs.jobs) {
        setJobs(dataJobs.jobs);
      }
      if (dataLogs && dataLogs.logs) {
        setLogs(dataLogs.logs);
      }
    } catch (err: any) {
      console.warn('Transient poll error:', err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiagnostics = async () => {
    try {
      const res = await safeApi('/api/auth/diagnostics');
      if (res.ok && res.data) {
        setDiagnosticsData(res.data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchState();

    // Check for OAuth redirect callback status
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth_success') === 'true') {
        showNotice('success', 'YouTube connected and verified successfully via official Google OAuth!');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('auth_error')) {
        showNotice('error', `OAuth Notice: ${decodeURIComponent(params.get('auth_error') || '')}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Poll every 4 seconds for live updates
    pollIntervalRef.current = setInterval(fetchState, 4000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const showNotice = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  // Bulletproof API caller that never throws SyntaxError: Unexpected token 'T' on HTML/404 responses
  const safeApi = async <T = any>(
    url: string,
    options?: RequestInit
  ): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          const json = await res.json();
          if (res.ok) {
            return { ok: true, status: res.status, data: json };
          }
          return {
            ok: false,
            status: res.status,
            data: json,
            error: json.error || json.message || `Request failed (${res.status})`,
          };
        } catch (parseErr) {
          return {
            ok: false,
            status: res.status,
            data: null,
            error: `Malformed JSON response from server (${res.status}).`,
          };
        }
      }

      // Non-JSON response (e.g. HTML 404/500/502 from static host or proxy)
      const text = await res.text();
      let friendlyError = '';
      if (res.status === 404 || text.includes('The page could not be found') || text.includes('The page cannot be found') || text.includes('NOT_FOUND')) {
        friendlyError = `API route not found (HTTP 404). If accessing from a published or external domain, ensure the backend API server is deployed.`;
      } else if (res.status === 502 || res.status === 503) {
        friendlyError = `Server temporarily unavailable (HTTP ${res.status}).`;
      } else if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        friendlyError = `Server returned an HTML error page instead of JSON (${res.status}).`;
      } else {
        friendlyError = text.slice(0, 160) || `Request failed with HTTP status ${res.status}`;
      }

      return {
        ok: false,
        status: res.status,
        data: null,
        error: friendlyError,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: e.message || 'Network connection failed',
      };
    }
  };

  // Google Identity Services (GIS) Popup Flow - Modern, 0-redirect official Google SDK flow
  const handleConnectWithGisPopup = async () => {
    const cid = customClientId.trim() || status?.auth.clientId || '';
    const csecret = customClientSecret.trim();

    if (!cid) {
      showNotice('error', 'Please enter your Google OAuth Client ID.');
      return;
    }

    // Save client credentials to backend if entered
    if (customClientId.trim() || csecret) {
      try {
        await safeApi('/api/auth/save-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: customClientId.trim() || undefined,
            clientSecret: csecret || undefined,
          }),
        });
      } catch {
        // Continue if save-client has non-fatal issue
      }
    }

    if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
      showNotice('info', 'Google SDK loading... Falling back to direct authorization.');
      return handleConnectRedirect();
    }

    setActionLoading(true);
    try {
      showNotice('info', 'Opening Google Account chooser...');
      const client = (window as any).google.accounts.oauth2.initCodeClient({
        client_id: cid,
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        ux_mode: 'popup',
        select_account: true,
        callback: async (response: any) => {
          if (response.code) {
            showNotice('info', 'Code received! Exchanging with YouTube API and saving credentials...');
            const exchangeRes = await safeApi<{ success: boolean; channel?: any; error?: string }>('/api/auth/exchange-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: response.code,
                redirectUri: 'postmessage',
              }),
            });

            if (exchangeRes.ok && exchangeRes.data?.success) {
              showNotice('success', `🎉 Connected & Verified: ${exchangeRes.data?.channel?.title || 'YouTube Channel'}!`);
              setCustomClientId('');
              setCustomClientSecret('');
              await fetchState();
            } else {
              showNotice('error', exchangeRes.error || exchangeRes.data?.error || 'Failed to exchange authorization code.');
              await fetchState();
            }
          } else if (response.error) {
            showNotice('error', `Google popup error: ${response.error}`);
          }
          setActionLoading(false);
        },
        error_callback: (err: any) => {
          setActionLoading(false);
          showNotice('error', `Google authorization popup closed or blocked.`);
        },
      });

      client.requestCode();
    } catch (err: any) {
      setActionLoading(false);
      showNotice('error', err.message || 'Popup initialization failed. Trying direct redirect...');
      handleConnectRedirect();
    }
  };

  // Full-Page Direct Redirect Flow: sends Client ID & Secret and navigates to Google OAuth URL
  const handleConnectRedirect = async () => {
    const cid = customClientId.trim();
    const csecret = customClientSecret.trim();

    if (!cid && !status?.auth.hasClientId) {
      showNotice('error', 'Please enter your Google OAuth Client ID.');
      return;
    }
    if (!csecret && !status?.auth.hasClientSecret) {
      showNotice('error', 'Please enter your Google OAuth Client Secret.');
      return;
    }

    setActionLoading(true);
    try {
      showNotice('info', 'Connecting to Google OAuth...');
      const result = await safeApi<{ url: string; error?: string }>('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: cid || undefined,
          clientSecret: csecret || undefined,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      });

      if (!result.ok || !result.data?.url) {
        throw new Error(result.error || result.data?.error || 'Failed to initialize Google OAuth connection.');
      }

      showNotice('info', 'Opening official Google Account authorization...');
      
      // If running inside an iFrame (e.g. AI Studio preview), Google OAuth blocks iframe embedding.
      // Open in top-level window or new tab so Google can validate origins cleanly.
      const isFramed = typeof window !== 'undefined' && window.self !== window.top;
      if (isFramed) {
        try {
          const popup = window.open(result.data.url, '_blank', 'noopener,noreferrer');
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            window.location.href = result.data.url;
          }
        } catch {
          window.location.href = result.data.url;
        }
      } else {
        window.location.href = result.data.url;
      }
    } catch (err: any) {
      showNotice('error', err.message);
      setActionLoading(false);
    }
  };

  // Primary Connect Button handler: runs standard Google OAuth 2.0 Web Redirection.
  // Standard Web Redirection checks ONLY Authorized redirect URIs and does NOT require JavaScript origin registration,
  // completely avoiding the "no registered origin (Error 401: invalid_client)" error.
  const handleConnectYouTube = async () => {
    return handleConnectRedirect();
  };

  // Test Live Private YouTube Upload
  const handleTestPrivateUpload = async () => {
    setActionLoading(true);
    try {
      showNotice('info', 'Initiating private YouTube test upload...');
      const result = await safeApi<{ message?: string; jobId?: string }>('/api/auth/test-upload', { method: 'POST' });
      if (!result.ok) {
        throw new Error(result.error || 'Test upload request failed');
      }
      showNotice('success', result.data?.message || 'Private test upload initiated!');
      await fetchState();
    } catch (err: any) {
      showNotice('error', `Test upload failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Real YouTube API verification test on demand
  const handleVerifySavedCredentials = async () => {
    setActionLoading(true);
    try {
      const result = await safeApi<{ verified: boolean; channel?: any }>('/api/auth/verify', { method: 'POST' });
      if (!result.ok || !result.data?.verified) {
        throw new Error(result.error || 'Live verification failed with Google.');
      }
      showNotice('success', `Live test passed! Connected to: ${result.data.channel?.title || 'YouTube'}`);
      await fetchState();
    } catch (err: any) {
      showNotice('error', `YouTube verification test failed: ${err.message}`);
      await fetchState();
    } finally {
      setActionLoading(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your YouTube channel and remove saved credentials from this app?')) return;
    setActionLoading(true);
    try {
      const result = await safeApi('/api/auth/disconnect', { method: 'POST' });
      if (!result.ok) throw new Error(result.error || 'Failed to disconnect');
      showNotice('info', 'YouTube channel disconnected.');
      await fetchState();
    } catch (err: any) {
      showNotice('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger Immediate Video Creation
  const handleGenerateNow = async (forceUpload: boolean = false) => {
    setActionLoading(true);
    try {
      const result = await safeApi('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: customTopic.trim() || undefined,
          autoUpload: forceUpload || status?.scheduler.autoUpload,
        }),
      });
      if (!result.ok) throw new Error(result.error || 'Failed to start generation');
      showNotice('success', 'Creation started! Generating MrBeast challenge video...');
      setCustomTopic('');
      await fetchState();
    } catch (err: any) {
      showNotice('error', `Generation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Upload an existing video
  const handleUploadJob = async (jobId: string) => {
    setActionLoading(true);
    try {
      const result = await safeApi(`/api/videos/${jobId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyStatus: status?.scheduler.privacyStatus || 'private' }),
      });
      if (!result.ok) throw new Error(result.error || 'Failed to initiate upload');
      showNotice('info', 'YouTube upload in progress...');
      await fetchState();
    } catch (err: any) {
      showNotice('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle scheduler
  const handleToggleScheduler = async () => {
    if (!status) return;
    try {
      const newEnabled = !status.scheduler.enabled;
      const res = await fetch('/api/scheduler/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        showNotice('success', `Automated scheduler ${newEnabled ? 'Enabled' : 'Paused'}`);
        await fetchState();
      }
    } catch (err: any) {
      showNotice('error', err.message);
    }
  };

  // Change privacy setting
  const handleChangePrivacy = async (privacy: 'private' | 'unlisted' | 'public') => {
    try {
      const res = await fetch('/api/scheduler/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyStatus: privacy }),
      });
      if (res.ok) {
        showNotice('success', `Default privacy set to: ${privacy.toUpperCase()}`);
        await fetchState();
      }
    } catch (err: any) {
      showNotice('error', err.message);
    }
  };

  // Save free Gemini API Key
  const handleSaveGeminiKey = async () => {
    setActionLoading(true);
    try {
      const result = await safeApi('/api/settings/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKeyInput.trim() }),
      });
      if (!result.ok) throw new Error(result.error || 'Failed to save API key');
      showNotice('success', geminiKeyInput.trim() ? 'Gemini AI activated!' : 'Gemini key cleared (using built-in viral templates).');
      setGeminiKeyInput('');
      await fetchState();
    } catch (err: any) {
      showNotice('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Save Google Cloud Client ID and Secret alone (no refresh token required upfront)
  const handleSaveClientOnly = async () => {
    const cid = customClientId.trim();
    const csecret = customClientSecret.trim();

    if (!cid && !status?.auth.hasClientId) {
      showNotice('error', 'Please enter your Google Cloud OAuth Client ID.');
      return;
    }
    if (!csecret && !status?.auth.hasClientSecret) {
      showNotice('error', 'Please enter your Google Cloud OAuth Client Secret.');
      return;
    }

    setActionLoading(true);
    try {
      const result = await safeApi('/api/auth/save-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: cid || undefined,
          clientSecret: csecret || undefined,
        }),
      });
      if (!result.ok) throw new Error(result.error || 'Failed to save client credentials');
      showNotice('success', 'Web Client credentials saved to server! You can now tap "1-Tap Connect with Google".');
      setCustomClientId('');
      setCustomClientSecret('');
      await fetchState();
    } catch (err: any) {
      showNotice('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Save & Verify Custom OAuth credentials (with optional Refresh Token)
  const handleSaveCustomOAuth = async () => {
    const cid = customClientId.trim() || (status?.auth.hasClientId ? 'SAVED' : '');
    const csecret = customClientSecret.trim() || (status?.auth.hasClientSecret ? 'SAVED' : '');

    if (!cid || !csecret) {
      showNotice('error', 'Google Client ID and Client Secret are required.');
      return;
    }

    setActionLoading(true);
    try {
      const payload: any = {};
      if (customClientId.trim()) payload.clientId = customClientId.trim();
      if (customClientSecret.trim()) payload.clientSecret = customClientSecret.trim();
      if (customRefreshToken.trim()) payload.refreshToken = customRefreshToken.trim();

      const result = await safeApi<{ channel?: any; message?: string }>('/api/auth/oauth-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!result.ok) throw new Error(result.error || 'Failed to verify OAuth credentials');

      if (result.data?.channel?.title) {
        showNotice('success', `Permanent YouTube OAuth connected & verified for: ${result.data.channel.title}`);
        setShowSettings(false);
      } else {
        showNotice('success', result.data?.message || 'Credentials successfully saved on server!');
      }
      setCustomClientId('');
      setCustomClientSecret('');
      setCustomRefreshToken('');
      await fetchState();
    } catch (err: any) {
      showNotice('error', err.message);
      await fetchState();
    } finally {
      setActionLoading(false);
    }
  };

  const activeJob = status?.system.activeJob;
  const isChannelConnected = status?.auth.connected;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* Top Mobile-Optimized App Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">Auto Shorts</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-black uppercase">
                  MrBeast AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                <span>PKT:</span>
                <span className="font-mono text-emerald-400">{status?.scheduler.karachiTime || 'Loading...'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center space-x-1 text-xs font-semibold"
              title="API Keys & Credentials"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center space-x-1 text-xs font-semibold"
              title="System Guide"
            >
              <Info className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Guide</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container (Mobile-first width max-w-xl) */}
      <main className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4 flex-1">
        {/* Floating Notification */}
        {notification && (
          <div
            className={`p-3.5 rounded-xl border flex items-start space-x-2.5 text-xs font-medium animate-in fade-in slide-in-from-top-2 ${
              notification.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-950/80 border-rose-800/80 text-rose-200'
                : 'bg-cyan-950/80 border-cyan-800/80 text-cyan-200'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
            )}
            <div className="flex-1">{notification.message}</div>
          </div>
        )}

        {/* 1. YouTube Channel Connection Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">
                1. YouTube Channel Connection
              </h2>
            </div>
            {isChannelConnected ? (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Connected & Verified</span>
              </span>
            ) : status?.auth.lastVerificationError ? (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                <span>Not Connected (Error)</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>Not Connected</span>
              </span>
            )}
          </div>

          {isChannelConnected ? (
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {status?.auth.channelThumbnail ? (
                    <img
                      src={status.auth.channelThumbnail}
                      alt="Channel Avatar"
                      className="w-12 h-12 rounded-full border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center font-bold text-white text-sm">
                      YT
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center space-x-1.5">
                      <span>{status?.auth.channelTitle}</span>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {status?.auth.channelHandle} • {status?.auth.subscribers || '0'} subscribers • {status?.auth.videoCount || '0'} videos
                    </p>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">
                        ⚡ 24/7 Autonomous Uploads Active
                      </span>
                      {status?.auth.lastVerifiedAt && (
                        <span className="text-[10px] text-slate-400">
                          Verified: {new Date(status.auth.lastVerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors shrink-0"
                >
                  Disconnect
                </button>
              </div>

              {/* Action buttons when connected */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                <button
                  onClick={handleVerifySavedCredentials}
                  disabled={actionLoading}
                  className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>

                <button
                  onClick={handleTestPrivateUpload}
                  disabled={actionLoading}
                  className="py-2 px-2.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-xs font-semibold text-red-200 flex items-center justify-center space-x-1.5 transition-colors border border-red-800/60"
                >
                  <Upload className="w-3.5 h-3.5 text-red-400" />
                  <span>Test Private Upload</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Exact Error Diagnostic Display if verification or auth failed */}
              {status?.auth.lastVerificationError && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800/80 text-[11px] text-rose-200 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center space-x-1.5 font-bold text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Exact Connection Error</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed break-words font-mono text-[10px] bg-black/40 p-2 rounded border border-rose-900/50">
                    {status.auth.lastVerificationError}
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Tip: If Google shows a 403 access error, add <strong className="text-white">ukusa2439@gmail.com</strong> to <strong className="text-white">Test users</strong> in Google Cloud Console → OAuth consent screen.
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-400 leading-relaxed">
                Connect your YouTube channel using your own Google Cloud Web Client. Your credentials and refresh tokens are stored securely on the server and never exposed in the browser.
              </p>

              {/* Simple Setup Screen: Exactly Two Credential Fields */}
              <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>1. Google OAuth Client ID</span>
                    {status?.auth.hasClientId && (
                      <span className="text-[10px] text-emerald-400 font-mono font-normal">
                        Saved: {status.auth.clientIdMasked}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={customClientId}
                    onChange={(e) => setCustomClientId(e.target.value)}
                    placeholder={
                      status?.auth.hasClientId
                        ? 'Saved on server (leave blank to keep, or paste new to replace)'
                        : 'Paste Client ID (e.g. 123456-abc.apps.googleusercontent.com)'
                    }
                    className="w-full bg-slate-900 border border-slate-800 focus:border-red-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>2. Google OAuth Client Secret</span>
                    {status?.auth.hasClientSecret && (
                      <span className="text-[10px] text-emerald-400 font-normal">
                        Saved on server
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={customClientSecret}
                    onChange={(e) => setCustomClientSecret(e.target.value)}
                    placeholder={
                      status?.auth.hasClientSecret
                        ? '•••••••••••••••• (Saved on server - leave blank to keep)'
                        : 'Paste Client Secret from Google Cloud Console'
                    }
                    className="w-full bg-slate-900 border border-slate-800 focus:border-red-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                  />
                </div>

                {/* Connect Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleConnectYouTube}
                    disabled={actionLoading}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center space-x-2.5 shadow-lg shadow-red-600/25 transition-all disabled:opacity-50"
                  >
                    <Youtube className="w-5 h-5 shrink-0" />
                    <span>{actionLoading ? 'Connecting to Google...' : 'Connect My YouTube Channel'}</span>
                  </button>
                  <p className="text-[10px] text-emerald-400/90 text-center font-medium">
                    ⚡ Standard Web Redirection — Validates Authorized Redirect URIs only (No origin registration required)
                  </p>

                  <button
                    onClick={handleConnectWithGisPopup}
                    disabled={actionLoading}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-2 border border-slate-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    <span>Or Connect via Google Popup Window (Requires Registered JavaScript Origin)</span>
                  </button>
                </div>
              </div>

              {/* Exact Google Cloud Web Client 5 Configuration Helper */}
              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 text-[11px] space-y-3">
                <div className="font-semibold text-slate-200 flex items-center justify-between">
                  <span>Google Cloud Web Client 5 Configuration</span>
                  <span className="text-[10px] text-amber-400 font-mono font-normal">
                    {status?.auth.clientIdMasked || 'Client ID not saved'}
                  </span>
                </div>

                {/* Section A: Authorized Redirect URIs (Required for Standard Flow) */}
                <div className="space-y-1.5 pt-1 border-t border-slate-900">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-400">
                      1. Authorized redirect URIs (Primary Flow)
                    </span>
                    <span className="text-[10px] text-slate-500">Includes /api/auth/callback</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Add these in Google Cloud Console → APIs & Services → Credentials → Web Client 5:
                  </p>

                  {/* Active Window Redirect URI */}
                  <div className="flex items-center space-x-1.5 bg-slate-900 p-1.5 rounded border border-emerald-900/50 font-mono text-[10px] text-emerald-300 overflow-x-auto">
                    <span className="text-[10px] text-emerald-500 font-bold shrink-0">Current:</span>
                    <span className="truncate flex-1">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback` : '/api/auth/callback'}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/auth/callback`);
                        showNotice('info', 'Current Redirect URI copied!');
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-200 font-sans text-[10px] shrink-0 border border-emerald-800"
                    >
                      Copy URI
                    </button>
                  </div>

                  {/* Preview Redirect URI */}
                  <div className="flex items-center space-x-1.5 bg-slate-900 p-1.5 rounded border border-slate-800 font-mono text-[10px] text-cyan-300 overflow-x-auto">
                    <span className="text-[10px] text-slate-500 font-bold shrink-0">Preview:</span>
                    <span className="truncate flex-1">
                      https://ais-dev-4rudwnyalwoejvn3czvszv-982797818827.asia-southeast1.run.app/api/auth/callback
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('https://ais-dev-4rudwnyalwoejvn3czvszv-982797818827.asia-southeast1.run.app/api/auth/callback');
                        showNotice('info', 'Preview Redirect URI copied!');
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-white font-sans text-[10px] shrink-0"
                    >
                      Copy URI
                    </button>
                  </div>

                  {/* Shared/Production Redirect URI */}
                  <div className="flex items-center space-x-1.5 bg-slate-900 p-1.5 rounded border border-slate-800 font-mono text-[10px] text-cyan-300 overflow-x-auto">
                    <span className="text-[10px] text-slate-500 font-bold shrink-0">Shared:</span>
                    <span className="truncate flex-1">
                      https://ais-pre-4rudwnyalwoejvn3czvszv-982797818827.asia-southeast1.run.app/api/auth/callback
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('https://ais-pre-4rudwnyalwoejvn3czvszv-982797818827.asia-southeast1.run.app/api/auth/callback');
                        showNotice('info', 'Shared Redirect URI copied!');
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-white font-sans text-[10px] shrink-0"
                    >
                      Copy URI
                    </button>
                  </div>
                </div>

                {/* Section B: Authorized JavaScript Origins (Only required if using Popup mode) */}
                <div className="space-y-1.5 pt-2 border-t border-slate-900">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-amber-400">
                      2. Authorized JavaScript origins (Popup Flow Only)
                    </span>
                    <span className="text-[10px] text-slate-500">Origin only (NO /path)</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    If you prefer Google Popup mode, add these under <strong>Authorized JavaScript origins</strong>:
                  </p>

                  {/* Active Origin */}
                  <div className="flex items-center space-x-1.5 bg-slate-900 p-1.5 rounded border border-amber-900/50 font-mono text-[10px] text-amber-300 overflow-x-auto">
                    <span className="text-[10px] text-amber-500 font-bold shrink-0">Current:</span>
                    <span className="truncate flex-1">
                      {typeof window !== 'undefined' ? window.location.origin : ''}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin);
                        showNotice('info', 'Current Origin copied!');
                      }}
                      className="px-2 py-0.5 rounded bg-amber-950 hover:bg-amber-900 text-amber-200 font-sans text-[10px] shrink-0 border border-amber-800"
                    >
                      Copy Origin
                    </button>
                  </div>
                </div>

                {/* Live Diagnostic Inspector Toggle */}
                <div className="pt-2 border-t border-slate-900">
                  <button
                    onClick={() => {
                      if (!showDiagnostics) fetchDiagnostics();
                      setShowDiagnostics(!showDiagnostics);
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center justify-between border border-slate-800 transition-colors"
                  >
                    <span className="flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{showDiagnostics ? 'Hide Live OAuth Diagnostics' : 'Inspect Live OAuth & Origin Diagnostics'}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {showDiagnostics ? '▲ Collapse' : '▼ Expand'}
                    </span>
                  </button>

                  {showDiagnostics && (
                    <div className="mt-2.5 p-3 rounded-lg bg-slate-950 border border-cyan-900/40 text-[10px] space-y-2 animate-in fade-in">
                      <div className="font-bold text-cyan-300 text-xs">Live System OAuth Diagnostics:</div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block">Active Client ID:</span>
                          <span className="font-mono text-slate-200 break-all">
                            {diagnosticsData?.clientIdMasked || status?.auth.clientIdMasked || (customClientId ? `${customClientId.slice(0, 10)}...` : 'Not saved')}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block">Client Secret:</span>
                          <span className="font-mono text-emerald-400">
                            {status?.auth.hasClientSecret ? '✓ Securely Saved on Server' : 'Missing'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block">Target Account:</span>
                          <span className="font-mono text-amber-300">ukusa2439@gmail.com</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block">Active Origin:</span>
                          <span className="font-mono text-cyan-300 truncate block">
                            {typeof window !== 'undefined' ? window.location.origin : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Safe Recent Auth Activity Logs */}
                      {diagnosticsData?.safeRecentLogs && diagnosticsData.safeRecentLogs.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-900">
                          <span className="text-slate-400 font-semibold block mb-1">Recent Auth Events (Sanitized):</span>
                          <div className="space-y-1 font-mono text-[9px] max-h-28 overflow-y-auto">
                            {diagnosticsData.safeRecentLogs.map((log: any, idx: number) => (
                              <div key={idx} className="p-1 rounded bg-black/40 text-slate-300 border border-slate-900 flex items-start space-x-1.5">
                                <span className="text-slate-500 shrink-0">
                                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className={log.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}>
                                  [{log.type.toUpperCase()}]
                                </span>
                                <span className="flex-1 break-words">{log.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2. Automated Daily Scheduler Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">
                2. Daily Automated Uploads
              </h2>
            </div>
            <button
              onClick={handleToggleScheduler}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                status?.scheduler.enabled
                  ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {status?.scheduler.enabled ? 'ACTIVE' : 'PAUSED'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Slot 1 (Morning)</div>
              <div className="text-base font-extrabold text-amber-400 font-mono">03:00 PKT</div>
              <div className="text-[10px] text-slate-500">22:00 UTC (prev day)</div>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Slot 2 (Afternoon)</div>
              <div className="text-base font-extrabold text-amber-400 font-mono">16:00 PKT</div>
              <div className="text-[10px] text-slate-500">11:00 UTC</div>
            </div>
          </div>

          {/* Next Slot Countdown Banner */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-950 to-emerald-950/40 border border-cyan-800/30 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <span className="text-slate-400">Next Scheduled Upload: </span>
                <span className="font-bold text-white">{status?.scheduler.nextScheduledSlot || '03:00 PKT'}</span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
              Server Autonomous
            </span>
          </div>

          {/* Privacy Level Selector */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Default Upload Privacy:</span>
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => handleChangePrivacy('private')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  status?.scheduler.privacyStatus === 'private'
                    ? 'bg-amber-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Private (Safe)
              </button>
              <button
                onClick={() => handleChangePrivacy('unlisted')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  status?.scheduler.privacyStatus === 'unlisted'
                    ? 'bg-amber-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Unlisted
              </button>
              <button
                onClick={() => handleChangePrivacy('public')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  status?.scheduler.privacyStatus === 'public'
                    ? 'bg-amber-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Public
              </button>
            </div>
          </div>
        </section>

        {/* 3. Real-Time Generator (One-Tap Test & Creation) */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">
                3. Create MrBeast Challenge Short
              </h2>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                status?.system.hasGeminiKey
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
              }`}>
                {status?.system.hasGeminiKey ? '✨ Gemini AI' : '📁 Built-in Templates'}
              </span>
              <span className="text-[11px] font-mono text-cyan-400">9:16</span>
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Custom challenge concept (or leave empty for AI pick)..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Active Generation Progress Indicator */}
          {activeJob && (
            <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 space-y-2.5 animate-pulse">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span className="font-bold text-white">{activeJob.statusMessage}</span>
                </div>
                <span className="font-mono text-amber-400 font-bold">{activeJob.progress}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-red-500 h-2 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(5, activeJob.progress)}%` }}
                />
              </div>

              {activeJob.script && (
                <div className="text-[11px] text-slate-400 truncate">
                  🎬 <span className="text-slate-200 font-medium">{activeJob.script.title}</span>
                </div>
              )}
            </div>
          )}

          {/* Primary Action Button */}
          <div className="flex space-x-2">
            <button
              onClick={() => handleGenerateNow(true)}
              disabled={actionLoading || !!activeJob}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-400 hover:to-red-400 active:scale-[0.99] text-black font-extrabold text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all"
            >
              <Sparkles className="w-4 h-4 shrink-0 text-black" />
              <span>{isChannelConnected ? 'Generate & Upload to YouTube Now' : 'Generate Test Short Video'}</span>
            </button>
          </div>
        </section>

        {/* 4. Generated Shorts Library & Player */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Video Library & Upload History ({jobs.length})</span>
            </h2>
            <button
              onClick={fetchState}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-8 text-center space-y-2">
              <Youtube className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">No Shorts generated yet</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Tap the button above to generate your first 9:16 MrBeast challenge video and test upload.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start space-x-3">
                    {/* Thumbnail Preview */}
                    <div
                      onClick={() => setSelectedVideo(job)}
                      className="relative w-16 h-28 bg-slate-950 rounded-xl overflow-hidden shrink-0 border border-slate-800 cursor-pointer group"
                    >
                      {job.thumbnailFilename ? (
                        <img
                          src={`/api/videos/thumb/${job.id}`}
                          alt="Thumbnail"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900 text-[10px] text-slate-600">
                          9:16
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-amber-400 fill-amber-400" />
                      </div>
                      <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono font-bold text-white px-1 rounded">
                        {job.durationSec ? `${job.durationSec}s` : '45s'}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <h3
                        onClick={() => setSelectedVideo(job)}
                        className="text-xs font-bold text-white hover:text-amber-400 cursor-pointer line-clamp-2 leading-snug"
                      >
                        {job.script?.title || 'MrBeast Challenge Short'}
                      </h3>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="text-slate-400 font-mono">
                          {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {job.youtubeUrl ? (
                          <a
                            href={job.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 font-semibold hover:bg-red-600/30 border border-red-500/30"
                          >
                            <Youtube className="w-3 h-3" />
                            <span>Watch on YouTube</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : job.status === 'ready' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            Ready locally
                          </span>
                        ) : job.status === 'uploading' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                            Uploading...
                          </span>
                        ) : (
                          <span className="text-slate-500">{job.status}</span>
                        )}
                      </div>

                      {job.script?.hook && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 italic">
                          "{job.script.hook}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/80">
                    <button
                      onClick={() => setSelectedVideo(job)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center space-x-1.5 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>Preview</span>
                    </button>

                    {!job.youtubeUrl && job.status === 'ready' && isChannelConnected && (
                      <button
                        onClick={() => handleUploadJob(job.id)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white flex items-center space-x-1.5 shadow-sm transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 5. Activity Log Drawer Toggle */}
        <section className="pt-2">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:bg-slate-850 text-slate-400 text-xs font-semibold flex items-center justify-between transition-colors"
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Server Activity Logs ({logs.length})</span>
            </div>
            {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showLogs && (
            <div className="mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-60 overflow-y-auto font-mono text-[11px] space-y-1.5 text-slate-400">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-2 border-b border-slate-900 pb-1">
                  <span className="text-slate-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`font-bold shrink-0 uppercase text-[9px] px-1 rounded ${
                      log.type === 'error'
                        ? 'bg-rose-950 text-rose-400'
                        : log.type === 'upload'
                        ? 'bg-red-950 text-red-400'
                        : log.type === 'auth'
                        ? 'bg-cyan-950 text-cyan-400'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {log.type}
                  </span>
                  <span className="text-slate-300 break-words flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Video Preview Modal (Mobile 9:16 Player) */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-xs text-white truncate max-w-[240px]">
                {selectedVideo.script?.title || 'Short Preview'}
              </h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex flex-col items-center space-y-3 overflow-y-auto">
              {/* 9:16 Video Canvas */}
              <div className="w-[240px] h-[426px] bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 relative">
                <video
                  src={`/api/videos/file/${selectedVideo.id}`}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="w-full space-y-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] space-y-1">
                  <div className="text-slate-400">
                    <span className="font-bold text-slate-200">Duration:</span> {selectedVideo.durationSec}s
                  </div>
                  <div className="text-slate-400">
                    <span className="font-bold text-slate-200">Format:</span> 720x1280 (9:16 Vertical Shorts)
                  </div>
                  {selectedVideo.youtubeUrl && (
                    <div className="text-slate-400 flex items-center space-x-1.5">
                      <span className="font-bold text-slate-200">YouTube:</span>
                      <a
                        href={selectedVideo.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 underline font-semibold flex items-center space-x-1"
                      >
                        <span>Open Video</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <a
                    href={`/api/videos/file/${selectedVideo.id}`}
                    download={selectedVideo.videoFilename || 'short.mp4'}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-center font-bold text-slate-200 transition-colors"
                  >
                    Download MP4
                  </a>

                  {!selectedVideo.youtubeUrl && isChannelConnected && (
                    <button
                      onClick={() => {
                        handleUploadJob(selectedVideo.id);
                        setSelectedVideo(null);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-center font-bold text-white transition-colors flex items-center justify-center space-x-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Now</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup Guide Modal */}
      {showSetupGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-base text-white">How This App Works (100% Free)</h3>
              </div>
              <button
                onClick={() => setShowSetupGuide(false)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-bold text-amber-400 flex items-center space-x-1.5">
                  <span>1. Official Google OAuth Setup</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Tap "Connect YouTube Channel with Google". You grant official YouTube upload permission once. The server stores your authorized connection securely.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                  <span>2. 100% Free Video Generation Engine</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  No paid AI video APIs required (zero credit card needed). The app renders genuine 9:16 vertical video using built-in high-performance FFmpeg, vector motion graphics, and speech synthesis.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-bold text-cyan-400 flex items-center space-x-1.5">
                  <span>3. Server-Side Scheduler (Asia/Karachi)</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  The scheduler runs on the server 24/7 at 03:00 and 16:00 PKT. It continues running even when your Android phone is asleep or completely turned off.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-bold text-indigo-400 flex items-center space-x-1.5">
                  <span>4. YouTube Free Limits Transparency</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  YouTube Data API v3 provides 10,000 free quota units per day. Uploading 2 Shorts daily uses ~3,200 units, well under YouTube's free quota!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowSetupGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal (API Keys, Unattended Refresh Credentials & Cron Webhook) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-base text-white">Settings & Credentials</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Vercel Existing Sites Safety Guarantee */}
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs space-y-1">
              <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Existing Vercel Websites Safe</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Your existing websites on Vercel are 100% untouched. This application operates entirely isolated. No deployments will modify your other projects.
              </p>
            </div>

            {/* 1. Free Gemini API Key */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white">Google Gemini API Key (Optional)</span>
                {status?.system.hasGeminiKey ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Using Built-in Templates
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                When provided, Gemini AI generates 100% original, unique challenge concepts. Without a key, it uses our curated library of 30+ MrBeast viral templates at zero cost.
              </p>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  placeholder="Paste Gemini API key..."
                  className="flex-1 bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                />
                <button
                  onClick={handleSaveGeminiKey}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            {/* 2. Permanent Google Cloud OAuth (Web Client 5) */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white">Google Cloud YouTube OAuth (Web Client 5)</span>
                {status?.auth.connected ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Connected & Verified
                  </span>
                ) : status?.auth.hasRefreshToken ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Refresh Token Saved
                  </span>
                ) : status?.auth.hasClientId ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Client ID Saved
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                    Not Configured
                  </span>
                )}
              </div>

              {/* Diagnostic Box if verification failed */}
              {status?.auth.lastVerificationError && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-[11px] text-rose-200 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>OAuth Diagnostic Notice</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed break-words text-[11px]">
                    {status.auth.lastVerificationError}
                  </p>
                </div>
              )}

              {/* Step 1: Client ID & Secret */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Step 1: Save Web Client 5 Credentials</span>
                  {status?.auth.hasClientId && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {status?.auth.clientIdMasked || 'Client ID Saved'}
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  placeholder={status?.auth.hasClientId ? '•••••••• (Client ID saved on server - enter new to replace)' : 'Paste Web Client 5 Client ID (.apps.googleusercontent.com)'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                />
                <input
                  type="password"
                  value={customClientSecret}
                  onChange={(e) => setCustomClientSecret(e.target.value)}
                  placeholder={status?.auth.hasClientSecret ? '•••••••• (Client Secret saved on server - enter new to replace)' : 'Paste Web Client 5 Client Secret'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                />

                <button
                  onClick={handleSaveClientOnly}
                  disabled={actionLoading}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5 border border-slate-700/60"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save Client ID & Secret to Server</span>
                </button>
              </div>

              {/* Step 2: 1-Tap Google Authorization (Easiest & Solves 401 unauthorized_client) */}
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-amber-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Step 2: 1-Tap Connect with Google (Recommended)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Connects directly to Google OAuth using your Web Client 5. Google issues a 100% matched refresh token automatically with zero copy-pasting.
                </p>
                <button
                  onClick={handleConnectYouTube}
                  disabled={actionLoading || (!status?.auth.hasClientId && !customClientId.trim())}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs transition-colors shadow-sm flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Youtube className="w-4 h-4 shrink-0" />
                  <span>Connect My YouTube Channel</span>
                </button>
              </div>

              {/* Step 3 (Optional): Manual Refresh Token */}
              <div className="space-y-1.5 pt-1 border-t border-slate-900">
                <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                  <span>Alternative: Manual Refresh Token (Optional)</span>
                  {status?.auth.hasRefreshToken && (
                    <span className="text-[10px] text-emerald-400 font-semibold">Token Saved</span>
                  )}
                </div>
                <input
                  type="password"
                  value={customRefreshToken}
                  onChange={(e) => setCustomRefreshToken(e.target.value)}
                  placeholder={status?.auth.hasRefreshToken ? '•••••••• (Refresh Token saved on server)' : 'Google OAuth Refresh Token (1//...)'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                />

                <div className="flex space-x-2 pt-0.5">
                  <button
                    onClick={handleSaveCustomOAuth}
                    disabled={actionLoading}
                    className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-1 border border-slate-700/60"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Verify & Save Token</span>
                  </button>

                  {status?.auth.hasRefreshToken && (
                    <button
                      onClick={handleVerifySavedCredentials}
                      disabled={actionLoading}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors flex items-center justify-center space-x-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${actionLoading ? 'animate-spin' : ''}`} />
                      <span>Test Live API</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Google Cloud Console Setup Helper */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1.5">
                <div className="font-bold text-slate-300 flex items-center justify-between">
                  <span>Google Cloud Console Web Client 5 Settings</span>
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Add this URI to Google Cloud Console → APIs & Services → Credentials → Web Client 5 → "Authorized redirect URIs":
                </p>

                <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded border border-slate-800 font-mono text-[10px] text-cyan-300 overflow-x-auto">
                  <span className="truncate flex-1">
                    {status?.auth.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback` : '/api/auth/callback')}
                  </span>
                  <button
                    onClick={() => {
                      const uri = status?.auth.redirectUri || `${window.location.origin}/api/auth/callback`;
                      navigator.clipboard.writeText(uri);
                      showNotice('success', 'Authorized Redirect URI copied!');
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-sans shrink-0 font-semibold"
                  >
                    Copy URI
                  </button>
                </div>
              </div>
            </div>

            {/* 3. External Cron Webhook Endpoint */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-xs text-white">External Cron Webhook URL</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Use this endpoint with free <span className="text-cyan-400 font-semibold">cron-job.org</span> or GitHub Actions to wake the server at 03:00 & 16:00 PKT:
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center space-x-1.5 bg-slate-900 p-2 rounded-lg border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto">
                  <span className="truncate flex-1">{typeof window !== 'undefined' ? `${window.location.origin}/api/cron/trigger` : '/api/cron/trigger'}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/cron/trigger`);
                      showNotice('success', 'Cron Webhook URL copied!');
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-sans shrink-0 font-semibold"
                  >
                    Copy URL
                  </button>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Header: <code className="text-amber-400">x-cron-secret</code></span>
                    <button
                      onClick={() => {
                        if (status?.scheduler.cronSecret) {
                          navigator.clipboard.writeText(status.scheduler.cronSecret);
                          showNotice('success', 'Cron Secret copied to clipboard!');
                        }
                      }}
                      className="text-amber-400 hover:underline font-bold text-[10px]"
                    >
                      Copy Secret
                    </button>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 truncate">
                    {status?.scheduler.cronSecret || 'Auto-generated on server'}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
