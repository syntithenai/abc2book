/**
 * Progressive toolbar expansion by container width + marks palette favorites.
 */

export const TOOLBAR_EXPAND_THRESHOLDS = {
  // Expand when container width is at least this many pixels.
  clipboard: 400,
  durations: 520,
  accidentals: 680,
  barlines: 800,
  palette: 920,
  tuplets: 1040,
  voices: 1160,
};

export const DEFAULT_MARK_FAVORITES = ['staccato', 'accent', 'tenuto', 'fermata'];
export const MARK_FAVORITES_STORAGE_KEY = 'notationMarkFavorites';

export const DEFAULT_BARLINE_FAVORITES = ['keyChange', 'meterChange'];
export const BARLINE_FAVORITES_STORAGE_KEY = 'notationBarlineFavorites';

export const DEFAULT_ACCIDENTAL_FAVORITES = ['1', '-1'];
export const ACCIDENTAL_FAVORITES_STORAGE_KEY = 'notationAccidentalFavorites';

export const DEFAULT_TUPLET_FAVORITES = ['3-2', '5-4'];
export const TUPLET_FAVORITES_STORAGE_KEY = 'notationTupletFavorites';

export const DEFAULT_NOTE_INPUT_FAVORITES = ['duration', 'rhythm'];
export const NOTE_INPUT_FAVORITES_STORAGE_KEY = 'notationNoteInputFavorites';

export function loadToolbarFavorites(storageKey, defaultKeys) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return (defaultKeys || []).slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return (defaultKeys || []).slice();
    return parsed.filter(function(k) { return typeof k === 'string' && k.length; });
  } catch (err) {
    return (defaultKeys || []).slice();
  }
}

export function saveToolbarFavorites(storageKey, keys) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys || []));
  } catch (err) { /* ignore */ }
}

export function toggleToolbarFavorite(favorites, key) {
  const list = (favorites || []).slice();
  const idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  return list;
}

export function expandFlagsForWidth(widthPx) {
  const w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 0;
  const t = TOOLBAR_EXPAND_THRESHOLDS;
  return {
    clipboard: w >= t.clipboard,
    durations: w >= t.durations,
    accidentals: w >= t.accidentals,
    barlines: w >= t.barlines,
    palette: w >= t.palette,
    tuplets: w >= t.tuplets,
    voices: w >= t.voices,
  };
}

export function loadMarkFavorites() {
  return loadToolbarFavorites(MARK_FAVORITES_STORAGE_KEY, DEFAULT_MARK_FAVORITES);
}

export function saveMarkFavorites(keys) {
  saveToolbarFavorites(MARK_FAVORITES_STORAGE_KEY, keys);
}

export function toggleMarkFavorite(favorites, key) {
  return toggleToolbarFavorite(favorites, key);
}

/** Compact icon/label for palette favorite buttons. */
export const MARK_COMPACT_LABELS = {
  _tie: 'Tie',
  _slurMode: 'Slur',
  _clearSlur: 'Clr',
  staccato: '.',
  tenuto: '–',
  accent: '>',
  wedge: '▾',
  breath: ',',
  trill: 'tr',
  mordent: 'mord',
  turn: '↻',
  pralltriller: 'pr',
  pppp: 'pppp',
  ppp: 'ppp',
  pp: 'pp',
  p: 'p',
  mp: 'mp',
  mf: 'mf',
  f: 'f',
  ff: 'ff',
  fff: 'fff',
  ffff: 'ffff',
  open: '○',
  snap: '↯',
  uppermordent: '℣',
  lowermordent: 'mord↓',
  finger0: '0',
  finger1: '1',
  finger2: '2',
  finger3: '3',
  finger4: '4',
  finger5: '5',
  coda: '𝄌',
  segno: '𝄋',
  fine: 'Fine',
  dc: 'D.C.',
  ds: 'D.S.',
  crescendoStart: 'cresc',
  crescendoEnd: 'cresc)',
  diminuendoStart: 'dim',
  diminuendoEnd: 'dim)',
  fermata: '𝄐',
  upbow: '∨',
  downbow: '∧',
};
