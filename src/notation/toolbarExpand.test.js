import { expandFlagsForWidth, loadMarkFavorites, saveMarkFavorites, toggleMarkFavorite, DEFAULT_MARK_FAVORITES } from './toolbarExpand';

describe('toolbarExpand', function() {
  test('expandFlagsForWidth expands in planned order', function() {
    expect(expandFlagsForWidth(100).accidentals).toBe(false);
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
});
