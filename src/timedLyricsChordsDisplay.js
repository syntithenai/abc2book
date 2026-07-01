import { alignChordsToLyricLines } from './timedAbcDeriver';
import { hasChordLines, splitChordChartIntoBlocks, chartBlockHasChords } from './chordSheetUtils';
import { getLyricLinesForDisplay } from './wLinesUtils';

/**
 * Chord content from lyrics chord sheets or melody notation — not timed import
 * metadata alone.
 */
export function tuneHasExplicitChords(tune, tunebook, abcjsParser) {
  if (!tune) return false;
  if (hasChordLines(getLyricLinesForDisplay(tune))) return true;
  try {
    const firstVoice = tune.voices && Object.keys(tune.voices).length > 0
      ? Object.values(tune.voices)[0]
      : { notes: [] };
    const melodyAbc = tunebook && tunebook.abcTools
      ? tunebook.abcTools.emptyABC(tune.name) + firstVoice.notes.join('\n')
      : '';
    if (!melodyAbc || !abcjsParser) return false;
    const transpose = Number(tune.transpose) || 0;
    const chordChart = abcjsParser.renderChords(
      melodyAbc, false, transpose, tune.key, tune.noteLength, tune.meter
    );
    const chordBlocks = splitChordChartIntoBlocks(chordChart || '');
    return chordBlocks.some(chartBlockHasChords);
  } catch (e) {
    return false;
  }
}

/**
 * Build lyric display rows from wLines/words only (no timed chord/lyric fallback).
 */
export function buildLinesFromTune(tune) {
  const displayLines = getLyricLinesForDisplay(tune);
  return displayLines
    .filter(function(line) { return line && String(line).trim().length > 0; })
    .map(function(text, index) {
      return {
        text: text,
        chord: '',
        start: index * 2,
        end: index * 2 + 2,
      };
    });
}

/**
 * Per-line chord hints from timed alignment — only when the tune already has
 * explicit chord content elsewhere.
 */
export function buildTimedAlignedLines(tune) {
  const singableDisplay = getLyricLinesForDisplay(tune).filter(function(line) {
    return line && String(line).trim().length > 0;
  });
  if (!tune || !tune.timedLyrics || singableDisplay.length === 0) return [];
  const timedAligned = alignChordsToLyricLines(tune.timedLyrics, tune.timedChords);
  if (timedAligned.length === 0) return [];
  return singableDisplay.map(function(text, index) {
    const timed = timedAligned[index] || timedAligned[timedAligned.length - 1];
    return {
      text: text,
      chord: timed && timed.chord ? timed.chord : '',
      start: timed ? timed.start : index * 2,
      end: timed ? timed.end : index * 2 + 2,
    };
  });
}
