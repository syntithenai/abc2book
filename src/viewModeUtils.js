export const VIEW_MODES = [
  { id: 'music', label: 'Music Notation' },
  { id: 'musicAndLyrics', label: 'Music and Lyrics' },
  { id: 'chordsInline', label: 'Lyrics with Chords' },
  { id: 'chordsBlock', label: 'Lyrics and Chord Diagrams' },
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

export const CHORDS_MODES = ['off', 'inline', 'block'];
export const NOTATION_MODES = ['off', 'lines'];

const LEGACY_DISPLAY_FLAGS = {
  music: { notation: 'lines', lyrics: false, chords: 'off', info: false },
  musicAndLyrics: { notation: 'lines', lyrics: true, chords: 'block', info: false },
  chordsInline: { notation: 'off', lyrics: true, chords: 'inline', info: false },
  chordsBlock: { notation: 'off', lyrics: true, chords: 'block', info: false },
  lyricsOnly: { notation: 'off', lyrics: true, chords: 'off', info: false },
  info: { notation: 'off', lyrics: false, chords: 'off', info: true },
};

function emptyDisplayFlags() {
  return { notation: 'off', lyrics: false, chords: 'off', info: false };
}

function normalizeChordsMode(mode) {
  if (mode === 'inline' || mode === 'block') return mode;
  return 'off';
}

export function normalizeNotationMode(mode) {
  // Legacy 'flow' / notationFlow tokens map to source line breaks.
  if (mode === true || mode === 'lines' || mode === 'on' || mode === 'flow') return 'lines';
  return 'off';
}

function flagsEqual(a, b) {
  return normalizeNotationMode(a.notation) === normalizeNotationMode(b.notation)
    && !!a.lyrics === !!b.lyrics
    && normalizeChordsMode(a.chords) === normalizeChordsMode(b.chords)
    && !!a.info === !!b.info;
}

function splitModeParts(raw) {
  return String(raw || '')
    .split(/[+\s,]+/)
    .map(function(part) { return part.trim(); })
    .filter(Boolean);
}

export function viewModeToDisplayFlags(mode) {
  var raw = mode;
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
  splitModeParts(raw).forEach(function(token) {
    if (token === 'notation' || token === 'notationLines' || token === 'notationFlow') {
      flags.notation = 'lines';
    }
    else if (token === 'lyrics') flags.lyrics = true;
    else if (token === 'chordsInline') flags.chords = 'inline';
    else if (token === 'chordsBlock') flags.chords = 'block';
    else if (token === 'info') {
      flags.info = true;
      sawInfoToken = true;
    } else if (token === 'noinfo') {
      infoOff = true;
      sawInfoToken = true;
    }
  });
  // Bare content tokens (no info/noinfo) default info off; explicit 'info' token enables it.
  if (!sawInfoToken) flags.info = false;
  if (infoOff) flags.info = false;
  if (flags.notation === 'off' && !flags.lyrics && flags.chords === 'off' && !flags.info) {
    return Object.assign(emptyDisplayFlags(), LEGACY_DISPLAY_FLAGS.music);
  }
  return flags;
}

export function displayFlagsToViewMode(flags) {
  const next = {
    notation: normalizeNotationMode(flags.notation),
    lyrics: !!flags.lyrics,
    chords: normalizeChordsMode(flags.chords),
    info: !!flags.info,
  };
  // Always check legacy ids first (legacy modes now have info:false by default).
  const legacyIds = Object.keys(LEGACY_DISPLAY_FLAGS);
  for (var i = 0; i < legacyIds.length; i++) {
    const id = legacyIds[i];
    if (flagsEqual(next, LEGACY_DISPLAY_FLAGS[id])) return id;
  }
  const parts = [];
  if (next.notation === 'lines') parts.push('notation');
  if (next.lyrics) parts.push('lyrics');
  if (next.chords === 'inline') parts.push('chordsInline');
  if (next.chords === 'block') parts.push('chordsBlock');
  if (next.info) parts.push('info');
  else parts.push('noinfo');
  return parts.length > 0 ? parts.join(',') : 'music';
}

export function getDisplayFlagsLabel(flags) {
  const parts = [];
  if (normalizeNotationMode(flags.notation) === 'lines') parts.push('Notation');
  if (flags.lyrics) parts.push('Lyrics');
  if (flags.chords === 'inline') parts.push('Chords inline');
  else if (flags.chords === 'block') parts.push('Chords block');
  if (flags.info) parts.push('Info');
  return parts.length > 0 ? parts.join(' + ') : 'View';
}

/** Count active content panels (chords / lyrics / notation). Info does not count. */
export function activeContentDisplayCount(flags, available) {
  var count = 0;
  if (available.notation && normalizeNotationMode(flags.notation) !== 'off') count += 1;
  if (available.lyrics && flags.lyrics) count += 1;
  if (available.chords && normalizeChordsMode(flags.chords) !== 'off') count += 1;
  return count;
}

export function activeDisplayFlagsCount(flags, available) {
  return activeContentDisplayCount(flags, available)
    + (available.info && flags.info ? 1 : 0);
}

function hasContentAvailable(available) {
  return !!(available.notation || available.lyrics || available.chords);
}

/**
 * Enforce content rules: at least one of chords/lyrics/notation when any are
 * available. Inline chords need notation (staff) or lyrics; chords alone use
 * block mode.
 *
 * options.allowEmpty — when true, skip the force-one-on rule (single view path).
 */
export function ensureContentDisplayFlags(flags, available, options) {
  const allowEmpty = !!(options && options.allowEmpty);
  const next = {
    notation: normalizeNotationMode(flags.notation),
    lyrics: !!flags.lyrics,
    chords: normalizeChordsMode(flags.chords),
    info: !!flags.info,
  };
  if (!allowEmpty && hasContentAvailable(available) && activeContentDisplayCount(next, available) < 1) {
    if (available.notation) next.notation = 'lines';
    else if (available.lyrics) next.lyrics = true;
    else if (available.chords) next.chords = 'block';
  }
  // Chords with neither notation nor lyrics can only show as a block chart.
  if (next.chords !== 'off' && next.notation === 'off' && !next.lyrics) {
    next.chords = 'block';
  }
  return next;
}

export function cycleChordsMode(mode) {
  const current = normalizeChordsMode(mode);
  if (current === 'off') return 'inline';
  if (current === 'inline') return 'block';
  return 'off';
}

export function cycleNotationMode(mode) {
  const current = normalizeNotationMode(mode);
  return current === 'off' ? 'lines' : 'off';
}

export function getChordsModeLabel(mode) {
  const current = normalizeChordsMode(mode);
  if (current === 'inline') return 'Chords inline';
  if (current === 'block') return 'Chords block';
  return 'Chords off';
}

export function getNotationModeLabel(mode) {
  const current = normalizeNotationMode(mode);
  if (current === 'lines') return 'Notation';
  return 'Notation off';
}

/**
 * Toggle a boolean display flag, or cycle chords/notation.
 * At least one of chords / lyrics / notation stays visible when available.
 */
export function applyDisplayFlagToggle(flags, which, available) {
  const next = {
    notation: normalizeNotationMode(flags.notation),
    lyrics: !!flags.lyrics,
    chords: normalizeChordsMode(flags.chords),
    info: !!flags.info,
  };
  const avail = available || {
    notation: true,
    lyrics: true,
    chords: true,
    info: true,
  };

  if (which === 'chords') {
    if (!avail.chords) return flags;
    next.chords = cycleChordsMode(next.chords);
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
 * - visibility: turn the group on/off (chords default to block, or inline when
 *   options.preferInlineChords; notation defaults to lines)
 * - layout: chords toggle inline ↔ block
 * - toggle: simple on/off for lyrics and info
 */
export function applyDisplayGroupAction(flags, group, action, available, options) {
  const next = {
    notation: normalizeNotationMode(flags.notation),
    lyrics: !!flags.lyrics,
    chords: normalizeChordsMode(flags.chords),
    info: !!flags.info,
  };
  const avail = available || {
    notation: true,
    lyrics: true,
    chords: true,
    info: true,
  };
  const opts = options || {};

  if (group === 'chords') {
    if (!avail.chords) return flags;
    if (action === 'visibility') {
      if (next.chords === 'off') {
        next.chords = opts.preferInlineChords ? 'inline' : 'block';
      } else {
        next.chords = 'off';
      }
    } else if (action === 'layout') {
      // Toggle inline ↔ block even when lyrics are off (inline = no block column).
      if (next.chords === 'inline') next.chords = 'block';
      else next.chords = 'inline';
    }
  } else if (group === 'notation') {
    if (!avail.notation) return flags;
    if (action === 'visibility') {
      next.notation = next.notation === 'off' ? 'lines' : 'off';
    }
  } else if (group === 'lyrics') {
    if (!avail.lyrics) return flags;
    if (action === 'visibility' || action === 'toggle') {
      next.lyrics = !next.lyrics;
    }
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
  return {
    notation: hasNotes,
    lyrics: hasLyrics,
    chords: hasChords,
    info: true,
  };
}

export function resolveDisplayFlagsForTune(flags, tune, tunebook, options) {
  const available = getAvailableDisplayFlags(tune, tunebook, options);
  const next = ensureContentDisplayFlags({
    notation: available.notation ? normalizeNotationMode(flags.notation) : 'off',
    lyrics: !!flags.lyrics && available.lyrics,
    chords: available.chords ? normalizeChordsMode(flags.chords) : 'off',
    info: !!flags.info,
  }, available, options);
  if (!hasContentAvailable(available) && !next.info) next.info = true;
  return next;
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
  const parts = splitModeParts(mode);
  if (parts.length < 1) return false;
  return parts.every(function(token) {
    return token === 'notation'
      || token === 'notationLines'
      || token === 'notationFlow'
      || token === 'lyrics'
      || token === 'chordsInline'
      || token === 'chordsBlock'
      || token === 'info'
      || token === 'noinfo';
  });
}

export function normalizeViewMode(mode) {
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

export function isChordLayoutView(mode) {
  const chords = viewModeToDisplayFlags(mode).chords;
  return chords === 'block' || chords === 'inline';
}

export function isLyricsOnlyView(mode) {
  const flags = viewModeToDisplayFlags(mode);
  return flags.lyrics
    && normalizeNotationMode(flags.notation) === 'off'
    && flags.chords === 'off'
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
