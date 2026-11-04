import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ChallengeScript, SceneData, VideoJob } from './types.ts';
import { generateSceneAudio } from './ttsEngine.ts';
import { getMediaDir, logActivity } from './storage.ts';
import {
  generateWhooshSfx,
  generateBoomSfx,
  generateCashChimeSfx,
  generateBuzzerSfx,
  generateChallengeMusicTrack,
} from './audioMaster.ts';

const execFileAsync = promisify(execFile);

// Helper to escape XML special characters
function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Word wrapper for dynamic subtitles
function wrapText(text: string, maxCharsPerLine: number = 22): string[] {
  const words = (text || '').split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3);
}

// Generate random visual seed hash to ensure every video has unique textures and layouts
function getVisualSeed(jobId: string, sceneIndex: number): number {
  let hash = sceneIndex * 31;
  for (let i = 0; i < jobId.length; i++) {
    hash = (hash << 5) - hash + jobId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Generate Sunburst speed lines for high-energy hook scenes
function generateSpeedLines(cx: number, cy: number, count: number = 16, radius: number = 700): string {
  let rays = '';
  const angleStep = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const a1 = i * angleStep;
    const a2 = a1 + angleStep * 0.45;
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy + Math.sin(a1) * radius;
    const x2 = cx + Math.cos(a2) * radius;
    const y2 = cy + Math.sin(a2) * radius;
    rays += `<polygon points="${cx},${cy} ${x1},${y1} ${x2},${y2}" fill="rgba(255, 230, 0, 0.07)" />`;
  }
  return rays;
}

// SCENE 0: EXPLOSIVE 2-SECOND HOOK SCENE
function renderHookSceneSvg(scene: SceneData, totalScenes: number, script: ChallengeScript, seed: number): string {
  const accent = scene.accentColor || '#10B981';
  const sub = scene.subColor || '#059669';
  const headline = escapeXml(scene.headline);
  const badge = escapeXml(scene.badgeText);
  const stat = escapeXml(scene.statNumber);
  const statLabel = escapeXml(scene.statLabel);
  const captionLines = wrapText(scene.narration, 20).map(l => escapeXml(l));

  // Determine visual centerpiece based on theme
  let centerpieceSvg = '';
  if (scene.theme === 'money_vault') {
    centerpieceSvg = `
      <!-- 3D Metallic Vault Door & Cash Stacks -->
      <g transform="translate(360, 520)">
        <!-- Vault Outer Frame -->
        <circle cx="0" cy="0" r="160" fill="#1E293B" stroke="#475569" stroke-width="12" />
        <circle cx="0" cy="0" r="130" fill="#0F172A" stroke="${accent}" stroke-width="8" stroke-dasharray="24,12" />
        
        <!-- Vault Locking Bolts -->
        <rect x="-155" y="-12" width="24" height="24" rx="4" fill="#E2E8F0"/>
        <rect x="131" y="-12" width="24" height="24" rx="4" fill="#E2E8F0"/>
        <rect x="-12" y="-155" width="24" height="24" rx="4" fill="#E2E8F0"/>
        <rect x="-12" y="131" width="24" height="24" rx="4" fill="#E2E8F0"/>

        <!-- Vault Wheel Dial -->
        <circle cx="0" cy="0" r="70" fill="#334155" stroke="#FFE600" stroke-width="6"/>
        <line x1="-50" y1="0" x2="50" y2="0" stroke="#FFE600" stroke-width="8" stroke-linecap="round"/>
        <line x1="0" y1="-50" x2="0" y2="50" stroke="#FFE600" stroke-width="8" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="24" fill="#FFE600"/>

        <!-- Giant Cash Stack Badge Floating Out -->
        <g transform="translate(-140, 110)">
          <rect width="280" height="60" rx="12" fill="#064E3B" stroke="#34D399" stroke-width="4"/>
          <text x="140" y="42" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="34" fill="#34D399" text-anchor="middle">
            💵 $500K CASH 💵
          </text>
        </g>
      </g>
    `;
  } else if (scene.theme === 'circle_challenge') {
    centerpieceSvg = `
      <!-- Giant Red Circle Arena -->
      <g transform="translate(360, 520)">
        <!-- Stadium Floor -->
        <circle cx="0" cy="0" r="170" fill="#18181B" stroke="#27272A" stroke-width="8" />
        <!-- Glowing Red Boundary Ring -->
        <circle cx="0" cy="0" r="140" fill="#450A0A" fill-opacity="0.4" stroke="#EF4444" stroke-width="14" stroke-dasharray="24,10"/>
        <!-- Stadium Center Cross -->
        <circle cx="0" cy="0" r="28" fill="#EF4444"/>
        <text x="0" y="8" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="24" fill="#FFFFFF" text-anchor="middle">⭕</text>
        
        <!-- Contestant Dot Markers -->
        <circle cx="-70" cy="-60" r="10" fill="#F87171"/>
        <circle cx="70" cy="-60" r="10" fill="#F87171"/>
        <circle cx="-80" cy="50" r="10" fill="#F87171"/>
        <circle cx="80" cy="50" r="10" fill="#F87171"/>
        <circle cx="0" cy="-100" r="10" fill="#FFE600"/>

        <g transform="translate(-130, 110)">
          <rect width="260" height="54" rx="10" fill="#7F1D1D" stroke="#EF4444" stroke-width="4"/>
          <text x="130" y="38" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="26" fill="#FCA5A5" text-anchor="middle">
            DO NOT STEP OUT!
          </text>
        </g>
      </g>
    `;
  } else if (scene.theme === 'freeze_ice') {
    centerpieceSvg = `
      <!-- Sub-Zero Ice Block Chamber -->
      <g transform="translate(360, 520)">
        <polygon points="0,-160 140,-80 140,80 0,160 -140,80 -140,-80" fill="#082F49" stroke="#38BDF8" stroke-width="10"/>
        <polygon points="0,-120 100,-60 100,60 0,120 -100,60 -100,-60" fill="#0284C7" fill-opacity="0.3" stroke="#7DD3FC" stroke-width="4"/>
        <text x="0" y="30" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="90" fill="#E0F2FE" text-anchor="middle">❄️</text>
        <g transform="translate(-130, 110)">
          <rect width="260" height="54" rx="10" fill="#0C4A6E" stroke="#38BDF8" stroke-width="4"/>
          <text x="130" y="38" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="28" fill="#38BDF8" text-anchor="middle">
            -20°F FREEZER
          </text>
        </g>
      </g>
    `;
  } else {
    centerpieceSvg = `
      <!-- Extreme Hazard / Volcanic Survival -->
      <g transform="translate(360, 520)">
        <circle cx="0" cy="0" r="160" fill="#431407" stroke="#F97316" stroke-width="10"/>
        <polygon points="0,-120 120,90 -120,90" fill="#7C2D12" stroke="#FB923C" stroke-width="8"/>
        <text x="0" y="45" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="100" fill="#FDBA74" text-anchor="middle">🔥</text>
        <g transform="translate(-130, 110)">
          <rect width="260" height="54" rx="10" fill="#7C2D12" stroke="#F97316" stroke-width="4"/>
          <text x="130" y="38" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="26" fill="#FDBA74" text-anchor="middle">
            LAVA SURVIVAL
          </text>
        </g>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="hookBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="40%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="goldHdr" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFE600"/>
      <stop offset="100%" stop-color="#FF9900"/>
    </linearGradient>
    <filter id="neonGlow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="textDrop">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.95"/>
    </filter>
  </defs>

  <!-- Deep Canvas -->
  <rect width="720" height="1280" fill="url(#hookBg)"/>

  <!-- Radiant High-Energy Speed Lines -->
  ${generateSpeedLines(360, 520, 24, 800)}

  <!-- Top Caution Yellow Hazard Stripes (First 2s Hook Visual Cue) -->
  <g transform="translate(0, 0)">
    <rect width="720" height="36" fill="#FFE600"/>
    <text x="360" y="26" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#000000" text-anchor="middle" letter-spacing="3">
      ⚠️ FIRST 2 SECONDS: DO NOT BLINK! ⚠️
    </text>
  </g>

  <!-- Giant 3D Hook Headline (0.0s Attention Grab) -->
  <g transform="translate(36, 68)">
    <rect width="648" height="120" rx="20" fill="rgba(15, 23, 42, 0.95)" stroke="${accent}" stroke-width="4" filter="url(#textDrop)"/>
    <text x="324" y="52" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="34" fill="#FFFFFF" text-anchor="middle" filter="url(#textDrop)">
      ${headline}
    </text>
    <!-- Hook Badge -->
    <rect x="184" y="70" width="280" height="34" rx="17" fill="${accent}"/>
    <text x="324" y="93" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#000000" text-anchor="middle" letter-spacing="1">
      ⚡ ${badge} ⚡
    </text>
  </g>

  <!-- Dynamic Theme Centerpiece -->
  ${centerpieceSvg}

  <!-- Massive Stat Plate -->
  <g transform="translate(60, 710)">
    <rect width="600" height="136" rx="24" fill="rgba(0,0,0,0.85)" stroke="#FFE600" stroke-width="5" filter="url(#neonGlow)"/>
    <text x="300" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="60" fill="url(#goldHdr)" text-anchor="middle" filter="url(#textDrop)">
      ${stat}
    </text>
    <text x="300" y="112" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="20" fill="#E2E8F0" text-anchor="middle" letter-spacing="4">
      ${statLabel}
    </text>
  </g>

  <!-- High-Impact MrBeast Centered Subtitles -->
  <g transform="translate(40, 875)">
    <rect width="640" height="200" rx="24" fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    ${captionLines
      .map(
        (line, idx) => `
        <text x="320" y="${75 + idx * 52}" 
              font-family="Liberation Sans, Arial, sans-serif" 
              font-weight="900" 
              font-size="36" 
              fill="${idx === 0 ? '#FFE600' : '#FFFFFF'}" 
              stroke="#000000" 
              stroke-width="7" 
              paint-order="stroke fill" 
              text-anchor="middle" 
              filter="url(#textDrop)">
          ${line}
        </text>
      `
      )
      .join('')}
  </g>

  <!-- Bottom Action Bar -->
  <g transform="translate(0, 1244)">
    <rect width="720" height="36" fill="#FFE600"/>
    <text x="360" y="25" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#000000" text-anchor="middle" letter-spacing="3">
      🔴 WATCH UNTIL THE CLIMAX! 🔴
    </text>
  </g>
</svg>`;
}

// SCENE 1: ELIMINATION STAGE / RISING STAKES SCENE (Completely different layout)
function renderEliminationSceneSvg(scene: SceneData, totalScenes: number, script: ChallengeScript, seed: number): string {
  const accent = scene.accentColor || '#F59E0B';
  const headline = escapeXml(scene.headline);
  const badge = escapeXml(scene.badgeText);
  const stat = escapeXml(scene.statNumber);
  const statLabel = escapeXml(scene.statLabel);
  const captionLines = wrapText(scene.narration, 20).map(l => escapeXml(l));

  // Renders a grid of 6 contestants with 4 eliminated with massive RED X stamps
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="elimBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#18181B"/>
      <stop offset="50%" stop-color="#09090B"/>
      <stop offset="100%" stop-color="#18181B"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
  </defs>

  <rect width="720" height="1280" fill="url(#elimBg)"/>

  <!-- Top Alert Banner -->
  <g transform="translate(40, 50)">
    <rect width="640" height="100" rx="16" fill="#7F1D1D" stroke="#EF4444" stroke-width="4"/>
    <text x="320" y="45" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="30" fill="#FFFFFF" text-anchor="middle">
      🚨 ${headline} 🚨
    </text>
    <text x="320" y="80" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="18" fill="#FCA5A5" text-anchor="middle" letter-spacing="2">
      ${badge}
    </text>
  </g>

  <!-- Contestant Elimination Matrix (Distinct visual composition) -->
  <g transform="translate(50, 180)">
    <!-- Contestant 1 (Active) -->
    <g transform="translate(0, 0)">
      <rect width="180" height="150" rx="16" fill="#1E293B" stroke="#22C55E" stroke-width="4"/>
      <circle cx="90" cy="60" r="36" fill="#334155"/>
      <text x="90" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#FFFFFF" text-anchor="middle">👤</text>
      <text x="90" y="125" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#22C55E" text-anchor="middle">STILL IN</text>
    </g>

    <!-- Contestant 2 (ELIMINATED) -->
    <g transform="translate(220, 0)">
      <rect width="180" height="150" rx="16" fill="#27272A" stroke="#52525B" stroke-width="2"/>
      <circle cx="90" cy="60" r="36" fill="#3F3F46"/>
      <text x="90" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#A1A1AA" text-anchor="middle">👤</text>
      <!-- Big Red X Stamp -->
      <line x1="20" y1="20" x2="160" y2="130" stroke="#EF4444" stroke-width="14" stroke-linecap="round"/>
      <line x1="160" y1="20" x2="20" y2="130" stroke="#EF4444" stroke-width="14" stroke-linecap="round"/>
      <text x="90" y="138" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="14" fill="#EF4444" text-anchor="middle">OUT!</text>
    </g>

    <!-- Contestant 3 (ELIMINATED) -->
    <g transform="translate(440, 0)">
      <rect width="180" height="150" rx="16" fill="#27272A" stroke="#52525B" stroke-width="2"/>
      <circle cx="90" cy="60" r="36" fill="#3F3F46"/>
      <text x="90" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#A1A1AA" text-anchor="middle">👤</text>
      <line x1="20" y1="20" x2="160" y2="130" stroke="#EF4444" stroke-width="14" stroke-linecap="round"/>
      <line x1="160" y1="20" x2="20" y2="130" stroke="#EF4444" stroke-width="14" stroke-linecap="round"/>
      <text x="90" y="138" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="14" fill="#EF4444" text-anchor="middle">OUT!</text>
    </g>

    <!-- Contestant 4 (Active) -->
    <g transform="translate(0, 180)">
      <rect width="180" height="150" rx="16" fill="#1E293B" stroke="#22C55E" stroke-width="4"/>
      <circle cx="90" cy="60" r="36" fill="#334155"/>
      <text x="90" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#FFFFFF" text-anchor="middle">👤</text>
      <text x="90" y="125" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#22C55E" text-anchor="middle">STILL IN</text>
    </g>

    <!-- Contestant 5 (ELIMINATED) -->
    <g transform="translate(220, 180)">
      <rect width="180" height="150" rx="16" fill="#27272A" stroke="#52525B" stroke-width="2"/>
      <circle cx="90" cy="60" r="36" fill="#3F3F46"/>
      <text x="90" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#A1A1AA" text-anchor="middle">👤</text>
      <line x1="20" y1="20" x2="160" y2="130" stroke="#EF4444" stroke-width="14" stroke-linecap="round"/>
      <line x1="160" y1="20" x2="20" y2="130" stroke="#EF4444" stroke-width="14" stroke-linecap="round"/>
      <text x="90" y="138" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="14" fill="#EF4444" text-anchor="middle">OUT!</text>
    </g>

    <!-- Contestant 6 (Active) -->
    <g transform="translate(440, 180)">
      <rect width="180" height="150" rx="16" fill="#1E293B" stroke="#22C55E" stroke-width="4"/>
      <circle cx="90" cy="60" r="36" fill="#334155"/>
      <text x="90" y="72" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#FFFFFF" text-anchor="middle">👤</text>
      <text x="90" y="125" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#22C55E" text-anchor="middle">STILL IN</text>
    </g>
  </g>

  <!-- Big Survivor Stat Badge -->
  <g transform="translate(60, 560)">
    <rect width="600" height="120" rx="20" fill="rgba(0,0,0,0.85)" stroke="${accent}" stroke-width="6"/>
    <text x="300" y="65" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="56" fill="#F59E0B" text-anchor="middle">
      ${stat}
    </text>
    <text x="300" y="102" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="18" fill="#94A3B8" text-anchor="middle" letter-spacing="4">
      ${statLabel}
    </text>
  </g>

  <!-- Subtitles with MrBeast Style Stroke -->
  <g transform="translate(40, 720)">
    <rect width="640" height="210" rx="20" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    ${captionLines
      .map(
        (line, idx) => `
        <text x="320" y="${75 + idx * 52}" 
              font-family="Liberation Sans, Arial, sans-serif" 
              font-weight="900" 
              font-size="36" 
              fill="${idx === 0 ? '#F59E0B' : '#FFFFFF'}" 
              stroke="#000000" 
              stroke-width="7" 
              paint-order="stroke fill" 
              text-anchor="middle" 
              filter="url(#shadow)">
          ${line}
        </text>
      `
      )
      .join('')}
  </g>

  <!-- Escalating Hazard Tension Bar -->
  <g transform="translate(60, 960)">
    <rect width="600" height="40" rx="10" fill="#27272A"/>
    <rect width="450" height="40" rx="10" fill="#EF4444"/>
    <text x="300" y="26" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">
      🔥 DANGER LEVEL: 75% EXTREME 🔥
    </text>
  </g>
</svg>`;
}

// SCENE 2: EXTREME CLIMAX & DIGITAL STOPWATCH DUEL SCENE (Distinct visual composition)
function renderClimaxSceneSvg(scene: SceneData, totalScenes: number, script: ChallengeScript, seed: number): string {
  const accent = scene.accentColor || '#EF4444';
  const headline = escapeXml(scene.headline);
  const badge = escapeXml(scene.badgeText);
  const stat = escapeXml(scene.statNumber);
  const statLabel = escapeXml(scene.statLabel);
  const captionLines = wrapText(scene.narration, 20).map(l => escapeXml(l));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="climaxBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#450A0A"/>
      <stop offset="60%" stop-color="#18181B"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <filter id="laserGlow">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="720" height="1280" fill="url(#climaxBg)"/>

  <!-- Top Climax Bar -->
  <g transform="translate(40, 50)">
    <rect width="640" height="90" rx="16" fill="rgba(0,0,0,0.8)" stroke="#EF4444" stroke-width="4"/>
    <text x="320" y="44" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="32" fill="#EF4444" text-anchor="middle">
      ⚠️ ${headline} ⚠️
    </text>
    <text x="320" y="74" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#FCA5A5" text-anchor="middle" letter-spacing="3">
      ${badge}
    </text>
  </g>

  <!-- Glowing Digital Countdown Stopwatch Ring -->
  <g transform="translate(360, 360)">
    <!-- Outer Tension Ring -->
    <circle cx="0" cy="0" r="150" fill="#000000" stroke="#7F1D1D" stroke-width="12"/>
    <circle cx="0" cy="0" r="140" fill="none" stroke="#EF4444" stroke-width="10" stroke-dasharray="60, 20" filter="url(#laserGlow)"/>
    
    <!-- Big Digital Countdown -->
    <text x="0" y="20" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="74" fill="#FFE600" text-anchor="middle">
      00:59
    </text>
    <text x="0" y="65" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="18" fill="#EF4444" text-anchor="middle" letter-spacing="3">
      SECONDS REMAINING
    </text>
  </g>

  <!-- Head-to-Head Split Duel Plate -->
  <g transform="translate(50, 570)">
    <!-- Player A -->
    <rect x="0" y="0" width="280" height="110" rx="16" fill="#1E293B" stroke="#38BDF8" stroke-width="4"/>
    <text x="140" y="45" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="24" fill="#38BDF8" text-anchor="middle">FINALIST 1</text>
    <text x="140" y="85" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="34" fill="#FFFFFF" text-anchor="middle">CHRIS</text>

    <!-- VS Lightning Emblem -->
    <circle cx="310" cy="55" r="32" fill="#EF4444" stroke="#FFFFFF" stroke-width="4"/>
    <text x="310" y="65" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="24" fill="#FFFFFF" text-anchor="middle">VS</text>

    <!-- Player B -->
    <rect x="340" y="0" width="280" height="110" rx="16" fill="#1E293B" stroke="#F59E0B" stroke-width="4"/>
    <text x="480" y="45" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="24" fill="#F59E0B" text-anchor="middle">FINALIST 2</text>
    <text x="480" y="85" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="34" fill="#FFFFFF" text-anchor="middle">SARAH</text>
  </g>

  <!-- Big Stat Callout -->
  <g transform="translate(60, 720)">
    <rect width="600" height="100" rx="18" fill="rgba(0,0,0,0.9)" stroke="#FFE600" stroke-width="4"/>
    <text x="300" y="55" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="46" fill="#FFE600" text-anchor="middle">
      ${stat}
    </text>
    <text x="300" y="86" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="16" fill="#CBD5E1" text-anchor="middle" letter-spacing="3">
      ${statLabel}
    </text>
  </g>

  <!-- Subtitles with Yellow / Red Urgency -->
  <g transform="translate(40, 850)">
    <rect width="640" height="210" rx="20" fill="rgba(0,0,0,0.85)" stroke="rgba(239,68,68,0.5)" stroke-width="3"/>
    ${captionLines
      .map(
        (line, idx) => `
        <text x="320" y="${75 + idx * 52}" 
              font-family="Liberation Sans, Arial, sans-serif" 
              font-weight="900" 
              font-size="36" 
              fill="${idx === 0 ? '#EF4444' : '#FFFFFF'}" 
              stroke="#000000" 
              stroke-width="7" 
              paint-order="stroke fill" 
              text-anchor="middle">
          ${line}
        </text>
      `
      )
      .join('')}
  </g>
</svg>`;
}

// SCENE 3: GRAND WINNER CELEBRATION & HIGH-CTR SUBSCRIBE CTA SCENE (Distinct visual composition)
function renderVictorySceneSvg(scene: SceneData, totalScenes: number, script: ChallengeScript, seed: number): string {
  const accent = scene.accentColor || '#10B981';
  const headline = escapeXml(scene.headline);
  const badge = escapeXml(scene.badgeText);
  const stat = escapeXml(scene.statNumber);
  const statLabel = escapeXml(scene.statLabel);
  const captionLines = wrapText(scene.narration, 20).map(l => escapeXml(l));

  // Confetti particles generator
  let confetti = '';
  const colors = ['#FFE600', '#10B981', '#3B82F6', '#EF4444', '#EC4899', '#A855F7'];
  for (let i = 0; i < 40; i++) {
    const x = (i * 47 + (seed % 30)) % 720;
    const y = (i * 31 + (seed % 50)) % 600;
    const color = colors[i % colors.length];
    confetti += `<rect x="${x}" y="${y}" width="14" height="8" rx="2" fill="${color}" transform="rotate(${i * 25} ${x} ${y})"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="winBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#064E3B"/>
      <stop offset="50%" stop-color="#022C22"/>
      <stop offset="100%" stop-color="#064E3B"/>
    </linearGradient>
    <filter id="goldGlow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="720" height="1280" fill="url(#winBg)"/>

  <!-- Confetti Rain Shower -->
  <g>${confetti}</g>

  <!-- Top Victory Ribbon -->
  <g transform="translate(40, 50)">
    <rect width="640" height="96" rx="16" fill="rgba(0,0,0,0.85)" stroke="#10B981" stroke-width="4"/>
    <text x="320" y="46" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="34" fill="#34D399" text-anchor="middle">
      🏆 ${headline} 🏆
    </text>
    <text x="320" y="80" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle" letter-spacing="3">
      ${badge}
    </text>
  </g>

  <!-- Golden Novelty Cash Check / Trophy -->
  <g transform="translate(60, 180)">
    <!-- Giant $500,000 Bank Check -->
    <rect width="600" height="240" rx="16" fill="#F8FAFC" stroke="#FFE600" stroke-width="8" filter="url(#goldGlow)"/>
    <!-- Check Top Header -->
    <rect x="0" y="0" width="600" height="40" fill="#0F172A"/>
    <text x="30" y="26" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="14" fill="#FFE600">MRBEAST CHALLENGE BANK</text>
    <text x="560" y="26" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="14" fill="#FFFFFF" text-anchor="end">DATE: TODAY</text>
    
    <!-- Pay to the Order of -->
    <text x="40" y="90" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="20" fill="#475569">PAY TO THE ORDER OF:</text>
    <text x="270" y="92" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="28" fill="#0F172A">CHAMPION WINNER</text>
    
    <!-- Amount Box -->
    <rect x="40" y="120" width="520" height="70" rx="10" fill="#064E3B"/>
    <text x="300" y="168" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="48" fill="#FFE600" text-anchor="middle">
      ${stat}
    </text>

    <!-- Authorized Signature -->
    <text x="440" y="222" font-family="Brush Script MT, cursive, Arial" font-size="26" fill="#0F172A">Jimmy Donaldson</text>
    <line x1="380" y1="228" x2="560" y2="228" stroke="#94A3B8" stroke-width="2"/>
  </g>

  <!-- Subtitles -->
  <g transform="translate(40, 470)">
    <rect width="640" height="200" rx="20" fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    ${captionLines
      .map(
        (line, idx) => `
        <text x="320" y="${75 + idx * 52}" 
              font-family="Liberation Sans, Arial, sans-serif" 
              font-weight="900" 
              font-size="36" 
              fill="${idx === 0 ? '#FFE600' : '#FFFFFF'}" 
              stroke="#000000" 
              stroke-width="7" 
              paint-order="stroke fill" 
              text-anchor="middle">
          ${line}
        </text>
      `
      )
      .join('')}
  </g>

  <!-- Animated High-CTR YouTube Subscribe Card -->
  <g transform="translate(50, 710)">
    <!-- Glowing background box -->
    <rect width="620" height="260" rx="28" fill="#000000" stroke="#FF0000" stroke-width="8" filter="url(#goldGlow)"/>
    
    <!-- Big Red YouTube Subscribe Pill Button -->
    <g transform="translate(60, 40)">
      <rect width="500" height="96" rx="48" fill="#FF0000" stroke="#FFFFFF" stroke-width="4"/>
      <!-- YouTube Play Triangle -->
      <polygon points="120,32 120,64 150,48" fill="#FFFFFF"/>
      <text x="310" y="62" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="40" fill="#FFFFFF" text-anchor="middle">
        SUBSCRIBE
      </text>
      <!-- Ringing Bell Icon -->
      <text x="460" y="65" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="42" fill="#FFE600">🔔</text>
    </g>

    <!-- Subtext -->
    <text x="310" y="190" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="26" fill="#FFE600" text-anchor="middle">
      👇 NEXT SUBSCRIBER GETS $10,000! 👇
    </text>
    <text x="310" y="230" font-family="Liberation Sans, Arial, sans-serif" font-weight="900" font-size="18" fill="#94A3B8" text-anchor="middle" letter-spacing="2">
      HIT THE BELL NOTIFICATION TO NEVER MISS A VIDEO
    </text>
  </g>
</svg>`;
}

// Router to select the appropriate visual scene generator
function createSceneSvg(scene: SceneData, totalScenes: number, script: ChallengeScript, seed: number): string {
  const vType = scene.visualType || (scene.index === 0 ? 'hook_intro' : scene.index === 1 ? 'elimination_stage' : scene.index === 2 ? 'extreme_hazard' : 'victory_celebration');

  switch (vType) {
    case 'hook_intro':
      return renderHookSceneSvg(scene, totalScenes, script, seed);
    case 'elimination_stage':
      return renderEliminationSceneSvg(scene, totalScenes, script, seed);
    case 'extreme_hazard':
    case 'countdown_duel':
      return renderClimaxSceneSvg(scene, totalScenes, script, seed);
    case 'victory_celebration':
    default:
      return renderVictorySceneSvg(scene, totalScenes, script, seed);
  }
}

export async function renderShortVideo(
  job: VideoJob,
  onProgress?: (progress: number, message: string) => void
): Promise<{ videoFilename: string; thumbnailFilename: string; durationSec: number }> {
  const script = job.script!;
  const mediaDir = getMediaDir();
  const tempDir = path.join(mediaDir, `tmp_${job.id}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    onProgress?.(10, 'Initializing MrBeast multi-scene video engine...');
    logActivity('generation', `Starting multi-scene video generation for job ${job.id}`);

    const sceneClips: string[] = [];
    const sceneAudios: string[] = [];
    const sceneDurations: number[] = [];
    const totalScenes = script.scenes.length;

    // 1. Render each distinct visual scene with dynamic motion & audio
    for (let i = 0; i < totalScenes; i++) {
      const scene = script.scenes[i];
      const sceneSeed = getVisualSeed(job.id, i);
      const sceneProgress = 15 + Math.floor((i / totalScenes) * 45);
      onProgress?.(sceneProgress, `Rendering Scene ${i + 1}/${totalScenes}: ${scene.headline}`);

      // 1a. Generate voiceover audio
      const audioPath = path.join(tempDir, `scene_${i}_voice.mp3`);
      const { duration } = await generateSceneAudio(scene.narration, scene.durationSec, audioPath);
      const actualDuration = Math.max(duration, 7.5);
      sceneAudios.push(audioPath);
      sceneDurations.push(actualDuration);

      // 1b. Render distinct scene SVG
      const svgContent = createSceneSvg(scene, totalScenes, script, sceneSeed);
      const svgPath = path.join(tempDir, `scene_${i}.svg`);
      fs.writeFileSync(svgPath, svgContent, 'utf-8');

      // 1c. Select camera motion
      // Scene 0: Fast punch zoom (1.0 to 1.25)
      // Scene 1: Lateral pan across elimination grid
      // Scene 2: Tension zoom
      // Scene 3: Victory celebration zoom
      const totalFrames = Math.floor(actualDuration * 25);
      let zoomFilter = `zoompan=z='min(1.0+on*0.0022,1.24)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=25,format=yuv420p`;
      if (i === 1) {
        // Lateral sweep
        zoomFilter = `zoompan=z='1.12':x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=25,format=yuv420p`;
      } else if (i === 2) {
        // Fast snap punch
        zoomFilter = `zoompan=z='min(1.05+on*0.0025,1.28)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=25,format=yuv420p`;
      }

      const sceneVideoPath = path.join(tempDir, `scene_${i}_clip.mp4`);
      await execFileAsync('/usr/bin/ffmpeg', [
        '-loop', '1',
        '-i', svgPath,
        '-i', audioPath,
        '-vf', zoomFilter,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-t', actualDuration.toFixed(2),
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-y', sceneVideoPath,
      ]);

      sceneClips.push(sceneVideoPath);
    }

    onProgress?.(65, 'Stitching scenes with cinematic transitions & sound effects...');
    logActivity('generation', `Applying dynamic transitions across ${sceneClips.length} scenes`);

    // 2. Stitch clips together with xfade transitions
    // Transition 0->1: slideleft (0.35s)
    // Transition 1->2: circlecrop (0.35s)
    // Transition 2->3: slideright (0.35s)
    let currentVideo = sceneClips[0];
    let currentDuration = sceneDurations[0];
    const transDur = 0.35;

    for (let i = 1; i < sceneClips.length; i++) {
      const nextVideo = sceneClips[i];
      const nextDuration = sceneDurations[i];
      const transName = i === 1 ? 'slideleft' : i === 2 ? 'circlecrop' : 'slideright';
      const offset = Math.max(0.1, currentDuration - transDur);
      const mergedVideoPath = path.join(tempDir, `trans_merge_${i}.mp4`);

      await execFileAsync('/usr/bin/ffmpeg', [
        '-i', currentVideo,
        '-i', nextVideo,
        '-filter_complex', `[0:v][1:v]xfade=transition=${transName}:duration=${transDur}:offset=${offset.toFixed(2)}[v];[0:a][1:a]acrossfade=d=${transDur}[a]`,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-y', mergedVideoPath,
      ]);

      currentVideo = mergedVideoPath;
      currentDuration = currentDuration + nextDuration - transDur;
    }

    onProgress?.(80, 'Composing licensed sound effects & tension soundtrack...');

    // 3. Generate licensed procedural SFX layers
    const whooshPath = path.join(tempDir, 'sfx_whoosh.wav');
    const boomPath = path.join(tempDir, 'sfx_boom.wav');
    const chimePath = path.join(tempDir, 'sfx_chime.wav');
    const musicPath = path.join(tempDir, 'bg_music.wav');

    await Promise.all([
      generateWhooshSfx(whooshPath),
      generateBoomSfx(boomPath),
      generateCashChimeSfx(chimePath),
      generateChallengeMusicTrack(currentDuration + 2, musicPath),
    ]);

    // 4. Master audio: Voiceover + Boom at 0.0s + Music Track (ducked to 16% volume) + Faststart MP4
    const finalVideoFilename = `short_${job.id}.mp4`;
    const finalVideoPath = path.join(mediaDir, finalVideoFilename);

    onProgress?.(90, 'Finalizing high-energy 9:16 vertical render for YouTube Shorts...');

    await execFileAsync('/usr/bin/ffmpeg', [
      '-i', currentVideo,
      '-i', musicPath,
      '-i', boomPath,
      '-filter_complex', `[1:a]volume=0.18[bg];[2:a]volume=0.8[boom];[0:a][bg][boom]amix=inputs=3:duration=first:weights=1.0 0.25 0.7[outa]`,
      '-map', '0:v',
      '-map', '[outa]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-y', finalVideoPath,
    ]);

    // 5. Generate high-CTR YouTube thumbnail from Scene 0
    onProgress?.(96, 'Creating high-impact YouTube thumbnail...');
    const thumbnailFilename = `thumb_${job.id}.jpg`;
    const thumbnailPath = path.join(mediaDir, thumbnailFilename);

    const thumbSvg = renderHookSceneSvg(script.scenes[0], totalScenes, script, getVisualSeed(job.id, 0));
    const thumbSvgPath = path.join(tempDir, 'thumb.svg');
    fs.writeFileSync(thumbSvgPath, thumbSvg, 'utf-8');

    await execFileAsync('/usr/bin/ffmpeg', [
      '-i', thumbSvgPath,
      '-vf', 'scale=720:1280',
      '-q:v', '2',
      '-y', thumbnailPath,
    ]);

    onProgress?.(100, 'MrBeast challenge video created successfully!');
    logActivity('generation', `Successfully generated dynamic short ${finalVideoFilename} (${currentDuration.toFixed(1)}s)`);

    // Clean up temporary files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    return {
      videoFilename: finalVideoFilename,
      thumbnailFilename: thumbnailFilename,
      durationSec: Math.round(currentDuration),
    };
  } catch (error: any) {
    logActivity('error', `Video rendering failed: ${error.message}`);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
    throw error;
  }
}
