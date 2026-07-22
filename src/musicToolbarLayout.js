/** Width breakpoints for the MusicSingle tune toolbar. */

export const MUSIC_TOOLBAR_FOLD_WIDTH = 1180;
/** Below this toolbar container width, view modes and notation controls collapse into menus. */
export const MUSIC_TOOLBAR_COMPACT_WIDTH = 1500;

export function isMusicToolbarFolded(windowWidth, collapseToMenuOnMobile) {
  const w = typeof windowWidth === 'number' ? windowWidth : 0;
  return !!collapseToMenuOnMobile || w <= MUSIC_TOOLBAR_FOLD_WIDTH;
}

export function isMusicToolbarCompact(containerWidth, windowWidth, folded) {
  if (folded) return false;
  const measured = typeof containerWidth === 'number' && containerWidth > 0
    ? containerWidth
    : (typeof windowWidth === 'number' ? windowWidth : 0);
  return measured > 0 && measured < MUSIC_TOOLBAR_COMPACT_WIDTH;
}
