import { generateChallengeScript } from './scriptEngine.ts';
import { renderShortVideo } from './videoRenderer.ts';
import { uploadVideoToYouTube } from './youtubeUploader.ts';
import { addJob, loadAuthState, loadSchedulerConfig, logActivity, saveSchedulerConfig, updateJob } from './storage.ts';
import { VideoJob } from './types.ts';

let schedulerInterval: NodeJS.Timeout | null = null;
let isJobRunning = false;

// Get date and time parts in Asia/Karachi
export function getKarachiTime(): { dateStr: string; timeStr: string; hour: number; minute: number } {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const partMap: Record<string, string> = {};
  parts.forEach(p => (partMap[p.type] = p.value));

  const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const timeStr = `${partMap.hour}:${partMap.minute}`;

  return {
    dateStr,
    timeStr,
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
  };
}

// Calculate the next scheduled slot and remaining seconds
export function getNextSlotInfo(): { nextSlot: string; secondsRemaining: number } {
  const config = loadSchedulerConfig();
  const { dateStr, hour, minute } = getKarachiTime();

  const [s1H, s1M] = config.timeSlot1.split(':').map(Number);
  const [s2H, s2M] = config.timeSlot2.split(':').map(Number);

  const currentMinutes = hour * 60 + minute;
  const slot1Minutes = s1H * 60 + s1M;
  const slot2Minutes = s2H * 60 + s2M;

  let targetMinutes = 0;
  let isNextDay = false;

  if (currentMinutes < slot1Minutes) {
    targetMinutes = slot1Minutes;
  } else if (currentMinutes < slot2Minutes) {
    targetMinutes = slot2Minutes;
  } else {
    targetMinutes = slot1Minutes;
    isNextDay = true;
  }

  let diffMinutes = targetMinutes - currentMinutes;
  if (isNextDay) {
    diffMinutes += 24 * 60;
  }

  const secondsRemaining = Math.max(0, diffMinutes * 60);
  const targetHour = Math.floor(targetMinutes / 60).toString().padStart(2, '0');
  const targetMin = (targetMinutes % 60).toString().padStart(2, '0');

  return {
    nextSlot: `${targetHour}:${targetMin} PKT ${isNextDay ? '(Tomorrow)' : '(Today)'}`,
    secondsRemaining,
  };
}

// Run the full automated pipeline: Script -> Audio -> Video -> YouTube Upload
export async function runAutomatedPipeline(
  topic?: string,
  forceUpload: boolean = false
): Promise<VideoJob> {
  if (isJobRunning) {
    throw new Error('Another generation job is currently in progress. Please wait.');
  }

  isJobRunning = true;
  const jobId = `job_${Date.now()}`;
  const auth = loadAuthState();
  const config = loadSchedulerConfig();

  const job: VideoJob = {
    id: jobId,
    createdAt: new Date().toISOString(),
    status: 'generating_script',
    progress: 5,
    statusMessage: 'Creating high-energy MrBeast challenge script...',
    youtubePrivacyStatus: config.privacyStatus || 'private',
  };

  addJob(job);
  logActivity('generation', `[JOB ${jobId}] Started automated generation pipeline`);

  try {
    // 1. Script Generation
    const script = await generateChallengeScript(topic);
    job.script = script;
    updateJob(jobId, {
      script,
      status: 'generating_audio',
      progress: 20,
      statusMessage: `Script created: "${script.title}". Synthesizing voiceover...`,
    });

    // 2. Video Rendering
    const { videoFilename, thumbnailFilename, durationSec } = await renderShortVideo(
      job,
      (progress, message) => {
        updateJob(jobId, { progress, statusMessage: message });
      }
    );

    job.videoFilename = videoFilename;
    job.thumbnailFilename = thumbnailFilename;
    job.durationSec = durationSec;

    // Immediately persist filenames
    updateJob(jobId, {
      videoFilename,
      thumbnailFilename,
      durationSec,
    });

    // 3. YouTube Upload if enabled/connected
    const shouldUpload = (config.autoUpload || forceUpload) && auth.connected && auth.accessToken;

    if (shouldUpload) {
      updateJob(jobId, {
        status: 'uploading',
        progress: 85,
        statusMessage: 'Uploading to connected YouTube channel...',
        videoFilename,
        thumbnailFilename,
        durationSec,
      });

      try {
        const { videoId, youtubeUrl } = await uploadVideoToYouTube(
          job,
          config.privacyStatus || 'private',
          undefined,
          (percent, msg) => {
            updateJob(jobId, { progress: Math.min(99, 85 + Math.floor(percent * 0.14)), statusMessage: msg });
          }
        );

        updateJob(jobId, {
          status: 'uploaded',
          progress: 100,
          statusMessage: `Uploaded to YouTube: ${youtubeUrl}`,
          youtubeVideoId: videoId,
          youtubeUrl,
          videoFilename,
          thumbnailFilename,
          durationSec,
        });

        logActivity('upload', `[JOB ${jobId}] Finished upload: ${youtubeUrl}`);
      } catch (uploadErr: any) {
        logActivity('error', `[JOB ${jobId}] Upload warning: ${uploadErr.message}`);
        updateJob(jobId, {
          status: 'ready',
          progress: 100,
          statusMessage: `Video ready locally. YouTube upload notice: ${uploadErr.message}`,
          error: uploadErr.message,
          videoFilename,
          thumbnailFilename,
          durationSec,
        });
      }
    } else {
      updateJob(jobId, {
        status: 'ready',
        progress: 100,
        statusMessage: auth.connected
          ? 'Video ready! Ready to upload.'
          : 'Video created locally! Connect YouTube to enable automatic upload.',
        videoFilename,
        thumbnailFilename,
        durationSec,
      });
      logActivity('generation', `[JOB ${jobId}] Video created and ready in library.`);
    }

    return job;
  } catch (err: any) {
    updateJob(jobId, {
      status: 'failed',
      progress: 0,
      statusMessage: `Generation failed: ${err.message}`,
      error: err.message,
    });
    logActivity('error', `[JOB ${jobId}] Pipeline failed: ${err.message}`);
    throw err;
  } finally {
    isJobRunning = false;
  }
}

// Scheduler check routine executed every 30 seconds
async function checkSchedule(): Promise<void> {
  const config = loadSchedulerConfig();
  if (!config.enabled) return;
  if (isJobRunning) return;

  const { dateStr, timeStr } = getKarachiTime();

  // Check Slot 1 (03:00 PKT)
  if (timeStr === config.timeSlot1 && config.lastRunDateSlot1 !== dateStr) {
    logActivity('scheduler', `[SCHEDULER] Triggering morning slot (${config.timeSlot1} PKT) on ${dateStr}`);
    config.lastRunDateSlot1 = dateStr;
    config.lastRunTimestamp = Date.now();
    config.lastRunStatus = `Slot 1 (${config.timeSlot1} PKT) started`;
    saveSchedulerConfig(config);

    try {
      await runAutomatedPipeline(undefined, true);
      config.lastRunStatus = `Slot 1 (${config.timeSlot1} PKT) succeeded`;
      saveSchedulerConfig(config);
    } catch (e: any) {
      config.lastRunStatus = `Slot 1 failed: ${e.message}`;
      saveSchedulerConfig(config);
    }
  }

  // Check Slot 2 (16:00 PKT)
  if (timeStr === config.timeSlot2 && config.lastRunDateSlot2 !== dateStr) {
    logActivity('scheduler', `[SCHEDULER] Triggering afternoon slot (${config.timeSlot2} PKT) on ${dateStr}`);
    config.lastRunDateSlot2 = dateStr;
    config.lastRunTimestamp = Date.now();
    config.lastRunStatus = `Slot 2 (${config.timeSlot2} PKT) started`;
    saveSchedulerConfig(config);

    try {
      await runAutomatedPipeline(undefined, true);
      config.lastRunStatus = `Slot 2 (${config.timeSlot2} PKT) succeeded`;
      saveSchedulerConfig(config);
    } catch (e: any) {
      config.lastRunStatus = `Slot 2 failed: ${e.message}`;
      saveSchedulerConfig(config);
    }
  }
}

export function startScheduler(): void {
  if (schedulerInterval) return;

  logActivity('scheduler', 'Server-side automated scheduler started (Asia/Karachi timezone, 03:00 & 16:00 PKT)');
  // Check every 30 seconds
  schedulerInterval = setInterval(checkSchedule, 30 * 1000);
  if (schedulerInterval && typeof schedulerInterval.unref === 'function') {
    schedulerInterval.unref();
  }
  // Initial check
  checkSchedule();
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logActivity('scheduler', 'Server-side scheduler stopped.');
  }
}
