import fs from 'fs';
import path from 'path';
import { AuthState, SchedulerConfig, VideoJob, ActivityLog } from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MEDIA_DIR = path.resolve(DATA_DIR, 'media');

const AUTH_FILE = path.join(DATA_DIR, 'auth-state.json');
const SCHEDULER_FILE = path.join(DATA_DIR, 'scheduler-config.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

ensureDirs();

import crypto from 'crypto';

export function loadSettings(): { geminiApiKey?: string; cronSecret?: string } {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (!data.cronSecret) {
        data.cronSecret = `cron_${crypto.randomBytes(16).toString('hex')}`;
        saveSettings(data);
      }
      return data;
    }
  } catch (e) {
    console.error('Error reading settings:', e);
  }
  const defaultSettings = {
    cronSecret: `cron_${crypto.randomBytes(16).toString('hex')}`,
  };
  saveSettings(defaultSettings);
  return defaultSettings;
}

export function saveSettings(settings: { geminiApiKey?: string; cronSecret?: string }): void {
  ensureDirs();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getMediaDir(): string {
  ensureDirs();
  return MEDIA_DIR;
}

export function loadAuthState(): AuthState {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading auth state:', e);
  }
  return { connected: false };
}

export function saveAuthState(state: AuthState): void {
  ensureDirs();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function updateAuthState(updates: Partial<AuthState>): AuthState {
  const current = loadAuthState();
  const updated: AuthState = { ...current, ...updates };
  saveAuthState(updated);
  return updated;
}

export function loadSchedulerConfig(): SchedulerConfig {
  try {
    if (fs.existsSync(SCHEDULER_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULER_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading scheduler config:', e);
  }
  return {
    enabled: true,
    timeSlot1: '03:00',
    timeSlot2: '16:00',
    timezone: 'Asia/Karachi',
    privacyStatus: 'private',
    autoUpload: true,
  };
}

export function saveSchedulerConfig(config: SchedulerConfig): void {
  ensureDirs();
  fs.writeFileSync(SCHEDULER_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function loadJobs(): VideoJob[] {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading jobs:', e);
  }
  return [];
}

export function saveJobs(jobs: VideoJob[]): void {
  ensureDirs();
  // Keep last 50 jobs
  const trimmed = jobs.slice(-50);
  fs.writeFileSync(JOBS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}

export function updateJob(jobId: string, updates: Partial<VideoJob>): VideoJob | undefined {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], ...updates };
    saveJobs(jobs);
    return jobs[idx];
  }
  return undefined;
}

export function addJob(job: VideoJob): void {
  const jobs = loadJobs();
  jobs.unshift(job);
  saveJobs(jobs);
}

export function loadLogs(): ActivityLog[] {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading logs:', e);
  }
  return [];
}

export function logActivity(type: ActivityLog['type'], message: string, details?: any): void {
  ensureDirs();
  const logs = loadLogs();
  const newLog: ActivityLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
  };
  logs.unshift(newLog);
  // Keep last 100 logs
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs.slice(0, 100), null, 2), 'utf-8');
  console.log(`[${newLog.type.toUpperCase()}] ${message}`);
}
