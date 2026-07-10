export const VIEW_MODES = [
  { id: 'music', label: 'Music Notation' },
  { id: 'musicAndLyrics', label: 'Music and Lyrics' },
  { id: 'chordsInline', label: 'Lyrics with Chords' },
  { id: 'chordsBlock', label: 'Lyrics and Structure' },
  { id: 'lyricsOnly', label: 'Lyrics Only' },
  { id: 'info', label: 'Info' },
];

export const LYRICS_VIEW_MODE_IDS = [
  'musicAndLyrics',
  'chordsInline',
  'chordsBlock',
  'lyricsOnly',
];

export const NOTATION_VIEW_MODE_IDS = ['music', 'musicAndLyrics'];

export const NOTATION_MODES = ['off', 'lines'];

/**
 * Display flags (target model):
 * - notation: staff panel
 * - lyrics: lyrics panel
 * - structure: chord-block column
 * - chords: chord annotations on staff / with lyrics (not a layout block)
 * - info: background info
 *
 * Legacy chordsInline / chordsBlock map to chords and/or structure booleans.
 */
const LEGACY_DISPLAY_FLAGS = {
  // musicAndLyrics historically used chords:block → Structure on, Chords off
  music: { notation: 'lines', lyrics: false, structure: false, chords: false, info: false },
  musicAndLyrics: { notation: 'lines', lyrics: true, structure: true, chords: false, info: false },
  chordsInline: { notation: 'off', lyrics: true, structure: false, chords: true, info: false },
  chordsBlock: { notation: 'off', lyrics: true, structure: true, chords: false, info: false },
  lyricsOnly: { notation: 'off', lyrics: true, structure: false, chords: false, info: false },
  info: { notation: 'off', lyrics: false, structure: false, chords: false, info: true },
};

function emptyDisplayFlags() {
  return {
    notation: 'off',
    lyrics: false,
    structure: false,
    chords: false,
    info: false,
  };
}

export function normalizeNotationMode(mode) {
  // Legacy 'flow' / notationFlow tokens map to source line breaks.
  if (mode === true || mode === 'lines' || mode === 'on' || mode === 'flow') return 'lines';
  return 'off';
}

function normalizeBool(value) {
  return !!value;
}

function flagsEqual(a, b) {
  return normalizeNotationMode(a.notation) === normalizeNotationMode(b.notation)
    && normalizeBool(a.lyrics) === normalizeBool(b.lyrics)
    && normalizeBool(a.structure) === normalizeBool(b.structure)
    && normalizeBool(a.chords) === normalizeBool(b.chords)
    && normalizeBool(a.info) === normalizeBool(b.info);
}

function splitModeParts(raw) {
  return String(raw || '')
    .split(/[+\s,]+/)
    .map(function(part) { return part.trim(); })
    .filter(Boolean);
}

function canonicalizeFlags(flags) {
  return {
    notation: normalizeNotationMode(flags && flags.notation),
    lyrics: normalizeBool(flags && flags.lyrics),
    structure: normalizeBool(flags && flags.structure),
    chords: normalizeBool(flags && flags.chords),
    info: normalizeBool(flags && flags.info),
  };
}

/**
 * Migrate legacy chords: 'off'|'inline'|'block' shape into structure + chords booleans.
 */
export function migrateLegacyChordsFlags(flags) {
  const next = Object.assign(emptyDisplayFlags(), flags || {});
  if (typeof next.chords === 'string') {
    if (next.chords === 'inline') {
      next.chords = true;
      if (next.structure === undefined) next.structure = false;
    } else if (next.chords === 'block') {
      next.structure = true;
      next.chords = false;
    } else {
      next.chords = false;
    }
  }
  if (next.structure === undefined) next.structure = false;
  return canonicalizeFlags(next);
}

export function viewModeToDisplayFlags(mode) {
  var raw = mode;
  // Explicit empty / off → all toggles off (allowed empty state).
  if (raw === '' || raw === 'off' || raw === 'noinfo') {
    return emptyDisplayFlags();
  }
  // Missing / default music for brand-new unset modes.
  if (!raw || raw === 'music') {
    return Object.assign(emptyDisplayFlags(), LEGACY_DISPLAY_FLAGS.music);
  }
  if (raw === 'chords') raw = 'chordsBlock';
  if (LEGACY_DISPLAY_FLAGS[raw]) {
    return Object.assign(emptyDisplayFlags(), LEGACY_DISPLAY_FLAGS[raw]);
  }
  const flags = emptyDisplayFlags();
  var sawInfoToken = false;
  var infoOff = false;
  var sawAnyToken = false;
  splitModeParts(raw).forEach(function(token) {
    sawAnyToken = true;
    if (token === 'notation' || token === 'notationLines' || token === 'notationFlow') {
      flags.notation = 'lines';
    } else if (token === 'lyrics') {
      flags.lyrics = true;
    } else if (token === 'structure') {
      flags.structure = true;
    } else if (token === 'chords') {
      flags.chords = true;
    } else if (token === 'chordsInline') {
      // Legacy: lyrics-aligned chord annotations, no structure column.
      flags.chords = true;
    } else if (token === 'chordsBlock') {
      // Legacy: structure column, not staff/lyric annotations.
      flags.structure = true;
    } else if (token === 'info') {
      flags.info = true;
      sawInfoToken = true;
    } else if (token === 'noinfo') {
      infoOff = true;
      sawInfoToken = true;
    }
  });
  if (!sawInfoToken) flags.info = false;
  if (infoOff) flags.info = false;
  // Unknown / empty composite with no recognized tokens → music default.
  if (!sawAnyToken) {
    return Object.assign(emptyDisplayFlags(), LEGACY_DISPLAY_FLAGS.music);
  }
  return flags;
}

export function displayFlagsToViewMode(flags) {
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  const legacyIds = Object.keys(LEGACY_DISPLAY_FLAGS);
  for (var i = 0; i < legacyIds.length; i++) {
    const id = legacyIds[i];
    if (flagsEqual(next, LEGACY_DISPLAY_FLAGS[id])) return id;
  }
  const parts = [];
  if (next.notation === 'lines') parts.push('notation');
  if (next.lyrics) parts.push('lyrics');
  if (next.structure) parts.push('structure');
  if (next.chords) parts.push('chords');
  if (next.info) parts.push('info');
  else if (parts.length > 0) parts.push('noinfo');
  // All off → explicit empty token so it round-trips and does not become music.
  if (parts.length === 0) return 'off';
  return parts.join(',');
}

/** Turn on the Info display flag in a stored viewMode string (preserves other flags). */
export function enableInfoInViewMode(viewMode) {
  const flags = viewModeToDisplayFlags(viewMode);
  flags.info = true;
  return displayFlagsToViewMode(flags);
}

/**
 * Apply resolver-generated background text and enable Info in the tune's view mode.
 * No-op when text is empty.
 */
export function applyGeneratedBackgroundInfo(tune, text) {
  if (!tune) return tune;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return tune;
  tune.backgroundInfo = trimmed;
  tune.viewMode = enableInfoInViewMode(tune.viewMode);
  return tune;
}

export function getDisplayFlagsLabel(flags) {
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  const parts = [];
  if (next.structure) parts.push('Structure');
  if (next.chords) parts.push('Chords');
  if (next.notation === 'lines') parts.push('Notation');
  if (next.lyrics) parts.push('Lyrics');
  if (next.info) parts.push('Info');
  return parts.length > 0 ? parts.join(' + ') : 'No view modes enabled';
}

/** Count layout blocks (structure / lyrics / notation). Chords+info do not count. */
export function activeContentDisplayCount(flags, available) {
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  var count = 0;
  if (available.notation && next.notation !== 'off') count += 1;
  if (available.lyrics && next.lyrics) count += 1;
  if (available.structure && next.structure) count += 1;
  return count;
}

/** Any toggle that counts as a "view mode" for the empty warning. */
export function activeDisplayFlagsCount(flags, available) {
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  var count = activeContentDisplayCount(next, available);
  if (available.chords && next.chords) count += 1;
  if (available.info && next.info) count += 1;
  return count;
}

export function hasAnyViewModeEnabled(flags, available) {
  return activeDisplayFlagsCount(flags, available || {
    notation: true,
    lyrics: true,
    structure: true,
    chords: true,
    info: true,
  }) > 0;
}

/**
 * Normalize flags against availability. Empty (all off) is allowed.
 */
export function ensureContentDisplayFlags(flags, available, options) {
  void options;
  const avail = available || {
    notation: true,
    lyrics: true,
    structure: true,
    chords: true,
    info: true,
  };
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  if (!avail.notation) next.notation = 'off';
  if (!avail.lyrics) next.lyrics = false;
  if (!avail.structure) next.structure = false;
  if (!avail.chords) next.chords = false;
  if (!avail.info) next.info = false;
  return next;
}

export function cycleNotationMode(mode) {
  const current = normalizeNotationMode(mode);
  return current === 'off' ? 'lines' : 'off';
}

export function getNotationModeLabel(mode) {
  const current = normalizeNotationMode(mode);
  if (current === 'lines') return 'Notation';
  return 'Notation off';
}

/**
 * Toggle a boolean display flag. Empty (all off) is allowed.
 */
export function applyDisplayFlagToggle(flags, which, available) {
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  const avail = available || {
    notation: true,
    lyrics: true,
    structure: true,
    chords: true,
    info: true,
  };

  if (which === 'chords') {
    if (!avail.chords) return flags;
    next.chords = !next.chords;
  } else if (which === 'structure') {
    if (!avail.structure) return flags;
    next.structure = !next.structure;
  } else if (which === 'notation') {
    if (!avail.notation) return flags;
    next.notation = cycleNotationMode(next.notation);
  } else if (which === 'lyrics') {
    if (!avail.lyrics) return flags;
    next.lyrics = !next.lyrics;
  } else if (which === 'info') {
    if (!avail.info) return flags;
    next.info = !next.info;
  } else {
    return flags;
  }

  return ensureContentDisplayFlags(next, avail);
}

/**
 * Button-group actions for display controls.
 * - visibility / toggle: turn the group on/off
 */
export function applyDisplayGroupAction(flags, group, action, available, options) {
  void options;
  const next = canonicalizeFlags(migrateLegacyChordsFlags(flags));
  const avail = available || {
    notation: true,
    lyrics: true,
    structure: true,
    chords: true,
    info: true,
  };

  if (group === 'chords') {
    if (!avail.chords) return flags;
    if (action === 'visibility' || action === 'toggle') next.chords = !next.chords;
  } else if (group === 'structure') {
    if (!avail.structure) return flags;
    if (action === 'visibility' || action === 'toggle') next.structure = !next.structure;
  } else if (group === 'notation') {
    if (!avail.notation) return flags;
    if (action === 'visibility') {
      next.notation = next.notation === 'off' ? 'lines' : 'off';
    }
  } else if (group === 'lyrics') {
    if (!avail.lyrics) return flags;
    if (action === 'visibility' || action === 'toggle') next.lyrics = !next.lyrics;
  } else if (group === 'info') {
    if (!avail.info) return flags;
    if (action === 'visibility' || action === 'toggle') next.info = !next.info;
  } else {
    return flags;
  }

  return ensureContentDisplayFlags(next, avail);
}

export function getAvailableDisplayFlags(tune, tunebook, options) {
  const hasLyrics = !!(tunebook && tunebook.hasLyrics && tunebook.hasLyrics(tune));
  const hasNotes = !!(tunebook && tunebook.hasNotes && tunebook.hasNotes(tune));
  const hasChords = !!(options && options.hasChords);
  const hasInfo = (options && options.hasInfo !== undefined) ? !!options.hasInfo : true;
  return {
    notation: hasNotes,
    lyrics: hasLyrics,
    structure: hasChords,
    chords: hasChords,
    info: hasInfo,
  };
}

export function resolveDisplayFlagsForTune(flags, tune, tunebook, options) {
  const available = getAvailableDisplayFlags(tune, tunebook, options);
  return ensureContentDisplayFlags({
    notation: available.notation ? normalizeNotationMode(flags.notation) : 'off',
    lyrics: !!flags.lyrics && available.lyrics,
    structure: !!flags.structure && available.structure,
    chords: !!flags.chords && available.chords,
    info: !!flags.info && available.info,
  }, available, options);
}

export function isLyricsViewMode(mode) {
  return viewModeToDisplayFlags(mode).lyrics;
}

export function isNotationViewMode(mode) {
  return normalizeNotationMode(viewModeToDisplayFlags(mode).notation) !== 'off';
}

export function getAvailableViewModes(tune, tunebook) {
  const hasLyrics = !!(tunebook && tunebook.hasLyrics && tunebook.hasLyrics(tune));
  const hasNotes = !!(tunebook && tunebook.hasNotes && tunebook.hasNotes(tune));
  return VIEW_MODES.filter(function(mode) {
    if (!hasLyrics && LYRICS_VIEW_MODE_IDS.indexOf(mode.id) >= 0) return false;
    if (!hasNotes && NOTATION_VIEW_MODE_IDS.indexOf(mode.id) >= 0) return false;
    return true;
  });
}

export function resolveViewModeForTune(mode, tune, tunebook, options) {
  const flags = resolveDisplayFlagsForTune(
    viewModeToDisplayFlags(mode),
    tune,
    tunebook,
    options
  );
  return displayFlagsToViewMode(flags);
}

/** Default view mode heuristics when a tune has no saved viewMode. */
export function defaultViewModeForTune(tune, tunebook, options) {
  const available = getAvailableDisplayFlags(tune, tunebook, options);
  const flags = emptyDisplayFlags();
  if (available.notation && !available.lyrics) {
    flags.notation = 'lines';
  } else if (available.lyrics && !available.notation) {
    flags.lyrics = true;
    if (available.structure) flags.structure = true;
  } else if (available.notation && available.lyrics) {
    flags.notation = 'lines';
    flags.lyrics = true;
    if (available.structure) flags.structure = true;
  } else if (available.structure) {
    flags.structure = true;
  } else if (available.info) {
    flags.info = true;
  }
  if (available.chords) flags.chords = true;
  return displayFlagsToViewMode(flags);
}

/** Editor panel modes (replaces Music / Info / Lyrics / Chords / ABC tabs). */
export const EDITOR_VIEW_MODES = [
  { id: 'info', label: 'Info' },
  { id: 'music', label: 'Music' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'chords', label: 'Chords' },
  { id: 'pianoRoll', label: 'Piano roll' },
  { id: 'notationAbc', label: 'ABC Notes' },
  { id: 'sourceAbc', label: 'ABC Record' },
];

function isCompositeViewMode(mode) {
  if (!mode || typeof mode !== 'string') return false;
  if (mode === 'off') return true;
  const parts = splitModeParts(mode);
  if (parts.length < 1) return false;
  return parts.every(function(token) {
    return token === 'notation'
      || token === 'notationLines'
      || token === 'notationFlow'
      || token === 'lyrics'
      || token === 'structure'
      || token === 'chords'
      || token === 'chordsInline'
      || token === 'chordsBlock'
      || token === 'info'
      || token === 'noinfo'
      || token === 'off';
  });
}

export function normalizeViewMode(mode) {
  if (mode === '' || mode === 'off') return 'off';
  if (!mode || mode === 'music') return 'music';
  if (mode === 'chords') return 'chordsBlock';
  if (LEGACY_DISPLAY_FLAGS[mode]) return mode;
  if (isCompositeViewMode(mode)) {
    return displayFlagsToViewMode(viewModeToDisplayFlags(mode));
  }
  return 'music';
}

export function showsMusicNotation(mode) {
  return normalizeNotationMode(viewModeToDisplayFlags(mode).notation) !== 'off';
}

/** True when chord annotations (staff/lyrics) are enabled. */
export function isChordLayoutView(mode) {
  return !!viewModeToDisplayFlags(mode).chords;
}

/** True when the structure (chord block) panel is enabled. */
export function isStructureView(mode) {
  return !!viewModeToDisplayFlags(mode).structure;
}

export function isLyricsOnlyView(mode) {
  const flags = viewModeToDisplayFlags(mode);
  return flags.lyrics
    && normalizeNotationMode(flags.notation) === 'off'
    && !flags.structure
    && !flags.chords
    && !flags.info;
}

const LEGACY_EDITOR_TAB_MAP = {
  musiceditor: 'music',
  staff: 'music',
  split: 'music',
  abc: 'sourceAbc',
};

export function normalizeEditorViewMode(mode) {
  if (!mode) return 'info';
  if (LEGACY_EDITOR_TAB_MAP[mode]) return LEGACY_EDITOR_TAB_MAP[mode];
  if (EDITOR_VIEW_MODES.some(function(entry) { return entry.id === mode; })) return mode;
  return 'info';
}

export function isNotationEditorView(mode) {
  const normalized = normalizeEditorViewMode(mode);
  return normalized === 'music' || normalized === 'pianoRoll' || normalized === 'notationAbc';
}

/** Music uses staff notation; ABC Notes is voice ABC text with notation preview. */
export function editorViewModeToNotationView(mode) {
  const normalized = normalizeEditorViewMode(mode);
  if (normalized === 'pianoRoll') return 'pianoRoll';
  if (normalized === 'music') return 'staff';
  if (normalized === 'notationAbc') return 'abc';
  return 'staff';
}

export function getEditorViewModeLabel(mode) {
  const normalized = normalizeEditorViewMode(mode);
  const entry = EDITOR_VIEW_MODES.find(function(item) { return item.id === normalized; });
  return entry ? entry.label : 'Info';
}

// Back-compat exports used by older tests / call sites during migration.
export const CHORDS_MODES = ['off', 'inline', 'block'];

/** @deprecated Use boolean chords + structure flags. */
export function cycleChordsMode(mode) {
  if (mode === true || mode === 'inline') return 'block';
  if (mode === 'block') return 'off';
  if (mode === false || mode === 'off') return 'inline';
  return 'off';
}

/** @deprecated */
export function getChordsModeLabel(mode) {
  if (mode === true || mode === 'inline') return 'Chords';
  if (mode === 'block') return 'Structure';
  return 'Chords off';
}
