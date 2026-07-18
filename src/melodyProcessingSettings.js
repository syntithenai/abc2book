export const MELODY_PROCESSING_STORAGE_KEY = 'bookstorage_melody_processing';

export const MELODY_PROCESSING_DEFAULTS = {
  musicType: 'vocal',
  sourceSeparation: 'auto',
  melodyBackend: 'auto',
  melodyVoicing: '',
  demucsModel: '',
  noiseMode: 'balanced',
  confidenceThreshold: 0.55,
  minNoteSeconds: 0.12,
  quantizeStrength: 0.7,
  snapToScale: false,
  applyAudioFilters: true,
  whisperLanguage: 'en',
  enableMeterChanges: false,
  precreateStemsBeforeAnalyze: true,
  constrainChordsToKey: true,
  chordChangeGrid: 'half-bar',
  detectedKey: '',
  analysisAudioFilters: null,
};

/** Stem keys used by analysis mixes (matches local-resolver audio_analysis_filters). */
export const ANALYSIS_STEM_KEYS = ['vocals', 'drums', 'bass', 'other', 'piano', 'guitar'];
export const ANALYSIS_STEM_KEYS_4 = ['vocals', 'drums', 'bass', 'other'];

export function resolveDemucsModelForSettings(settings, fallbackModel) {
  const musicType = settings && settings.musicType ? String(settings.musicType).toLowerCase() : 'vocal';
  if (musicType === 'piano') return 'htdemucs_6s';
  const explicit = settings && settings.demucsModel ? String(settings.demucsModel).trim() : '';
  if (explicit === 'htdemucs' || explicit === 'htdemucs_6s' || explicit === 'htdemucs_ft') {
    return explicit;
  }
  return (fallbackModel && String(fallbackModel).trim()) || 'htdemucs';
}

export function resolveMelodyVoicing(settings) {
  const explicit = settings && settings.melodyVoicing
    ? String(settings.melodyVoicing).trim().toLowerCase()
    : '';
  if (explicit === 'full') return 'full';
  if (explicit === 'melody-line' || explicit === 'melody_line' || explicit === 'melodyline') {
    return 'melody-line';
  }
  if (settings && String(settings.musicType || '').toLowerCase() === 'piano') {
    return 'full';
  }
  return 'melody-line';
}

export function getAnalysisStemKeysForSettings(settings, demucsModel) {
  const model = demucsModel || resolveDemucsModelForSettings(settings);
  const musicType = settings && settings.musicType ? String(settings.musicType).toLowerCase() : 'vocal';
  if (model === 'htdemucs_6s' || musicType === 'piano') {
    return ANALYSIS_STEM_KEYS.slice();
  }
  return ANALYSIS_STEM_KEYS_4.slice();
}

export const NOISE_MODE_PRESETS = {
  sparse: { confidenceThreshold: 0.7, minNoteSeconds: 0.18 },
  balanced: { confidenceThreshold: 0.55, minNoteSeconds: 0.12 },
  permissive: { confidenceThreshold: 0.35, minNoteSeconds: 0.08 },
};

export const ANALYSIS_FILTER_PRESETS = {
  vocal: {
    melody: { vocals: 1, drums: 0, bass: 0, other: 0 },
    chords: { vocals: 0, drums: 0, bass: 1, other: 1 },
    lyrics: { vocals: 1, drums: 0, bass: 0, other: 0 },
  },
  instrumental: {
    melody: { vocals: 0, drums: 0, bass: 0.85, other: 1 },
    chords: { vocals: 0, drums: 0, bass: 1, other: 1 },
    lyrics: { vocals: 0, drums: 0, bass: 0.5, other: 1 },
  },
  piano: {
    melody: { vocals: 0, drums: 0, bass: 0, other: 0, piano: 1, guitar: 0 },
    chords: { vocals: 0, drums: 0, bass: 1, other: 0.5, piano: 1, guitar: 0 },
    lyrics: { vocals: 0, drums: 0, bass: 0, other: 0, piano: 1 },
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
    snapToScale: !!loaded.snapToScale,
  };
}

export function buildAnalysisProcessingPayload(processingSettings, noteSettings, transcriptionHints) {
  const resolved = resolveMelodyProcessing(Object.assign({}, processingSettings, noteSettings || {}));
  const hints = transcriptionHints || {};
  const whisperPrompt = [
    hints.name,
    hints.composer,
    Array.isArray(hints.existingLyrics) ? hints.existingLyrics.join(' ') : hints.existingLyrics,
  ].filter(function(part) { return part && String(part).trim(); }).join(' ').trim();
  const demucsModel = resolveDemucsModelForSettings(resolved, hints.demucsModel);
  const melodyVoicing = resolveMelodyVoicing(resolved);
  return {
    musicType: resolved.musicType,
    sourceSeparation: resolved.sourceSeparation,
    melodyBackend: resolved.melodyBackend || 'auto',
    melodyVoicing: melodyVoicing,
    demucsModel: demucsModel,
    noiseMode: resolved.noiseMode,
    confidenceThreshold: resolved.confidenceThreshold,
    minNoteSeconds: resolved.minNoteSeconds,
    quantizeStrength: resolved.quantizeStrength,
    snapToScale: !!resolved.snapToScale,
    applyAudioFilters: resolved.applyAudioFilters !== false,
    whisperPrompt: whisperPrompt,
    whisperLanguage: resolved.whisperLanguage || 'en',
    enableMeterChanges: !!resolved.enableMeterChanges,
    precreateStemsBeforeAnalyze: resolved.precreateStemsBeforeAnalyze !== false,
    constrainChordsToKey: resolved.constrainChordsToKey !== false,
    chordChangeGrid: resolved.chordChangeGrid || 'half-bar',
    detectedKey: resolved.detectedKey || hints.key || '',
    key: resolved.detectedKey || hints.key || '',
    stemCacheId: hints.stemCacheId || resolved.stemCacheId || '',
    analysisAudioFilters: {
      melody: getAnalysisAudioFilters(resolved, 'melody'),
      chords: getAnalysisAudioFilters(resolved, 'chords'),
      lyrics: getAnalysisAudioFilters(resolved, 'lyrics'),
    },
  };
}
