/**
 * Style presets for MIDI-guided AI full-band practice tracks.
 */

import { defaultDrumPresetIdForRhythm } from './drumPatternPresets';

export const DEFAULT_RENDER_STYLE = 'trad_session';

export const GUIDE_MODE_MIDI_WAV = 'midi_wav';
export const GUIDE_MODE_MIDI_CHROMA = 'midi_chroma';

export const PRACTICE_TRACK_STYLE_PRESETS = {
  trad_session: {
    id: 'trad_session',
    label: 'Trad session (Irish/Scottish)',
    description: 'Your tune on fiddle (from notation); AI adds guitar, bodhrán, and session backing.',
    drumPresetId: null,
    leadMidiProgram: 40,
    accompanimentMidiProgram: 24,
    backingPromptFocus: 'real Irish Scottish trad session recording, acoustic guitar chord backing, bodhrán, warm live session room',
    arrangementHint: 'restyle the guide into a trad session: clear fiddle melody with audible guitar and rhythm under the chart',
    negativeExtras: ['piano', 'lead melody', 'solo fiddle', 'general midi', 'cheap synthesizer', 'rock drums', 'electronic'],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: true,
    initNoiseLevel: 0.28,
  },
  old_time: {
    id: 'old_time',
    label: 'Old-time string band',
    description: 'Tune on fiddle from notation; AI adds banjo, guitar, and bass backing.',
    drumPresetId: 'folk-reel',
    leadMidiProgram: 40,
    accompanimentMidiProgram: 105,
    backingPromptFocus: 'old-time American string band accompaniment only, banjo guitar upright bass, no lead melody',
    arrangementHint: 'full string-band arrangement, strong audible chord accompaniment under a clear lead melody',
    negativeExtras: ['piano', 'lead melody', 'solo fiddle', 'drum kit', 'electronic', 'orchestra'],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: true,
  },
  reggae: {
    id: 'reggae',
    label: 'Reggae band',
    description: 'Melody from notation on lead guitar; AI adds skank, bass, organ, and drums.',
    drumPresetId: 'funk-laidback',
    leadMidiProgram: 25,
    accompanimentMidiProgram: 27,
    backingPromptFocus: 'roots reggae accompaniment only, skank guitar, electric bass, Hammond organ, one drop drums, no lead melody',
    arrangementHint: 'full reggae band arrangement, strong audible skank and bass under a clear lead melody',
    negativeExtras: ['piano', 'lead melody', 'solo guitar', 'metal', 'orchestra', 'cheap synth'],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: true,
  },
  classical: {
    id: 'classical',
    label: 'Classical chamber',
    description: 'Tune on solo violin from notation; AI adds restrained string accompaniment.',
    drumPresetId: 'minimal-hat',
    leadMidiProgram: 40,
    // Soft string ensemble pads (sustained in the guide — not boom-chick cello).
    accompanimentMidiProgram: 48,
    backingPromptFocus:
      'real recorded bowed string chamber ensemble, expressive solo violin, clear cello bass and viola harmony under every bar, tight ensemble timing, continuous accompaniment through the whole piece',
    arrangementHint:
      'restyle the guide into chamber strings: clear solo violin with defined sustained harmony under every bar, no dropout after mid-song, no ambient wash',
    negativeExtras: [
      'piano',
      'lead melody',
      'drum kit',
      'electric guitar',
      'acoustic guitar',
      'folk guitar',
      'strumming',
      'guitar fill',
      'bodhrán',
      'banjo',
      'synth',
      'vocals',
      'trad session',
      'church organ',
      'pipe organ',
      'Hammond organ',
      'organ pad',
      'fuzzy synth',
      'lo-fi',
      'distortion',
      'oom pah',
      'oompah',
      'polka bass',
      'brass band',
      'tuba',
      'marching bass',
      'waltz bass',
      'boom chick',
      'solo violin only',
      'no accompaniment',
      'thin arrangement',
      'melody only',
      'ambient wash',
      'reverb soup',
      'dropout',
      'silence after midway',
      'sparse second half',
    ],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: false,
    // Stronger guide lock reduces wash and mid-track pad drift.
    initNoiseLevel: 0.22,
  },
  custom: {
    id: 'custom',
    label: 'Custom prompt',
    description: 'Tune melody from notation MIDI; your prompt controls the AI backing only.',
    drumPresetId: null,
    leadMidiProgram: 40,
    accompanimentMidiProgram: 24,
    backingPromptFocus: '',
    negativeExtras: ['piano', 'lead melody', 'general midi', 'cheap synthesizer'],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: true,
  },
};

export function getStylePreset(styleId) {
  const id = String(styleId || DEFAULT_RENDER_STYLE);
  return PRACTICE_TRACK_STYLE_PRESETS[id] || PRACTICE_TRACK_STYLE_PRESETS[DEFAULT_RENDER_STYLE];
}

export function resolveLeadMidiProgram(styleId) {
  const preset = getStylePreset(styleId);
  const program = parseInt(preset.leadMidiProgram, 10);
  return Number.isFinite(program) ? Math.max(0, Math.min(127, program)) : 40;
}

export function resolveAccompanimentMidiProgram(styleId) {
  const preset = getStylePreset(styleId);
  const program = parseInt(preset.accompanimentMidiProgram, 10);
  return Number.isFinite(program) ? Math.max(0, Math.min(127, program)) : 24;
}

export function listStylePresetOptions() {
  return Object.keys(PRACTICE_TRACK_STYLE_PRESETS).map(function(key) {
    const preset = PRACTICE_TRACK_STYLE_PRESETS[key];
    return {
      id: preset.id,
      label: preset.label,
      description: preset.description,
    };
  });
}

function rhythmDrumPresetId(plan) {
  const rhythm = plan && plan.musical ? plan.musical.rhythm : '';
  return defaultDrumPresetIdForRhythm(rhythm);
}

export function resolveDrumPresetIdForStyle(styleId, plan) {
  const preset = getStylePreset(styleId);
  if (preset.drumPresetId) return preset.drumPresetId;
  return rhythmDrumPresetId(plan);
}

/** Waltzes / airs should not get MIDI drum kits in the guide or mix. */
export function isSoftRhythm(planOrRhythm) {
  const rhythm = typeof planOrRhythm === 'string'
    ? planOrRhythm
    : (planOrRhythm && planOrRhythm.musical && planOrRhythm.musical.rhythm) || '';
  return /waltz|air|hymn|ballad|lullaby|slow air/.test(String(rhythm || '').toLowerCase());
}

export function shouldIncludeDrumGuide(styleId, plan) {
  if (isSoftRhythm(plan)) return false;
  return !!getStylePreset(styleId).includeDrumGuideDefault;
}

export function buildStyleBackingPrompt(plan, styleId, options) {
  const opts = options || {};
  const preset = getStylePreset(styleId);
  if (preset.id === 'custom' && opts.customPrompt) {
    return String(opts.customPrompt).trim();
  }
  const guideConditioning = opts.guideConditioning !== false
    && (plan && plan.guideAudioConditioning !== false);
  const musical = plan && plan.musical ? plan.musical : {};
  const timing = plan && plan.timing ? plan.timing : {};
  const tempo = Math.round(parseFloat(timing.tempoBpm || musical.tempoBpm) || 120);
  const meter = String(musical.meter || timing.meter || '4/4');
  const key = String(musical.key || '').trim();
  const genres = Array.isArray(plan && plan.bibliographic && plan.bibliographic.genres)
    ? plan.bibliographic.genres.filter(Boolean).join(', ')
    : '';

  if (guideConditioning) {
    const styleFocus = preset.backingPromptFocus
      || 'style-matched accompaniment';
    const arrangementHint = preset.arrangementHint
      || 'full band arrangement, strong audible chord accompaniment under a clear lead melody';
    const parts = [
      tempo + ' BPM',
      meter,
      arrangementHint,
      styleFocus,
      'restyle guide pitches and chord changes into real recorded instruments, not General MIDI',
      'follow guide melody contour and chord changes note for note',
      'keep every melody note audible and in time',
      'keep accompaniment continuous under every bar through the full length',
      key ? 'key of ' + key : '',
      genres,
      'dry mix, practice track',
    ].filter(Boolean);
    return parts.join(', ');
  }

  const parts = [
    tempo + ' BPM',
    meter,
    preset.backingPromptFocus,
    key ? 'key of ' + key : '',
    genres,
    'accompaniment and rhythm only, no lead melody, no piano, no solo instrument',
    'dry mix, practice backing track',
  ].filter(Boolean);

  return parts.join(', ');
}

export function buildStyleNegativePrompt(styleId, options) {
  const opts = options || {};
  const guideConditioning = opts.guideConditioning === true;
  const preset = getStylePreset(styleId);
  const base = [
    'piano',
    'acoustic piano',
    'bright piano',
    'general midi',
    'cheap synthesizer',
    'midi piano',
    'vocals',
    'spoken word',
    'wrong tempo',
    'ambient wash',
    'reverb tail',
    'solo melody only',
    'a cappella',
    'thin arrangement',
    'no accompaniment',
    'church organ',
    'pipe organ',
    'wrong melody',
    'improvised melody',
    'substitute chords',
    'wrong chords',
    'harmonic drift',
    'oom pah',
    'oompah',
    'organ pad',
    'missing melody notes',
    'sparse melody',
    'muzak strings',
  ];
  if (!guideConditioning) {
    base.push(
      'lead melody',
      'solo melody',
      'solo violin',
      'solo fiddle',
    );
  }
  return base.concat(preset.negativeExtras || []).filter(function(term, index, arr) {
    if (!guideConditioning) return true;
    return !/lead melody|solo melody|solo fiddle|solo violin|no lead/i.test(String(term));
  }).join(', ');
}
