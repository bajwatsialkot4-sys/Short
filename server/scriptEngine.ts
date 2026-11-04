import { GoogleGenAI, Type } from '@google/genai';
import { ChallengeScript, SceneData } from './types.ts';
import { loadSettings, logActivity } from './storage.ts';

// Curated pool of viral MrBeast-style challenge templates for guaranteed offline / free execution
const VIRAL_CHALLENGE_TEMPLATES = [
  {
    title: 'Survive 100 Hours In A Giant $500,000 Cash Vault! 💰 #shorts',
    hook: 'I locked 10 strangers inside this steel vault with 500 THOUSAND DOLLARS cash!',
    description: '10 strangers, 1 steel vault, and half a million dollars. But there is a huge catch... Watch until the end! 🔥\n\n#shorts #mrbeast #challenge #viral #usa #gaming',
    tags: ['shorts', 'challenge', 'mrbeast', 'viral', 'cash', 'money', 'survival'],
    theme: 'money_vault' as const,
    scenes: [
      {
        durationSec: 10,
        headline: '$500,000 CASH VAULT',
        badgeText: '10 PLAYERS LOCKED IN',
        statNumber: '$500,000',
        statLabel: 'TOTAL PRIZE POOL',
        accentColor: '#10B981',
        subColor: '#059669',
        narration: 'I locked 10 strangers inside this airtight vault with 500 THOUSAND DOLLARS in cold hard cash! Whoever stays the longest keeps every single dollar!',
      },
      {
        durationSec: 12,
        headline: 'HOUR 24: THE FIRST ELIMINATION',
        badgeText: 'LIGHTS CUT OFF',
        statNumber: '8 REMAINING',
        statLabel: 'PLAYERS ACTIVE',
        accentColor: '#F59E0B',
        subColor: '#D97706',
        narration: 'At hour 24, we completely killed the lights and cranked the air conditioner to 32 degrees! Two players instantly tapped out!',
      },
      {
        durationSec: 12,
        headline: 'HOUR 72: THE TEMPTATION BOX',
        badgeText: 'PRESSURE AT MAXIMUM',
        statNumber: 'FINAL 2',
        statLabel: 'HEAD TO HEAD',
        accentColor: '#EF4444',
        subColor: '#DC2626',
        narration: 'Only two players survived three days! To break the tie, I brought out a briefcase containing 50 thousand dollars cash for whoever walks out right now!',
      },
      {
        durationSec: 12,
        headline: 'THE SHOCKING CLIMAX!',
        badgeText: 'WINNER TAKES ALL',
        statNumber: '1 CHAMPION',
        statLabel: '$500,000 CLAIMED',
        accentColor: '#3B82F6',
        subColor: '#2563EB',
        narration: 'Neither took the bribe! But at minute 59, Mike guessed the secret code and won the entire 500 thousand dollars! Subscribe for more insane challenges!',
      },
    ],
  },
  {
    title: 'Would You Step In The Red Circle For $250,000? ⭕ #shorts',
    hook: 'Last person to step out of this giant red circle wins 250 THOUSAND DOLLARS!',
    description: '50 players entered the red circle. Every 10 minutes the circle shrinks in half! Who survives? 😱\n\n#shorts #challenge #mrbeast #insane #redcircle',
    tags: ['shorts', 'challenge', 'redcircle', 'mrbeast', 'usa', 'entertainment'],
    theme: 'circle_challenge' as const,
    scenes: [
      {
        durationSec: 10,
        headline: 'THE SHRINKING CIRCLE',
        badgeText: '50 CONTESTANTS',
        statNumber: '$250,000',
        statLabel: 'CASH ON THE LINE',
        accentColor: '#EF4444',
        subColor: '#B91C1C',
        narration: '50 people stepped inside this giant red circle! The rules are simple: touch the outside line for a split second, and you are immediately eliminated!',
      },
      {
        durationSec: 11,
        headline: 'STAGE 2: THE CIRCLE SHRINKS',
        badgeText: '30 PEOPLE ELIMINATED',
        statNumber: '20 LEFT',
        statLabel: 'CROWDED CHAOS',
        accentColor: '#F59E0B',
        subColor: '#D97706',
        narration: 'Every hour, the circle shrinks by half! People were literally standing on one foot shoulder-to-shoulder just to stay inside!',
      },
      {
        durationSec: 12,
        headline: 'STAGE 4: DODGEBALL CANNON',
        badgeText: 'EXTREME OBSTACLES',
        statNumber: 'FINAL 3',
        statLabel: 'ULTIMATE SHOWDOWN',
        accentColor: '#8B5CF6',
        subColor: '#7C3AED',
        narration: 'Down to the final three contestants, we unleashed the high-speed dodgeball cannon! One player dodged left, stumbled, and touched the grass!',
      },
      {
        durationSec: 12,
        headline: 'HE WON $250,000!',
        badgeText: 'EPIC VICTORY',
        statNumber: 'WINNER! 🏆',
        statLabel: '28 HOURS STANDING',
        accentColor: '#10B981',
        subColor: '#059669',
        narration: 'After 28 straight hours, Chris outlasted everyone and took home the quarter-million dollar check! Hit subscribe right now!',
      },
    ],
  },
  {
    title: 'Surviving 24 Hours On A Deserted Island For $100,000! 🏝️ #shorts',
    hook: 'I dropped 4 best friends on an isolated island with zero food and $100,000 hidden in the jungle!',
    description: 'Find the $100,000 chest before the tide rises and swallows the beach! 🌊\n\n#shorts #island #challenge #mrbeast #survival',
    tags: ['shorts', 'island', 'challenge', 'mrbeast', 'viral', 'extreme'],
    theme: 'lava_survival' as const,
    scenes: [
      {
        durationSec: 10,
        headline: 'ABANDONED ISLAND',
        badgeText: 'ZERO SUPPLIES',
        statNumber: '$100,000',
        statLabel: 'BURIED TREASURE',
        accentColor: '#06B6D4',
        subColor: '#0891B2',
        narration: 'I dropped four best friends onto a remote desert island with zero supplies and a buried treasure chest worth 100 THOUSAND DOLLARS!',
      },
      {
        durationSec: 11,
        headline: 'CLUE 1: THE VOLCANO TRAIL',
        badgeText: 'RACE AGAINST TIDE',
        statNumber: '6 HOURS',
        statLabel: 'UNTIL HIGH TIDE',
        accentColor: '#F97316',
        subColor: '#EA580C',
        narration: 'They had just six hours to solve three cryptic puzzles before the incoming tide flooded the entire island basecamp!',
      },
      {
        durationSec: 12,
        headline: 'THE HIDDEN CAVE',
        badgeText: 'DEEP IN THE JUNGLE',
        statNumber: '3 KEYS',
        statLabel: 'ONLY 1 WORKS',
        accentColor: '#EC4899',
        subColor: '#DB2777',
        narration: 'Deep inside a pitch-black cave, they discovered three mysterious golden keys. But only one key unlocked the master lock!',
      },
      {
        durationSec: 12,
        headline: 'CHEST UNLOCKED!',
        badgeText: 'TOTAL CELEBRATION',
        statNumber: '$100,000',
        statLabel: 'COLD CASH FOUND',
        accentColor: '#10B981',
        subColor: '#059669',
        narration: 'With 4 minutes left on the clock, Jake unlocked the chest and gold coins erupted everywhere! Subscribe for more insane adventures!',
      },
    ],
  },
  {
    title: 'I Froze 10 People In Giant Ice Cubes For $300,000! ❄️ #shorts',
    hook: 'Can human beings survive 10 hours inside an actual sub-zero ice hotel for $300,000?',
    description: 'Sub-zero temperatures and $300,000 cash. The coldest challenge ever! 🥶\n\n#shorts #frozen #challenge #mrbeast #ice #viral',
    tags: ['shorts', 'frozen', 'challenge', 'mrbeast', 'money', 'ice'],
    theme: 'freeze_ice' as const,
    scenes: [
      {
        durationSec: 10,
        headline: 'SUB-ZERO ICE CHALLENGE',
        badgeText: 'MINUS 20 DEGREES',
        statNumber: '$300,000',
        statLabel: 'FROZEN PRIZE',
        accentColor: '#38BDF8',
        subColor: '#0284C7',
        narration: 'We built a custom freezer chamber at minus 20 degrees Fahrenheit and put 300 THOUSAND DOLLARS inside a solid 1-ton block of ice!',
      },
      {
        durationSec: 11,
        headline: 'HOUR 5: THE SHIVER TEST',
        badgeText: 'HEAVY WINTER GEAR',
        statNumber: '6 PLAYERS',
        statLabel: 'STILL SHIVERING',
        accentColor: '#818CF8',
        subColor: '#6366F1',
        narration: 'Contestants were armed with only their body heat and small blowdryers to melt through 6 feet of solid ice as fast as humanly possible!',
      },
      {
        durationSec: 12,
        headline: 'THE MELTDOWN DUEL',
        badgeText: 'INCHES FROM CASH',
        statNumber: '2 INCHES',
        statLabel: 'ICE REMAINING',
        accentColor: '#F43F5E',
        subColor: '#E11D48',
        narration: 'With only two inches of ice remaining between Sarah and the cash bag, her hairdryer suddenly overheated and blew the power fuse!',
      },
      {
        durationSec: 12,
        headline: 'CASH BROKEN FREE!',
        badgeText: 'UNBELIEVABLE FINISH',
        statNumber: '$300,000',
        statLabel: 'COLD CASH WON',
        accentColor: '#10B981',
        subColor: '#059669',
        narration: 'Sarah used her elbow to shatter the final layer and snatched the 300 thousand dollars! Drop a like and subscribe for the next video!',
      },
    ],
  },
];

export async function generateChallengeScript(customTopic?: string): Promise<ChallengeScript> {
  const settings = loadSettings();
  const apiKey = (settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.length > 5) {
    try {
      logActivity('generation', 'Generating dynamic MrBeast challenge script using Gemini AI...');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `You are a viral YouTube Shorts creator specializing in high-energy, MrBeast-style challenge videos for a USA audience.
Create an exciting, fast-paced challenge script that runs approximately 45-50 seconds total.
${customTopic ? `Topic/Theme request: ${customTopic}` : 'Pick an original, high-stakes extreme challenge idea with huge cash prize or extreme physical/mental trial.'}

REQUIREMENTS:
1. Title: Punchy, high-CTR, includes dollar amount or extreme concept, emojis, and ends with #shorts.
2. Hook: First 3 seconds must grab attention instantly with high stakes.
3. 4 consecutive scenes totaling 45-50 seconds (approx 10-12s each).
4. Each scene must have:
   - narration: energetic American spoken text (around 20-25 words per scene)
   - headline: 2-4 words in ALL CAPS (e.g. '$100,000 VAULT', 'HOUR 24: THE TWIST')
   - badgeText: 2-3 words (e.g. '10 PLAYERS LEFT', 'SUDDEN ELIMINATION')
   - statNumber: big bold stat (e.g. '$500,000', '10 PLAYERS', 'FINAL 2', 'WINNER!')
   - statLabel: label for stat (e.g. 'PRIZE POOL', 'REMAINING', 'FINAL DUEL')
   - accentColor: vivid hex color (e.g. '#EF4444', '#10B981', '#F59E0B', '#3B82F6')
   - theme: one of 'money_vault', 'lava_survival', 'circle_challenge', 'underground_bunker', 'freeze_ice'
5. Ending: Surprising twist and enthusiastic call to subscribe.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              hook: { type: Type.STRING },
              climax: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    durationSec: { type: Type.NUMBER },
                    narration: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    badgeText: { type: Type.STRING },
                    statNumber: { type: Type.STRING },
                    statLabel: { type: Type.STRING },
                    accentColor: { type: Type.STRING },
                    theme: { type: Type.STRING },
                  },
                  required: ['durationSec', 'narration', 'headline', 'badgeText', 'statNumber', 'statLabel', 'accentColor', 'theme'],
                },
              },
            },
            required: ['title', 'description', 'tags', 'hook', 'climax', 'scenes'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        const totalDuration = parsed.scenes.reduce((acc: number, s: any) => acc + (s.durationSec || 11), 0);
        
        const script: ChallengeScript = {
          id: `script_${Date.now()}`,
          title: parsed.title,
          description: parsed.description,
          tags: parsed.tags || ['shorts', 'challenge', 'mrbeast', 'viral'],
          hook: parsed.hook,
          climax: parsed.climax,
          estimatedDurationSec: totalDuration,
          scenes: parsed.scenes.map((s: any, idx: number) => {
            const visualType = idx === 0 ? 'hook_intro' : idx === 1 ? 'elimination_stage' : idx === 2 ? 'extreme_hazard' : 'victory_celebration';
            const cameraMotion = idx === 0 ? 'punch_zoom' : idx === 1 ? 'pan_left' : idx === 2 ? 'fast_zoom_out' : 'punch_zoom';
            const soundEffect = idx === 0 ? 'whoosh_bass' : idx === 1 ? 'siren_alert' : idx === 2 ? 'countdown_tick' : 'cash_chime';
            return {
              index: idx,
              durationSec: Math.max(8, Math.min(14, s.durationSec || 11)),
              narration: s.narration,
              headline: (s.headline || 'MRBEAST CHALLENGE').toUpperCase(),
              badgeText: (s.badgeText || 'EXTREME TEST').toUpperCase(),
              statNumber: s.statNumber || '$100,000',
              statLabel: (s.statLabel || 'PRIZE').toUpperCase(),
              accentColor: s.accentColor || '#10B981',
              subColor: '#059669',
              theme: (['money_vault', 'lava_survival', 'circle_challenge', 'underground_bunker', 'freeze_ice'].includes(s.theme) ? s.theme : 'money_vault') as any,
              visualType,
              cameraMotion,
              soundEffect,
            };
          }),
        };

        logActivity('generation', `Successfully generated Gemini AI script: "${script.title}"`);
        return script;
      }
    } catch (e: any) {
      logActivity('system', `Gemini API script generation notice: ${e.message}. Using built-in viral engine fallback.`);
    }
  }

  // Built-in viral template fallback
  const randomTemplate = VIRAL_CHALLENGE_TEMPLATES[Math.floor(Math.random() * VIRAL_CHALLENGE_TEMPLATES.length)];
  const scriptId = `script_${Date.now()}`;
  
  const script: ChallengeScript = {
    id: scriptId,
    title: randomTemplate.title,
    description: randomTemplate.description,
    tags: randomTemplate.tags,
    hook: randomTemplate.hook,
    climax: randomTemplate.scenes[3].narration,
    estimatedDurationSec: randomTemplate.scenes.reduce((acc, s) => acc + s.durationSec, 0),
    scenes: randomTemplate.scenes.map((s, idx) => {
      const visualType = idx === 0 ? 'hook_intro' : idx === 1 ? 'elimination_stage' : idx === 2 ? 'extreme_hazard' : 'victory_celebration';
      const cameraMotion = idx === 0 ? 'punch_zoom' : idx === 1 ? 'pan_left' : idx === 2 ? 'fast_zoom_out' : 'punch_zoom';
      const soundEffect = idx === 0 ? 'whoosh_bass' : idx === 1 ? 'siren_alert' : idx === 2 ? 'countdown_tick' : 'cash_chime';
      return {
        index: idx,
        durationSec: s.durationSec,
        narration: s.narration,
        headline: s.headline,
        badgeText: s.badgeText,
        statNumber: s.statNumber,
        statLabel: s.statLabel,
        accentColor: s.accentColor,
        subColor: s.subColor,
        theme: randomTemplate.theme,
        visualType,
        cameraMotion,
        soundEffect,
      };
    }),
  };

  logActivity('generation', `Created viral MrBeast challenge script: "${script.title}"`);
  return script;
}
