/**
 * Device-local per-tune display settings (not synced via Drive ABC).
 * Covers blocks/viewMode, zoom, fit-to-height, tablature, and activeVoices.
 */

export const TUNE_DISPLAY_SETTINGS_CHANGED = 'abcbook-tune-display-settings-changed';

const STORAGE_KEY = 'bookstorage_tune_display_settings';

export const TUNE_DISPLAY_SETTING_KEYS = [
  'viewMode',
  'zoom',
  'notationFit',
  'tablature',
  'tablatureVoices',
  'tablatureEnabled',
  'tabDisplay',
  'activeVoices',
];

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice();
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }
  return value;
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
  } catch (e) {
    // ignore quota errors
  }
}

function dispatchChanged(tuneId) {
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent(TUNE_DISPLAY_SETTINGS_CHANGED, {
      detail: { tuneId: tuneId },
    }));
  }
}

function pickDisplaySettings(source) {
  if (!source || typeof source !== 'object') return {};
  const out = {};
  TUNE_DISPLAY_SETTING_KEYS.forEach(function(key) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return;
    const value = source[key];
    if (value === undefined) return;
    out[key] = cloneValue(value);
  });
  return out;
}

function hasAnyDisplaySetting(settings) {
  if (!settings || typeof settings !== 'object') return false;
  return TUNE_DISPLAY_SETTING_KEYS.some(function(key) {
    return Object.prototype.hasOwnProperty.call(settings, key) && settings[key] !== undefined;
  });
}

export function getTuneDisplaySettings(tuneId) {
  if (!tuneId) return {};
  const all = readAllStored();
  const stored = all[tuneId];
  return stored && typeof stored === 'object' ? pickDisplaySettings(stored) : {};
}

export function setTuneDisplaySettings(tuneId, patch) {
  if (!tuneId) return {};
  const all = readAllStored();
  const prev = all[tuneId] && typeof all[tuneId] === 'object' ? all[tuneId] : {};
  const next = Object.assign({}, prev, pickDisplaySettings(patch));
  // Allow explicit clears via null
  TUNE_DISPLAY_SETTING_KEYS.forEach(function(key) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key) && patch[key] === null) {
      delete next[key];
    }
  });
  if (hasAnyDisplaySetting(next)) {
    all[tuneId] = next;
  } else {
    delete all[tuneId];
  }
  writeAllStored(all);
  dispatchChanged(tuneId);
  return pickDisplaySettings(next);
}

/**
 * Copy legacy display fields from a tune into localStorage when no entry exists yet.
 * Does not overwrite existing device-local settings.
 */
export function migrateTuneDisplaySettingsFromTune(tune) {
  if (!tune || !tune.id) return getTuneDisplaySettings(tune && tune.id);
  const existing = getTuneDisplaySettings(tune.id);
  if (hasAnyDisplaySetting(existing)) return existing;
  const fromTune = pickDisplaySettings(tune);
  if (!hasAnyDisplaySetting(fromTune)) return {};
  return setTuneDisplaySettings(tune.id, fromTune);
}

/**
 * If the tune carries display fields, store them (merge into local) then return settings.
 */
export function extractAndStoreTuneDisplaySettings(tune) {
  if (!tune || !tune.id) return {};
  const fromTune = pickDisplaySettings(tune);
  if (!hasAnyDisplaySetting(fromTune)) return getTuneDisplaySettings(tune.id);
  // Prefer preserving existing local keys; fill gaps from tune; overwrite keys present on tune
  // when the caller is actively saving those display fields on the in-memory tune.
  return setTuneDisplaySettings(tune.id, fromTune);
}

export function stripTuneDisplaySettings(tune) {
  if (!tune || typeof tune !== 'object') return tune;
  TUNE_DISPLAY_SETTING_KEYS.forEach(function(key) {
    delete tune[key];
  });
  return tune;
}

export function applyTuneDisplaySettings(tune) {
  if (!tune || !tune.id) return tune;
  migrateTuneDisplaySettingsFromTune(tune);
  const settings = getTuneDisplaySettings(tune.id);
  if (!hasAnyDisplaySetting(settings)) {
    stripTuneDisplaySettings(tune);
    return tune;
  }
  TUNE_DISPLAY_SETTING_KEYS.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      tune[key] = cloneValue(settings[key]);
    } else {
      delete tune[key];
    }
  });
  return tune;
}

/**
 * Prepare a tune for IndexedDB / Drive persistence: migrate display settings
 * into localStorage only when missing, then return a shallow clone without those keys.
 * Does not overwrite existing device-local settings (safe for Drive merge).
 * The original in-memory tune is left unchanged.
 */
export function persistableTuneWithoutDisplaySettings(tune) {
  if (!tune || typeof tune !== 'object') return tune;
  if (tune.id) migrateTuneDisplaySettingsFromTune(tune);
  const copy = Object.assign({}, tune);
  stripTuneDisplaySettings(copy);
  return copy;
}

/**
 * Apply device-local display settings to every tune in a book map (hydrate / merge).
 */
export function applyTuneDisplaySettingsToBook(tunes) {
  if (!tunes || typeof tunes !== 'object') return tunes;
  Object.keys(tunes).forEach(function(id) {
    if (tunes[id]) applyTuneDisplaySettings(tunes[id]);
  });
  return tunes;
}
