export const MELODY_PROCESSING_STORAGE_KEY = 'bookstorage_melody_processing';

export const MELODY_PROCESSING_DEFAULTS = {
  musicType: 'vocal',
  sourceSeparation: 'auto',
  noiseMode: 'balanced',
  confidenceThreshold: 0.55,
  minNoteSeconds: 0.12,
  quantizeStrength: 0.7,
  applyAudioFilters: true,
};

export const NOISE_MODE_PRESETS = {
  sparse: { confidenceThreshold: 0.7, minNoteSeconds: 0.18 },
  balanced: { confidenceThreshold: 0.55, minNoteSeconds: 0.12 },
  permissive: { confidenceThreshold: 0.35, minNoteSeconds: 0.08 },
};

export const ANALYSIS_FILTER_PRESETS = {
  vocal: {
    melody: { vocals: 1, drums: 0, bass: 0, other: 0 },
    chords: { vocals: 0.35, drums: 0.45, bass: 1, other: 1 },
    lyrics: { vocals: 1, drums: 0, bass: 0, other: 0 },
  },
  instrumental: {
    melody: { vocals: 0, drums: 0, bass: 0.85, other: 1 },
    chords: { vocals: 0, drums: 0.4, bass: 1, other: 1 },
    lyrics: { vocals: 0, drums: 0, bass: 0.5, other: 1 },
  },
};

export function getAnalysisAudioFilters(settings, task) {
  const musicType = settings && settings.musicType ? settings.musicType : 'vocal';
  const preset = ANALYSIS_FILTER_PRESETS[musicType] || ANALYSIS_FILTER_PRESETS.vocal;
  if (settings && settings.analysisAudioFilters && settings.analysisAudioFilters[task]) {
    return Object.assign({}, preset[task], settings.analysisAudioFilters[task]);
  }
  return Object.assign({}, preset[task]);
}

export function resolveMelodyProcessing(settings) {
  const base = Object.assign({}, MELODY_PROCESSING_DEFAULTS, settings || {});
  const preset = NOISE_MODE_PRESETS[base.noiseMode] || NOISE_MODE_PRESETS.balanced;
  return Object.assign({}, base, preset);
}

export function loadMelodyProcessingSettings() {
  try {
    const raw = localStorage.getItem(MELODY_PROCESSING_STORAGE_KEY);
    if (!raw) return resolveMelodyProcessing({});
    return resolveMelodyProcessing(JSON.parse(raw));
  } catch (e) {
    return resolveMelodyProcessing({});
  }
}

export function saveMelodyProcessingSettings(settings) {
  const resolved = resolveMelodyProcessing(settings);
  localStorage.setItem(MELODY_PROCESSING_STORAGE_KEY, JSON.stringify(resolved));
  return resolved;
}

export function loadMelodyNoteSettings() {
  const loaded = loadMelodyProcessingSettings();
  return {
    noiseMode: loaded.noiseMode,
    confidenceThreshold: loaded.confidenceThreshold,
    minNoteSeconds: loaded.minNoteSeconds,
    quantizeStrength: loaded.quantizeStrength,
  };
}

export function buildAnalysisProcessingPayload(processingSettings, noteSettings) {
  const resolved = resolveMelodyProcessing(Object.assign({}, processingSettings, noteSettings || {}));
  return {
    musicType: resolved.musicType,
    sourceSeparation: resolved.sourceSeparation,
    noiseMode: resolved.noiseMode,
    confidenceThreshold: resolved.confidenceThreshold,
    minNoteSeconds: resolved.minNoteSeconds,
    quantizeStrength: resolved.quantizeStrength,
    applyAudioFilters: resolved.applyAudioFilters !== false,
    analysisAudioFilters: {
      melody: getAnalysisAudioFilters(resolved, 'melody'),
      chords: getAnalysisAudioFilters(resolved, 'chords'),
      lyrics: getAnalysisAudioFilters(resolved, 'lyrics'),
    },
  };
}
