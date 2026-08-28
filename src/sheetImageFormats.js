/** Sheet image format labels shared by import / review UI. */

export const SHEET_FORMATS = {
  NOTATION_ONLY: 'notation_only',
  CHORD_CHART: 'chord_chart',
  LYRICS_ONLY: 'lyrics_only',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
};

export function normalizeSheetFormat(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (
    raw === SHEET_FORMATS.NOTATION_ONLY
    || raw === SHEET_FORMATS.CHORD_CHART
    || raw === SHEET_FORMATS.LYRICS_ONLY
    || raw === SHEET_FORMATS.MIXED
  ) {
    return raw;
  }
  return SHEET_FORMATS.UNKNOWN;
}

export function sheetFormatNeedsMelody(format) {
  const f = normalizeSheetFormat(format);
  return f === SHEET_FORMATS.NOTATION_ONLY || f === SHEET_FORMATS.MIXED || f === SHEET_FORMATS.UNKNOWN;
}

export function sheetFormatIsTextOnly(format) {
  const f = normalizeSheetFormat(format);
  return f === SHEET_FORMATS.CHORD_CHART || f === SHEET_FORMATS.LYRICS_ONLY;
}

export function sheetFormatLabel(format) {
  switch (normalizeSheetFormat(format)) {
    case SHEET_FORMATS.NOTATION_ONLY:
      return 'Notation';
    case SHEET_FORMATS.CHORD_CHART:
      return 'Chord chart';
    case SHEET_FORMATS.LYRICS_ONLY:
      return 'Lyrics';
    case SHEET_FORMATS.MIXED:
      return 'Mixed lead sheet';
    default:
      return 'Unknown format';
  }
}
