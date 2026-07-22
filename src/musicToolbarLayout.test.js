import {
  isMusicToolbarCompact,
  isMusicToolbarFolded,
  MUSIC_TOOLBAR_COMPACT_WIDTH,
  MUSIC_TOOLBAR_FOLD_WIDTH,
} from './musicToolbarLayout';

describe('musicToolbarLayout', function() {
  it('folds at or below the fold width', function() {
    expect(isMusicToolbarFolded(MUSIC_TOOLBAR_FOLD_WIDTH, false)).toBe(true);
    expect(isMusicToolbarFolded(MUSIC_TOOLBAR_FOLD_WIDTH + 1, false)).toBe(false);
  });

  it('folds on mobile regardless of width', function() {
    expect(isMusicToolbarFolded(2000, true)).toBe(true);
  });

  it('compacts when the toolbar container is narrower than the compact width', function() {
    expect(isMusicToolbarCompact(MUSIC_TOOLBAR_COMPACT_WIDTH - 1, 2000, false)).toBe(true);
    expect(isMusicToolbarCompact(MUSIC_TOOLBAR_COMPACT_WIDTH, 2000, false)).toBe(false);
  });

  it('does not compact when already folded into the menu', function() {
    expect(isMusicToolbarCompact(900, 900, true)).toBe(false);
  });

  it('falls back to window width before the container is measured', function() {
    expect(isMusicToolbarCompact(0, MUSIC_TOOLBAR_COMPACT_WIDTH - 1, false)).toBe(true);
  });
});
