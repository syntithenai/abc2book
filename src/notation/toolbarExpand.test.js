import {
  expandFlagsForWidth,
  loadMarkFavorites,
  saveMarkFavorites,
  toggleMarkFavorite,
  toggleToolbarFavorite,
  loadToolbarFavorites,
  saveToolbarFavorites,
  DEFAULT_MARK_FAVORITES,
  DEFAULT_BARLINE_FAVORITES,
  BARLINE_FAVORITES_STORAGE_KEY,
} from './toolbarExpand';

describe('toolbarExpand', function() {
  test('expandFlagsForWidth expands in planned order', function() {
    expect(expandFlagsForWidth(100).clipboard).toBe(false);
    expect(expandFlagsForWidth(100).accidentals).toBe(false);
    expect(expandFlagsForWidth(400).clipboard).toBe(true);
    expect(expandFlagsForWidth(700).accidentals).toBe(true);
    expect(expandFlagsForWidth(700).barlines).toBe(false);
    expect(expandFlagsForWidth(850).barlines).toBe(true);
    expect(expandFlagsForWidth(850).palette).toBe(false);
    expect(expandFlagsForWidth(950).palette).toBe(true);
    expect(expandFlagsForWidth(1100).tuplets).toBe(true);
    expect(expandFlagsForWidth(1200).voices).toBe(true);
  });

  test('toggleMarkFavorite adds and removes', function() {
    let favs = DEFAULT_MARK_FAVORITES.slice();
    favs = toggleMarkFavorite(favs, 'trill');
    expect(favs).toContain('trill');
    favs = toggleMarkFavorite(favs, 'staccato');
    expect(favs).not.toContain('staccato');
  });

  test('save and load mark favorites round-trip', function() {
    saveMarkFavorites(['staccato', 'trill']);
    expect(loadMarkFavorites()).toEqual(['staccato', 'trill']);
    saveMarkFavorites(DEFAULT_MARK_FAVORITES);
  });

  test('generic toolbar favorites round-trip', function() {
    saveToolbarFavorites(BARLINE_FAVORITES_STORAGE_KEY, ['keyChange', '|']);
    expect(loadToolbarFavorites(BARLINE_FAVORITES_STORAGE_KEY, DEFAULT_BARLINE_FAVORITES))
      .toEqual(['keyChange', '|']);
    expect(toggleToolbarFavorite(['keyChange'], 'meterChange')).toEqual(['keyChange', 'meterChange']);
    saveToolbarFavorites(BARLINE_FAVORITES_STORAGE_KEY, DEFAULT_BARLINE_FAVORITES);
  });
});
