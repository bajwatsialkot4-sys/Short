export interface SceneData {
  index: number;
  durationSec: number;
  narration: string;
  headline: string;
  badgeText: string;
  statNumber: string;
  statLabel: string;
  accentColor: string;
  subColor: string;
  theme: 'money_vault' | 'lava_survival' | 'circle_challenge' | 'underground_bunker' | 'freeze_ice';
  visualType?: 'hook_intro' | 'elimination_stage' | 'extreme_hazard' | 'countdown_duel' | 'victory_celebration';
  visualElements?: string[];
  cameraMotion?: 'punch_zoom' | 'pan_left' | 'pan_right' | 'fast_zoom_out' | 'dramatic_shake';
  soundEffect?: 'whoosh_bass' | 'siren_alert' | 'cash_chime' | 'countdown_tick' | 'victory_fanfare';
}

export interface ChallengeScript {
  id: string;
  title: string;
  description: string;
  tags: string[];
  hook: string;
  climax: string;
  scenes: SceneData[];
  estimatedDurationSec: number;
}

export interface VideoJob {
  id: string;
  createdAt: string;
  status: 'idle' | 'generating_script' | 'generating_audio' | 'rendering_scenes' | 'encoding_video' | 'ready' | 'uploading' | 'uploaded' | 'failed';
  progress: number;
  statusMessage: string;
  script?: ChallengeScript;
  videoFilename?: string;
  thumbnailFilename?: string;
  durationSec?: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubePrivacyStatus?: 'private' | 'unlisted' | 'public';
  scheduledPublishTime?: string;
  error?: string;
}

export interface AuthState {
  connected: boolean;
  channelId?: string;
  channelTitle?: string;
  channelHandle?: string;
  channelThumbnail?: string;
  subscribers?: string;
  videoCount?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  accessToken?: string;
  tokenSavedAt?: number;
  expiresAt?: number;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  authMethod?: 'firebase' | 'custom_oauth';
  lastVerifiedAt?: number;
  lastVerificationError?: string;
}

export interface AppSettings {
  geminiApiKey?: string;
  cronSecret?: string;
}

export interface SchedulerConfig {
  enabled: boolean;
  timeSlot1: string; // e.g. "03:00"
  timeSlot2: string; // e.g. "16:00"
  timezone: string;  // "Asia/Karachi"
  privacyStatus: 'private' | 'unlisted' | 'public';
  autoUpload: boolean;
  lastRunDateSlot1?: string;
  lastRunDateSlot2?: string;
  lastRunTimestamp?: number;
  lastRunStatus?: string;
}

export interface SystemStatus {
  ffmpegAvailable: boolean;
  hasGeminiKey: boolean;
  hasCustomOAuth: boolean;
  serverTimeUTC: string;
  karachiTime: string;
  nextScheduledSlot?: string;
  secondsUntilNextSlot?: number;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'auth' | 'scheduler' | 'generation' | 'upload' | 'system' | 'error';
  message: string;
  details?: any;
}
