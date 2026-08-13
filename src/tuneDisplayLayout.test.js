import { isStructureOnlyLayout } from './tuneDisplayLayout';

describe('isStructureOnlyLayout', function() {
  test('true when only structure is visible', function() {
    expect(isStructureOnlyLayout({
      notation: 'off',
      lyrics: false,
      structure: true,
    })).toBe(true);
  });

  test('false when lyrics or notation are also visible', function() {
    expect(isStructureOnlyLayout({
      notation: 'lines',
      lyrics: false,
      structure: true,
    })).toBe(false);
    expect(isStructureOnlyLayout({
      notation: 'off',
      lyrics: true,
      structure: true,
    })).toBe(false);
  });
});
