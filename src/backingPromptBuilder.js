/**
 * Deterministic backing prompts for practice-track generation (no LLM).
 */

const RHYTHM_HINTS = {
  reel: 'reel, bodhrán, rhythm guitar, 4/4',
  hornpipe: 'hornpipe, bodhrán, rhythm guitar, 4/4',
  jig: '6/8 jig, bodhrán, lilting rhythm, no rock drums',
  'double jig': '6/8 jig, bodhrán, lilting rhythm',
  'single jig': '6/8 jig, bodhrán, lilting rhythm',
  waltz: '3/4 waltz, gentle accordion or piano chords',
  polka: '2/4 polka, accordion rhythm, bright',
  march: 'march, snare and bass drum, steady',
  air: 'slow air, sparse harp or pad, very soft percussion',
};

const DEFAULT_NEGATIVE = 'melody, solo, lead instrument, vocals, spoken word, wrong tempo, epic orchestral';

function rhythmHint(rhythm) {
  const key = String(rhythm || '').trim().toLowerCase();
  if (!key) return 'traditional acoustic rhythm section';
  for (const entry of Object.keys(RHYTHM_HINTS)) {
    if (key.indexOf(entry) >= 0) return RHYTHM_HINTS[entry];
  }
  return key + ', acoustic rhythm section';
}

export function buildBackingPrompt(plan) {
  const musical = plan && plan.musical ? plan.musical : {};
  const timing = plan && plan.timing ? plan.timing : {};
  const tempo = Math.round(parseFloat(timing.tempoBpm || musical.tempoBpm) || 120);
  const meter = String(musical.meter || timing.meter || '4/4');
  const key = String(musical.key || 'major').trim();
  const rhythm = rhythmHint(musical.rhythm);
  const genres = Array.isArray(plan && plan.bibliographic && plan.bibliographic.genres)
    ? plan.bibliographic.genres.filter(Boolean).join(', ')
    : '';

  const parts = [
    tempo + ' BPM',
    meter,
    rhythm,
    key ? 'in ' + key : '',
    genres,
    'acoustic rhythm section, simple accompaniment',
    'no melody, no lead instrument, no vocals',
    'practice backing track',
  ].filter(Boolean);

  return parts.join(', ');
}

export function buildBackingNegativePrompt() {
  return DEFAULT_NEGATIVE;
}
