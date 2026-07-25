import { resolvePrimaryVoiceKey } from './abcVoiceUtils';

const STORAGE_KEY = 'bookstorage_tune_voice_view_settings';
export const VOICE_VIEW_SETTINGS_CHANGED = 'abcbook-voice-view-settings-changed';

function sortVoiceKeys(voiceKeys) {
  return voiceKeys.slice().sort(function(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

export function getTuneVoiceKeys(tune) {
  if (!tune || !tune.voices || typeof tune.voices !== 'object') return [];
  return sortVoiceKeys(Object.keys(tune.voices));
}

function readAllStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeAllStored(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
  } catch (e) {}
}

export function defaultVoiceViewSettings(voiceKeys) {
  const visible = {};
  const playable = {};
  (voiceKeys || []).forEach(function(key) {
    visible[key] = true;
    playable[key] = true;
  });
  return { visible, playable };
}

export function normalizeVoiceViewSettings(voiceKeys, stored) {
  const defaults = defaultVoiceViewSettings(voiceKeys);
  if (!stored || typeof stored !== 'object') return defaults;
  const visible = Object.assign({}, defaults.visible);
  const playable = Object.assign({}, defaults.playable);
  voiceKeys.forEach(function(key) {
    if (stored.visible && Object.prototype.hasOwnProperty.call(stored.visible, key)) {
      visible[key] = !!stored.visible[key];
    }
    if (stored.playable && Object.prototype.hasOwnProperty.call(stored.playable, key)) {
      playable[key] = !!stored.playable[key];
    }
  });
  return { visible, playable };
}

export function getVoiceViewSettings(tuneId, voiceKeys) {
  if (!tuneId) return defaultVoiceViewSettings(voiceKeys);
  const all = readAllStored();
  return normalizeVoiceViewSettings(voiceKeys, all[tuneId]);
}

export function setVoiceViewSettings(tuneId, settings, voiceKeys) {
  if (!tuneId) return normalizeVoiceViewSettings(voiceKeys, settings);
  const all = readAllStored();
  all[tuneId] = normalizeVoiceViewSettings(voiceKeys, settings);
  writeAllStored(all);
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent(VOICE_VIEW_SETTINGS_CHANGED, {
      detail: { tuneId: tuneId },
    }));
  }
  return all[tuneId];
}

export function selectedVoiceKeys(voiceKeys, flagsByKey) {
  const selected = (voiceKeys || []).filter(function(key) {
    return !flagsByKey || flagsByKey[key] !== false;
  });
  if (selected.length > 0) return selected;
  const primary = resolvePrimaryVoiceKey(
    (voiceKeys || []).reduce(function(acc, key) {
      acc[key] = true;
      return acc;
    }, {})
  );
  return primary ? [primary] : [];
}

export function getVisibleVoiceKeys(tuneId, voiceKeys) {
  const settings = getVoiceViewSettings(tuneId, voiceKeys);
  return selectedVoiceKeys(voiceKeys, settings.visible);
}

export function getPlayableVoiceKeys(tuneId, voiceKeys) {
  const settings = getVoiceViewSettings(tuneId, voiceKeys);
  return selectedVoiceKeys(voiceKeys, settings.playable);
}

/** Voices included in both display and playback (single-view voice toggles keep these in sync). */
export function getPlaybackVoiceKeys(tuneId, voiceKeys) {
  const settings = getVoiceViewSettings(tuneId, voiceKeys);
  const flags = {};
  (voiceKeys || []).forEach(function(key) {
    flags[key] = settings.visible[key] !== false && settings.playable[key] !== false;
  });
  return selectedVoiceKeys(voiceKeys, flags);
}

export function hasFilteredPlaybackVoices(tune) {
  const voiceKeys = getTuneVoiceKeys(tune);
  if (voiceKeys.length <= 1) return false;
  return getPlaybackVoiceKeys(tune.id, voiceKeys).length < voiceKeys.length;
}

/** Indices of tune.activeVoices within voiceKeys; defaults to all voices when unset. */
export function activeVoiceIndicesFromTune(tune, voiceKeys) {
  const keys = voiceKeys && voiceKeys.length ? voiceKeys : getTuneVoiceKeys(tune);
  if (!tune || !Array.isArray(tune.activeVoices)) {
    return keys.map(function(_key, index) { return index; });
  }
  const indices = [];
  tune.activeVoices.forEach(function(key) {
    const idx = keys.indexOf(key);
    if (idx >= 0) indices.push(idx);
  });
  return indices.sort(function(a, b) { return a - b; });
}
