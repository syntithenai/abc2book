/**
 * Deterministic backing prompts for practice-track generation (no LLM).
 */

const RHYTHM_PERCUSSION_HINTS = {
  reel: '4/4 reel, bodhrán and brushed snare, percussion only',
  hornpipe: '4/4 hornpipe, bodhrán and light percussion, percussion only',
  jig: '6/8 jig, bodhrán and lilting percussion, no rock drums, percussion only',
  'double jig': '6/8 jig, bodhrán percussion, percussion only',
  'single jig': '6/8 jig, bodhrán percussion, percussion only',
  waltz: '3/4 waltz, soft brushed percussion, percussion only',
  polka: '2/4 polka, snare and bodhrán, percussion only',
  march: 'march, snare and bass drum, steady, percussion only',
  air: 'slow air, very sparse brushed percussion, percussion only',
};

const DEFAULT_NEGATIVE = [
  'melody',
  'solo',
  'lead instrument',
  'vocals',
  'spoken word',
  'wrong tempo',
  'epic orchestral',
  'synth pad',
  'strings',
  'choir',
  'harmony',
  'chord progression',
  'piano',
  'guitar',
  'bass guitar',
  'ambient wash',
  'reverb tail',
  'pitched instruments',
  'orchestral',
  'electronic',
].join(', ');

export const DEFAULT_BACKING_GAIN_DB = -16;

function rhythmPercussionHint(rhythm) {
  const key = String(rhythm || '').trim().toLowerCase();
  if (!key) return 'traditional acoustic percussion, rhythm only';
  for (const entry of Object.keys(RHYTHM_PERCUSSION_HINTS)) {
    if (key.indexOf(entry) >= 0) return RHYTHM_PERCUSSION_HINTS[entry];
  }
  return key + ', acoustic percussion only';
}

export function buildBackingPrompt(plan, options) {
  const opts = options || {};
  const musical = plan && plan.musical ? plan.musical : {};
  const timing = plan && plan.timing ? plan.timing : {};
  const tempo = Math.round(parseFloat(timing.tempoBpm || musical.tempoBpm) || 120);
  const meter = String(musical.meter || timing.meter || '4/4');
  const key = String(musical.key || 'major').trim();
  const rhythm = rhythmPercussionHint(musical.rhythm);
  const genres = Array.isArray(plan && plan.bibliographic && plan.bibliographic.genres)
    ? plan.bibliographic.genres.filter(Boolean).join(', ')
    : '';

  const parts = [
    tempo + ' BPM',
    meter,
    rhythm,
    key ? 'key of ' + key : '',
    genres,
    'dry acoustic drum kit and bodhrán',
    'no melody, no lead, no harmony, no pitched instruments, no vocals',
    'short practice rhythm loop',
  ].filter(Boolean);

  if (opts.includeChordLayer) {
    parts.push('very quiet room ambience only');
  }

  return parts.join(', ');
}

export function buildBackingNegativePrompt() {
  return DEFAULT_NEGATIVE;
}

export function loopBarCountForPlan(plan) {
  const timing = plan && plan.timing ? plan.timing : {};
  const boundaries = timing.barBoundariesSec;
  const barCount = Array.isArray(boundaries) ? Math.max(0, boundaries.length - 1) : 0;
  if (barCount <= 8) return Math.max(2, barCount);
  if (barCount <= 16) return 8;
  return 16;
}

export function loopDurationSecFromPlan(plan) {
  const timing = plan && plan.timing ? plan.timing : {};
  const boundaries = timing.barBoundariesSec;
  const barCount = Array.isArray(boundaries) ? Math.max(0, boundaries.length - 1) : 0;
  const total = parseFloat(timing.totalDurationSec) || 0;
  if (!(barCount > 0) || !(total > 0)) return Math.min(16, total || 8);
  const barDuration = total / barCount;
  const loopBars = loopBarCountForPlan(plan);
  return Math.max(2.0, Math.min(total, loopBars * barDuration));
}
