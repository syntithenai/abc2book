export const TASK_PRACTICE_TRACK = 'practice_track';
export const TASK_LINKED_COVER = 'linked_cover';

export const TASK_OPTIONS = [
  {
    id: TASK_PRACTICE_TRACK,
    label: 'Practice track from notation',
    description: 'Notation MIDI guides a styled AI accompaniment (Stable Audio).',
  },
  {
    id: TASK_LINKED_COVER,
    label: 'Style variant from linked recording',
    description: 'Re-imagine a linked media recording with AceStep cover generation.',
  },
];

export const PRESET_ORDER = ['fast', 'balanced', 'high'];

export function defaultPresetForTask(taskId) {
  if (taskId === TASK_LINKED_COVER) return 'balanced';
  return 'fast';
}

export function presetLabel(presetId) {
  if (presetId === 'balanced') return 'Balanced';
  if (presetId === 'high') return 'High';
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

export function mergeBackendsPresets(backends, taskId) {
  const tasks = backends && Array.isArray(backends.tasks) ? backends.tasks : [];
  const match = tasks.find(function(item) { return item.taskId === taskId; });
  return match && Array.isArray(match.presets) ? match.presets : [];
}

export function isTaskAvailable(backends, taskId) {
  const presets = mergeBackendsPresets(backends, taskId);
  return presets.some(function(preset) { return preset.available !== false; });
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
