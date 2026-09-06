export const TASK_PRACTICE_TRACK = 'practice_track';
export const TASK_LINKED_COVER = 'linked_cover';

export const TASK_OPTIONS = [
  {
    id: TASK_PRACTICE_TRACK,
    label: 'Practice track from notation',
    description: 'MIDI-guided Stable Audio arrangement — melody and chords from notation, style from the preset.',
  },
  {
    id: TASK_LINKED_COVER,
    label: 'Style variant from linked recording',
    description: 'Re-imagine a linked media recording with AceStep cover generation.',
  },
];

export const PRESET_ORDER = ['fast', 'balanced', 'high', 'ace_fidelity'];

export function defaultPresetForTask(taskId) {
  if (taskId === TASK_LINKED_COVER) return 'balanced';
  return 'balanced';
}

export function presetLabel(presetId) {
  if (presetId === 'ace_fidelity') return 'AceStep cover (experimental)';
  if (presetId === 'balanced') return 'Balanced';
  if (presetId === 'high') return 'High';
  if (presetId === 'fast') return 'Fast';
  return 'Fast';
}

export function taskLabel(taskId) {
  if (taskId === TASK_LINKED_COVER) return 'Linked cover';
  return 'Practice track';
}

export function linkTitleForTask(taskId, tuneName) {
  const base = tuneName || 'Tune';
  if (taskId === TASK_LINKED_COVER) return base + ' (AI cover)';
  return base + ' (AI arrangement)';
}

export function formatAudioGenerationError(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Audio generation failed';
  const unknownModel = raw.match(/unknown model id:\s*([^"}\s]+)/i);
  if (unknownModel) {
    return (
      'The selected quality preset needs the '
      + unknownModel[1]
      + ' model, which is not installed on audio.cpp. Choose Fast or install the model.'
    );
  }
  if (raw.indexOf('audio.cpp HTTP 500') === 0) {
    return formatAudioGenerationError(raw.replace(/^audio\.cpp HTTP 500:\s*/, ''));
  }
  if (/heavy job queue busy|audio generation in progress|gpu prep failed|gpu_busy/i.test(raw)) {
    return 'GPU is busy with another job. Wait for it to finish, then try again.';
  }
  return raw;
}

export function mergeBackendsPresets(backends, taskId) {
  const tasks = backends && Array.isArray(backends.tasks) ? backends.tasks : [];
  const match = tasks.find(function(item) { return item.taskId === taskId; });
  return match && Array.isArray(match.presets) ? match.presets : [];
}

export function isTaskAvailable(backends, taskId) {
  const presets = mergeBackendsPresets(backends, taskId);
  return presets.some(function(preset) { return preset.available !== false; });
}

/**
 * Quality presets for the wizard / regenerate UI.
 * When the backends payload lists presets, use those (including available:false).
 * When backends are missing, fall back to all presets as available — unless the
 * payload already reported the provider as down (ok:false).
 */
export function listQualityPresetOptions(backends, taskId) {
  const fromBackends = mergeBackendsPresets(backends, taskId);
  if (fromBackends.length) return fromBackends;
  const unavailable = audioGenerationUnavailableMessage(backends);
  if (unavailable) return [];
  return PRESET_ORDER.map(function(id) {
    return { id: id, label: presetLabel(id), available: true };
  });
}

export function listAvailableQualityPresets(backends, taskId) {
  return listQualityPresetOptions(backends, taskId).filter(function(preset) {
    return preset.available !== false;
  });
}

/** Human-readable reason when /generate-audio/backends reports the sidecar down. */
export function audioGenerationUnavailableMessage(backends) {
  if (!backends || backends.ok !== false) return '';
  const provider = backends.provider || {};
  const name = String(provider.provider || '').toLowerCase();
  const detail = String(provider.message || '').trim();
  if (name === 'audio_cpp' || name === 'audiocpp' || name === 'audio.cpp') {
    return (
      'audio.cpp sidecar is not available'
      + (detail ? ' (' + detail + ')' : '')
      + '. Start it with: systemctl --user start abc2book-audio-cpp'
    );
  }
  if (detail) return detail;
  return 'Audio generation backends are not available right now.';
}
