import { NOTATION_FIT_HORIZONTAL, NOTATION_FIT_VERTICAL } from './gigNotationFit';

const NOTATION_FIT_MODE_KEY = 'bookstorage_notation_fit_mode';

/** Tall scores use fit-height by default; short scores stay fit-width. */
export const NOTATION_FIT_HEIGHT_MIN_LINES = 5;

function voiceKeysForCount(tune, activeVoiceKeys) {
  if (Array.isArray(activeVoiceKeys) && activeVoiceKeys.length > 0) {
    return activeVoiceKeys;
  }
  if (!tune || !tune.voices || typeof tune.voices !== 'object') return [];
  return Object.keys(tune.voices);
}

/**
 * Count source notation lines for a tune (max non-empty note lines among
 * active voices, or all voices when activeVoiceKeys is omitted).
 */
export function countTuneNotationLines(tune, activeVoiceKeys) {
  if (!tune || !tune.voices || typeof tune.voices !== 'object') return 0;
  const keys = voiceKeysForCount(tune, activeVoiceKeys);
  let maxLines = 0;
  keys.forEach(function(key) {
    const voice = tune.voices[key];
    const notes = voice && voice.notes;
    if (!Array.isArray(notes)) return;
    let count = 0;
    for (let i = 0; i < notes.length; i += 1) {
      if (String(notes[i] || '').trim()) count += 1;
    }
    if (count > maxLines) maxLines = count;
  });
  return maxLines;
}

/**
 * Approximate vertical footprint: each source line stacks one staff per active voice.
 * e.g. 3 lines × 2 active voices → 6.
 */
export function effectiveNotationLineCount(tune, activeVoiceKeys) {
  const lines = countTuneNotationLines(tune, activeVoiceKeys);
  const voiceCount = voiceKeysForCount(tune, activeVoiceKeys).length;
  return lines * Math.max(1, voiceCount);
}

/**
 * Default fit mode: height when (source lines × active voices) is 5 or more;
 * otherwise width. e.g. 2 voices × 2 lines stays width; 2 × 3 or 1 × 5 uses height.
 */
export function defaultNotationFitModeForTune(tune, activeVoiceKeys) {
  return effectiveNotationLineCount(tune, activeVoiceKeys) >= NOTATION_FIT_HEIGHT_MIN_LINES
    ? NOTATION_FIT_VERTICAL
    : NOTATION_FIT_HORIZONTAL;
}

export function getNotationFitMode() {
  try {
    const raw = localStorage.getItem(NOTATION_FIT_MODE_KEY);
    if (raw === NOTATION_FIT_VERTICAL) return NOTATION_FIT_VERTICAL;
    return NOTATION_FIT_HORIZONTAL;
  } catch (e) {
    return NOTATION_FIT_HORIZONTAL;
  }
}

export function setNotationFitMode(mode) {
  const next = mode === NOTATION_FIT_VERTICAL ? NOTATION_FIT_VERTICAL : NOTATION_FIT_HORIZONTAL;
  try {
    localStorage.setItem(NOTATION_FIT_MODE_KEY, next);
  } catch (e) {
    // ignore quota errors
  }
  return next;
}

export function toggleNotationFitMode() {
  const current = getNotationFitMode();
  return setNotationFitMode(
    current === NOTATION_FIT_VERTICAL ? NOTATION_FIT_HORIZONTAL : NOTATION_FIT_VERTICAL
  );
}
