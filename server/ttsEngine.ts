import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import { loadSettings, logActivity } from './storage.ts';

const execFileAsync = promisify(execFile);

// Get audio duration using ffprobe
export async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const parsed = parseFloat(stdout.trim());
    return isNaN(parsed) ? 10 : parsed;
  } catch (e) {
    return 10;
  }
}

// Free Google TTS fetcher
async function fetchGoogleTranslateTts(text: string, outputPath: string): Promise<boolean> {
  try {
    // Truncate to reasonable chunk
    const encoded = encodeURIComponent(text.slice(0, 200));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encoded}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`TTS response status ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500) {
      throw new Error('TTS buffer too small');
    }

    fs.writeFileSync(outputPath, buffer);
    return true;
  } catch (e: any) {
    console.error('Google Translate TTS error:', e.message);
    return false;
  }
}

// Gemini TTS generator
async function fetchGeminiTts(text: string, outputPath: string): Promise<boolean> {
  const settings = loadSettings();
  const apiKey = (settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 6) return false;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Speak with extreme energy like a MrBeast challenge host: ${text}`,
              speechMetadata: {
                style: 'High energy, fast paced, enthusiastic American male host',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Energetic voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const wavBuffer = Buffer.from(base64Audio, 'base64');
      fs.writeFileSync(outputPath, wavBuffer);
      return true;
    }
  } catch (e: any) {
    console.warn('Gemini TTS warning:', e.message);
  }
  return false;
}

// Synthesize energetic beeps/drum audio fallback if offline
async function generateSyntheticAudioFallback(durationSec: number, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync('/usr/bin/ffmpeg', [
      '-f', 'lavfi',
      '-i', `anoisesrc=d=${durationSec}:c=pink:r=24000:a=0.08`,
      '-f', 'lavfi',
      '-i', `sine=frequency=440:duration=${durationSec}`,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first[aout]',
      '-map', '[aout]',
      '-c:a', 'aac',
      '-y', outputPath,
    ]);
    return true;
  } catch (e) {
    return false;
  }
}

export async function generateSceneAudio(
  text: string,
  targetDurationSec: number,
  outputPath: string
): Promise<{ success: boolean; duration: number }> {
  // 1. Try Gemini TTS
  let generated = await fetchGeminiTts(text, outputPath);

  // 2. Fallback to free Google TTS
  if (!generated) {
    generated = await fetchGoogleTranslateTts(text, outputPath);
  }

  // 3. Fallback to synthetic audio if both fail
  if (!generated) {
    generated = await generateSyntheticAudioFallback(targetDurationSec, outputPath);
  }

  if (generated && fs.existsSync(outputPath)) {
    const duration = await getAudioDuration(outputPath);
    return { success: true, duration: Math.max(duration, 5) };
  }

  return { success: false, duration: targetDurationSec };
}
