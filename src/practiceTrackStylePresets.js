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
    backingPromptFocus: 'Irish Scottish trad session accompaniment only, acoustic guitar chords, bodhrán, rhythm section',
    negativeExtras: ['piano', 'lead melody', 'solo fiddle', 'general midi', 'cheap synthesizer', 'rock drums', 'electronic'],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: true,
  },
  old_time: {
    id: 'old_time',
    label: 'Old-time string band',
    description: 'Tune on fiddle from notation; AI adds banjo, guitar, and bass backing.',
    drumPresetId: 'folk-reel',
    leadMidiProgram: 40,
    backingPromptFocus: 'old-time American string band accompaniment only, banjo guitar upright bass, no lead melody',
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
    backingPromptFocus: 'roots reggae accompaniment only, skank guitar, electric bass, Hammond organ, one drop drums, no lead melody',
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
    backingPromptFocus: 'classical chamber accompaniment only, viola cello bass harmony, restrained dynamics, no solo lead',
    negativeExtras: ['piano', 'lead melody', 'drum kit', 'electric guitar', 'synth', 'vocals'],
    includeChordLayerDefault: false,
    includeDrumGuideDefault: false,
  },
  custom: {
    id: 'custom',
    label: 'Custom prompt',
    description: 'Tune melody from notation MIDI; your prompt controls the AI backing only.',
    drumPresetId: null,
    leadMidiProgram: 40,
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

export function buildStyleBackingPrompt(plan, styleId, options) {
  const opts = options || {};
  const preset = getStylePreset(styleId);
  if (preset.id === 'custom' && opts.customPrompt) {
    return String(opts.customPrompt).trim();
  }
  const musical = plan && plan.musical ? plan.musical : {};
  const timing = plan && plan.timing ? plan.timing : {};
  const tempo = Math.round(parseFloat(timing.tempoBpm || musical.tempoBpm) || 120);
  const meter = String(musical.meter || timing.meter || '4/4');
  const key = String(musical.key || '').trim();
  const genres = Array.isArray(plan && plan.bibliographic && plan.bibliographic.genres)
    ? plan.bibliographic.genres.filter(Boolean).join(', ')
    : '';

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

export function buildStyleNegativePrompt(styleId) {
  const preset = getStylePreset(styleId);
  const base = [
    'piano',
    'acoustic piano',
    'bright piano',
    'lead melody',
    'solo melody',
    'solo violin',
    'solo fiddle',
    'general midi',
    'cheap synthesizer',
    'midi piano',
    'vocals',
    'spoken word',
    'wrong tempo',
    'ambient wash',
    'reverb tail',
  ];
  return base.concat(preset.negativeExtras || []).join(', ');
}
