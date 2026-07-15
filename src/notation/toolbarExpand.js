/**
 * Progressive toolbar expansion by container width + marks palette favorites.
 */

export const TOOLBAR_EXPAND_THRESHOLDS = {
  // Expand when container width is at least this many pixels.
  durations: 520,
  accidentals: 680,
  barlines: 800,
  palette: 920,
  tuplets: 1040,
  voices: 1160,
};

export const DEFAULT_MARK_FAVORITES = ['staccato', 'accent', 'tenuto', 'fermata'];
export const MARK_FAVORITES_STORAGE_KEY = 'notationMarkFavorites';

export function expandFlagsForWidth(widthPx) {
  const w = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 0;
  const t = TOOLBAR_EXPAND_THRESHOLDS;
  return {
    durations: w >= t.durations,
    accidentals: w >= t.accidentals,
    barlines: w >= t.barlines,
    palette: w >= t.palette,
    tuplets: w >= t.tuplets,
    voices: w >= t.voices,
  };
}

export function loadMarkFavorites() {
  try {
    const raw = localStorage.getItem(MARK_FAVORITES_STORAGE_KEY);
    if (!raw) return DEFAULT_MARK_FAVORITES.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_MARK_FAVORITES.slice();
    return parsed.filter(function(k) { return typeof k === 'string' && k.length; });
  } catch (err) {
    return DEFAULT_MARK_FAVORITES.slice();
  }
}

export function saveMarkFavorites(keys) {
  try {
    localStorage.setItem(MARK_FAVORITES_STORAGE_KEY, JSON.stringify(keys || []));
  } catch (err) { /* ignore */ }
}

export function toggleMarkFavorite(favorites, key) {
  const list = (favorites || []).slice();
  const idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  return list;
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
  p: 'p',
  mp: 'mp',
  mf: 'mf',
  f: 'f',
  ff: 'ff',
  crescendoStart: 'cresc',
  crescendoEnd: 'cresc)',
  diminuendoStart: 'dim',
  diminuendoEnd: 'dim)',
  fermata: '𝄐',
  upbow: '∨',
  downbow: '∧',
};
