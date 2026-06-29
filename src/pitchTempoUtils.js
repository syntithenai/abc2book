export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 2.0;
export const PITCH_MIN = -12;
export const PITCH_MAX = 12;
export const FINE_TUNE_MIN = -50;
export const FINE_TUNE_MAX = 50;
export const AUDIO_FILTER_MIN = 0;
export const AUDIO_FILTER_MAX = 2;
export const AUDIO_FILTER_KEYS = ['percussion', 'vocals', 'bass', 'guitar', 'piano', 'other'];
export const AUDIO_FILTER_KEYS_4STEM = ['percussion', 'vocals', 'bass', 'other'];
export const STEM_NAME_BY_FILTER = {
  percussion: 'drums',
  vocals: 'vocals',
  bass: 'bass',
  guitar: 'guitar',
  piano: 'piano',
  other: 'other',
};
export const DEFAULT_AUDIO_FILTERS = {
  percussion: 1,
  vocals: 1,
  bass: 1,
  guitar: 1,
  piano: 1,
  other: 1,
};

export function getAudioFilterKeysForDemucsModel(model) {
  if (model === 'htdemucs_6s') {
    return AUDIO_FILTER_KEYS.slice();
  }
  return AUDIO_FILTER_KEYS_4STEM.slice();
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function combinedPitchSemitones(pitchSemitones, fineTuneCents) {
  return clamp(pitchSemitones, PITCH_MIN, PITCH_MAX) + clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX) / 100;
}

export function formatPitchDisplay(pitch) {
  if (pitch === 0) return 'Original';
  return `${pitch > 0 ? '+' : ''}${pitch} st`;
}

export function formatFineTuneDisplay(cents) {
  if (cents === 0) return '0¢';
  return `${cents > 0 ? '+' : ''}${cents}¢`;
}

export function formatAudioFilterDisplay(value) {
  const amount = clamp(parseFloat(value), AUDIO_FILTER_MIN, AUDIO_FILTER_MAX);
  if (amount <= 0.001) return 'Muted';
  if (Math.abs(amount - 1) < 0.01) return '100%';
  return Math.round(amount * 100) + '%';
}

export function normalizeAudioFilters(filters) {
  const next = Object.assign({}, DEFAULT_AUDIO_FILTERS);
  if (!filters || typeof filters !== 'object') {
    return next;
  }
  Object.keys(DEFAULT_AUDIO_FILTERS).forEach(function(key) {
    const raw = filters[key];
    const parsed = parseFloat(raw);
    next[key] = clamp(isNaN(parsed) ? 1 : parsed, AUDIO_FILTER_MIN, AUDIO_FILTER_MAX);
  });
  return next;
}

export function audioFiltersAreNeutral(filters) {
  const normalized = normalizeAudioFilters(filters);
  return Object.keys(DEFAULT_AUDIO_FILTERS).every(function(key) {
    return Math.abs(normalized[key] - 1) < 0.001;
  });
}

export function playbackNeedsExternalProcessing(settings) {
  if (!settings) return false;
  const tempo = settings.tempo > 0 ? settings.tempo : 1;
  if (tempo !== 1 || settings.pitch !== 0 || settings.fineTune !== 0) {
    return true;
  }
  return !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters));
}

export function getAudioFilterSettings(tune) {
  if (!tune || !tune.playbackAudioFilters) {
    return normalizeAudioFilters(null);
  }
  return normalizeAudioFilters(tune.playbackAudioFilters);
}

export function getMediaPlaybackSettings(tune) {
  return Object.assign({}, getPlaybackSettings(tune), {
    audioFilters: getAudioFilterSettings(tune),
  });
}

export function getPlaybackSettings(tune) {
  if (!tune) {
    return { tempo: 1, pitch: 0, fineTune: 0 };
  }
  const tempo = tune.playbackTempo > 0 ? parseFloat(tune.playbackTempo) : 1;
  const pitch = tune.playbackPitch !== undefined && tune.playbackPitch !== null && tune.playbackPitch !== ''
    ? parseInt(tune.playbackPitch, 10) : 0;
  const fineTune = tune.playbackFineTune !== undefined && tune.playbackFineTune !== null && tune.playbackFineTune !== ''
    ? parseInt(tune.playbackFineTune, 10) : 0;
  return {
    tempo: clamp(tempo, TEMPO_MIN, TEMPO_MAX),
    pitch: clamp(isNaN(pitch) ? 0 : pitch, PITCH_MIN, PITCH_MAX),
    fineTune: clamp(isNaN(fineTune) ? 0 : fineTune, FINE_TUNE_MIN, FINE_TUNE_MAX),
  };
}

export function normalizePlaybackFields(tune) {
  if (!tune) return tune;
  const settings = getPlaybackSettings(tune);
  tune.playbackTempo = settings.tempo;
  tune.playbackPitch = settings.pitch;
  tune.playbackFineTune = settings.fineTune;
  tune.playbackAudioFilters = getAudioFilterSettings(tune);
  return tune;
}
