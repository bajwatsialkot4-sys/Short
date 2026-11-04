import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Procedural Audio Master for YouTube Shorts
 * Generates 100% royalty-free, legal sound effects and energetic background tension
 * using FFmpeg audio synthesis oscillators and filters.
 */

// Generate a fast cinematic whoosh transition sound effect (0.4s)
export async function generateWhooshSfx(outputPath: string): Promise<string> {
  // White noise with sweeping bandpass filter and volume envelope
  await execFileAsync('/usr/bin/ffmpeg', [
    '-f', 'lavfi',
    '-i', 'anoisesrc=d=0.45:c=white:r=44100:a=0.3',
    '-af', 'bandpass=f=1200:w=800,afade=t=in:ss=0:d=0.15,afade=t=out:st=0.25:d=0.2,volume=1.5',
    '-c:a', 'pcm_s16le',
    '-y', outputPath,
  ]);
  return outputPath;
}

// Generate an explosive cinematic bass boom / sub-drop (0.7s)
export async function generateBoomSfx(outputPath: string): Promise<string> {
  // Low frequency oscillator with fast exponential pitch drop from 120Hz to 40Hz
  await execFileAsync('/usr/bin/ffmpeg', [
    '-f', 'lavfi',
    '-i', 'sine=frequency=110:duration=0.6:sample_rate=44100',
    '-f', 'lavfi',
    '-i', 'anoisesrc=d=0.6:c=pink:r=44100:a=0.2',
    '-filter_complex', '[0:a]asetrate=44100*0.75,volume=2.0,afade=t=out:st=0.1:d=0.45[sub];[1:a]lowpass=f=200,afade=t=out:st=0.05:d=0.35,volume=1.2[noise];[sub][noise]amix=inputs=2[out]',
    '-map', '[out]',
    '-c:a', 'pcm_s16le',
    '-y', outputPath,
  ]);
  return outputPath;
}

// Generate a cash register / prize chime sound effect (0.5s)
export async function generateCashChimeSfx(outputPath: string): Promise<string> {
  // Dual high-frequency crystal bell chime
  await execFileAsync('/usr/bin/ffmpeg', [
    '-f', 'lavfi',
    '-i', 'sine=frequency=2093:duration=0.5:sample_rate=44100', // C7
    '-f', 'lavfi',
    '-i', 'sine=frequency=3135:duration=0.5:sample_rate=44100', // G7
    '-filter_complex', '[0:a]afade=t=out:st=0.05:d=0.4,volume=0.8[c];[1:a]afade=t=out:st=0.08:d=0.38,volume=0.6[g];[c][g]amix=inputs=2[out]',
    '-map', '[out]',
    '-c:a', 'pcm_s16le',
    '-y', outputPath,
  ]);
  return outputPath;
}

// Generate a dramatic challenge buzzer / alert sound effect (0.4s)
export async function generateBuzzerSfx(outputPath: string): Promise<string> {
  await execFileAsync('/usr/bin/ffmpeg', [
    '-f', 'lavfi',
    '-i', 'sine=frequency=320:duration=0.4:sample_rate=44100',
    '-af', 'volume=1.5,aecho=0.8:0.4:20:0.3,afade=t=out:st=0.25:d=0.15',
    '-c:a', 'pcm_s16le',
    '-y', outputPath,
  ]);
  return outputPath;
}

// Generate an energetic, high-tempo challenge backing track (128 BPM driving beat + tension pulse)
export async function generateChallengeMusicTrack(durationSec: number, outputPath: string): Promise<string> {
  // Synthesizes a clean rhythmic bass tension pulse + hi-hat ticking that creates drive
  await execFileAsync('/usr/bin/ffmpeg', [
    // Layer 1: Sub tension bass rumble
    '-f', 'lavfi',
    '-i', `anoisesrc=d=${durationSec}:c=pink:r=44100:a=0.08`,
    // Layer 2: Rhythmic pulse oscillator (128 BPM = ~2.13 Hz tremolo pulse)
    '-f', 'lavfi',
    '-i', `sine=frequency=75:duration=${durationSec}:sample_rate=44100`,
    '-filter_complex', `[0:a]lowpass=f=180,volume=0.5[sub];[1:a]tremolo=f=4.26:d=0.85,volume=0.6[pulse];[sub][pulse]amix=inputs=2:duration=first[out]`,
    '-map', '[out]',
    '-c:a', 'pcm_s16le',
    '-y', outputPath,
  ]);
  return outputPath;
}
