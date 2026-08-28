import { normalizeSheetFormat, sheetFormatIsTextOnly, sheetFormatLabel, SHEET_FORMATS } from './sheetImageFormats';

describe('sheetImageFormats', function() {
  test('normalizeSheetFormat', function() {
    expect(normalizeSheetFormat('chord_chart')).toBe(SHEET_FORMATS.CHORD_CHART);
    expect(normalizeSheetFormat('')).toBe(SHEET_FORMATS.UNKNOWN);
    expect(normalizeSheetFormat('MIXED')).toBe(SHEET_FORMATS.MIXED);
  });

  test('sheetFormatIsTextOnly', function() {
    expect(sheetFormatIsTextOnly('chord_chart')).toBe(true);
    expect(sheetFormatIsTextOnly('lyrics_only')).toBe(true);
    expect(sheetFormatIsTextOnly('notation_only')).toBe(false);
    expect(sheetFormatIsTextOnly('mixed')).toBe(false);
  });

  test('sheetFormatLabel', function() {
    expect(sheetFormatLabel('lyrics_only')).toBe('Lyrics');
    expect(sheetFormatLabel('notation_only')).toBe('Notation');
  });
});
