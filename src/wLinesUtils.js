import { expandRepeatedSectionLyrics } from './chordSheetUtils';

/**
 * Whether a lyric line already uses ABC w: note-spacing markers (hyphenated
 * syllables, melisma, skipped notes, etc.).
 */
export function lyricLineHasNoteSpacing(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/[~*_]/.test(text)) return true;
  if (/\w-\s/.test(text)) return true;
  if (/  +/.test(text)) return true;
  return false;
}

/**
 * Recover plain words from an ABC w: line that uses syllable / melisma markers.
 */
export function stripNoteSpacingFromLine(line) {
  let text = String(line || '').trim();
  if (!text) return '';
  // Drop skip (*) and hold (_) syllable slots.
  text = text.replace(/(^|\s)[*_](?=\s|$)/g, ' ');
  // Melisma joins across words become spaces.
  text = text.replace(/~/g, ' ');
  // Join hyphenated syllable breaks: "Am- az- ing" → "Amazing".
  text = text.replace(/(\S)-\s+/g, '$1');
  // Trailing hyphen on a final syllable with no follower.
  text = text.replace(/(\S)-(?=\s|$)/g, '$1');
  return text.replace(/\s+/g, ' ').trim();
}

function linesHaveNoteSpacing(lines) {
  return Array.isArray(lines) && lines.some(function(line) {
    return lyricLineHasNoteSpacing(line);
  });
}

/**
 * Plain singable lyrics for editors and non-notation views.
 * Prefers W: block words; falls back to wLines with spacing markers stripped.
 */
export function getPlainLyricLines(tune) {
  if (!tune) return [];
  if (Array.isArray(tune.words) && tune.words.length > 0) {
    return tune.words.slice();
  }
  if (Array.isArray(tune.wLines) && tune.wLines.length > 0) {
    return tune.wLines.map(function(line) {
      return lyricLineHasNoteSpacing(line) ? stripNoteSpacingFromLine(line) : line;
    });
  }
  return [];
}

/**
 * When MusicXML/MuseScore import produced note-aligned wLines but no block
 * lyrics, fill plain `words` for the lyrics panel without overwriting existing
 * autofilled/block lyrics.
 * @returns {boolean} true if words were filled
 */
export function ensurePlainWordsFromNoteAlignedLyrics(tune) {
  if (!tune) return false;
  const hasWords = Array.isArray(tune.words) && tune.words.some(function(line) {
    return String(line || '').trim();
  });
  if (hasWords) return false;
  const wLines = Array.isArray(tune.wLines) ? tune.wLines : [];
  if (!wLines.some(function(line) { return String(line || '').trim(); })) return false;
  tune.words = wLines.map(function(line) {
    return lyricLineHasNoteSpacing(line) ? stripNoteSpacingFromLine(line) : String(line || '');
  });
  return true;
}

export function setPlainLyricLines(tune, lines) {
  if (!tune) return;
  tune.words = Array.isArray(lines) ? lines.slice() : String(lines || '').split('\n');
}

/**
 * Stored note-aligned (syllable-marked) lyrics for under-staff display.
 * Empty when nothing explicit is stored — callers may generate from plain lyrics.
 */
export function getNoteAlignedLyricLines(tune) {
  if (!tune) return [];
  const wLines = Array.isArray(tune.wLines) ? tune.wLines : [];
  if (wLines.length === 0) return [];
  if (tune.timingScaffold) return wLines.slice();
  if (linesHaveNoteSpacing(wLines)) return wLines.slice();
  const words = Array.isArray(tune.words) ? tune.words : [];
  // Identical words + wLines means block lyrics stored in both places — not under-staff.
  if (words.length > 0 && wordsMatchWLines(tune)) {
    return [];
  }
  // One w: line per music line: classic under-staff lyrics (space-separated tokens → notes).
  // Covers voice practice warmups (ooh ahh lah…) and songs with plain per-note words.
  if (wLines.length === countVoiceNoteLines(tune)) {
    return wLines.slice();
  }
  return [];
}

export function setNoteAlignedLyricLines(tune, lines) {
  if (!tune) return;
  tune.wLines = Array.isArray(lines) ? lines.slice() : String(lines || '').split('\n');
}

export function hasStoredNoteAlignedLyrics(tune) {
  return getNoteAlignedLyricLines(tune).some(function(line) {
    return String(line || '').trim().length > 0;
  });
}

/** True when w: lines are explicitly stored for notation (including cleared-to-empty). */
export function hasExplicitNoteAlignedStorage(tune) {
  return getNoteAlignedLyricLines(tune).length > 0;
}

/** @deprecated Prefer getPlainLyricLines — kept as the default lyrics accessor. */
export function getLyricLines(tune) {
  return getPlainLyricLines(tune);
}

export function getLyricLinesForDisplay(tune) {
  return expandRepeatedSectionLyrics(getPlainLyricLines(tune));
}

/** @deprecated Prefer setPlainLyricLines. */
export function setLyricLines(tune, lines) {
  setPlainLyricLines(tune, lines);
}

export function lyricLinesToText(tune) {
  return getPlainLyricLines(tune).join('\n');
}

export function noteAlignedLyricLinesToText(tune) {
  return getNoteAlignedLyricLines(tune).join('\n');
}

/** Raw w: lines for the time-aligned lyrics editor (no display filtering). */
export function wLinesEditorText(tune) {
  if (!tune || !Array.isArray(tune.wLines)) return '';
  return tune.wLines.join('\n');
}

export function countVoiceNoteLines(tune) {
  if (!tune || !tune.voices) return 0;
  return Object.keys(tune.voices).reduce(function(total, voice) {
    const notes = tune.voices[voice] && tune.voices[voice].notes;
    return total + (Array.isArray(notes) ? notes.length : 0);
  }, 0);
}

export function wordsMatchWLines(tune) {
  const words = Array.isArray(tune && tune.words) ? tune.words : [];
  const wLines = Array.isArray(tune && tune.wLines) ? tune.wLines : [];
  return words.length > 0
    && words.length === wLines.length
    && words.every(function(word, index) { return word === wLines[index]; });
}

export function getInterleavedLyricLines(tune) {
  const aligned = getNoteAlignedLyricLines(tune);
  if (aligned.length === 0) return [];
  return aligned;
}

export function getBlockLyricLines(tune) {
  const words = Array.isArray(tune && tune.words) ? tune.words : [];
  if (words.length > 0) return words.slice();
  const wLines = Array.isArray(tune && tune.wLines) ? tune.wLines : [];
  // Legacy block-only storage: more lyric lines than note lines, no spacing markers.
  if (wLines.length > 0 && !tune.timingScaffold && !linesHaveNoteSpacing(wLines)
      && wLines.length > countVoiceNoteLines(tune)) {
    return wLines.slice();
  }
  return [];
}

export function renderBlockLyricsAbc(tune) {
  const lines = getBlockLyricLines(tune);
  if (lines.length === 0) return '';
  return lines.map(function(line) { return 'W: ' + line; }).join('\n') + '\n';
}
