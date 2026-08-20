import { getLyricLinesForDisplay } from './wLinesUtils';
import {
  hasChordLines,
  linesHaveChordProInlineChords,
  hasLyricEmbeddedChords,
} from './chordSheetUtils';

/**
 * Display modes for lyrics + chords rendering.
 * @typedef {'strip'|'passthrough_cow'|'passthrough_chordpro'|'per_line_abc'|'plain'|'chords_only'} ChordLyricRenderMode
 */

/**
 * Resolve how TimedLyricsChordsView should render chords for a tune.
 *
 * @param {object} tune
 * @param {{ hideChords?: boolean, chordsOnly?: boolean, allowNotationMerge?: boolean }} options
 * @returns {{ mode: string, hideChords: boolean, chordsOnly: boolean }}
 */
export function resolveChordRenderPlan(tune, options) {
  const opts = options || {};
  const hideChords = !!opts.hideChords;
  const chordsOnly = !!opts.chordsOnly;
  const allowNotationMerge = !!opts.allowNotationMerge;
  const displayLines = getLyricLinesForDisplay(tune || {});

  if (hideChords) {
    return { mode: 'strip', hideChords: true, chordsOnly: false };
  }

  if (chordsOnly) {
    if (hasChordLines(displayLines)) {
      return { mode: 'passthrough_cow', hideChords: false, chordsOnly: true };
    }
    if (linesHaveChordProInlineChords(displayLines)) {
      return { mode: 'passthrough_chordpro', hideChords: false, chordsOnly: true };
    }
    if (hasLyricEmbeddedChords(displayLines)) {
      return { mode: 'passthrough_chordpro', hideChords: false, chordsOnly: true };
    }
    return { mode: 'chords_only', hideChords: false, chordsOnly: true };
  }

  if (hasChordLines(displayLines)) {
    return { mode: 'passthrough_cow', hideChords: false, chordsOnly: false };
  }
  if (linesHaveChordProInlineChords(displayLines) || hasLyricEmbeddedChords(displayLines)) {
    return { mode: 'passthrough_chordpro', hideChords: false, chordsOnly: false };
  }

  const hasLyrics = displayLines.some(function(line) {
    return String(line || '').trim().length > 0;
  });
  if (!hasLyrics) {
    return { mode: 'chords_only', hideChords: false, chordsOnly: false };
  }

  if (allowNotationMerge) {
    return { mode: 'per_line_abc', hideChords: false, chordsOnly: false };
  }

  return { mode: 'plain', hideChords: false, chordsOnly: false };
}
