/**
 * Unified block layout for single view, gig mode, and print.
 *
 * Block panels (priority for primary/top-left): Notation > Lyrics > Structure.
 * Chords and Info are not layout blocks.
 */

export const LAYOUT_BLOCKS = ['notation', 'lyrics', 'structure'];

/**
 * @param {object} flags - display flags { notation, lyrics, structure, ... }
 * @returns {{ notation: boolean, lyrics: boolean, structure: boolean }}
 */
export function getVisibleBlocks(flags) {
  return {
    notation: !!(flags && flags.notation && flags.notation !== 'off'),
    lyrics: !!(flags && flags.lyrics),
    structure: !!(flags && flags.structure),
  };
}

/**
 * Resolve placement slots for the three block panels.
 *
 * @returns {{
 *   empty: boolean,
 *   layoutClass: string,
 *   main: 'notation'|'lyrics'|'structure'|null,
 *   side: 'notation'|'lyrics'|'structure'|null,
 *   below: 'lyrics'|null,
 *   wrapLyricsAroundStructure: boolean,
 *   mergeStructureIntoLyrics: boolean,
 *   syncLyricsStructure: boolean,
 * }}
 */
export function resolveTuneDisplayLayout(flags) {
  const visible = getVisibleBlocks(flags);
  const blocks = LAYOUT_BLOCKS.filter(function(id) { return visible[id]; });

  if (blocks.length === 0) {
    return {
      empty: true,
      layoutClass: 'tune-layout-empty',
      main: null,
      side: null,
      below: null,
      wrapLyricsAroundStructure: false,
      mergeStructureIntoLyrics: false,
      syncLyricsStructure: false,
    };
  }

  if (blocks.length === 1) {
    const only = blocks[0];
    return {
      empty: false,
      layoutClass: 'tune-layout-' + only + '-only',
      main: only,
      side: null,
      below: null,
      wrapLyricsAroundStructure: false,
      mergeStructureIntoLyrics: false,
      syncLyricsStructure: false,
    };
  }

  // Without notation: lyrics scroll; structure stays sticky and height-fitted beside them.
  if (!visible.notation && visible.lyrics && visible.structure) {
    return {
      empty: false,
      layoutClass: 'tune-layout-lyrics-structure tune-layout-lyrics-structure--sync',
      main: 'lyrics',
      side: 'structure',
      below: null,
      wrapLyricsAroundStructure: false,
      mergeStructureIntoLyrics: false,
      syncLyricsStructure: true,
    };
  }

  // Three blocks: notation top-left, structure top-right, lyrics below.
  if (visible.notation && visible.lyrics && visible.structure) {
    return {
      empty: false,
      layoutClass: 'tune-layout-notation-lyrics-structure',
      main: 'notation',
      side: 'structure',
      below: 'lyrics',
      wrapLyricsAroundStructure: true,
      mergeStructureIntoLyrics: false,
      syncLyricsStructure: false,
    };
  }

  // Two blocks: primary by priority, secondary in 1/3 right column.
  const primary = blocks[0];
  const secondary = blocks[1];
  const layoutClass = 'tune-layout-' + primary + '-' + secondary;
  return {
    empty: false,
    layoutClass: layoutClass,
    main: primary,
    side: secondary,
    below: null,
    wrapLyricsAroundStructure: visible.notation && visible.lyrics,
    mergeStructureIntoLyrics: false,
    syncLyricsStructure: false,
  };
}

/** True when structure is the only block panel (no notation or lyrics). */
export function isStructureOnlyLayout(flags) {
  const visible = getVisibleBlocks(flags);
  return visible.structure && !visible.notation && !visible.lyrics;
}

export function isViewModesEmpty(flags, available) {
  const avail = available || {
    notation: true,
    lyrics: true,
    structure: true,
    chords: true,
    info: true,
  };
  const notationOn = avail.notation && flags && flags.notation && flags.notation !== 'off';
  const lyricsOn = avail.lyrics && !!(flags && flags.lyrics);
  const structureOn = avail.structure && !!(flags && flags.structure);
  const chordsOn = avail.chords && !!(flags && flags.chords);
  const infoOn = avail.info && !!(flags && flags.info);
  return !notationOn && !lyricsOn && !structureOn && !chordsOn && !infoOn;
}
