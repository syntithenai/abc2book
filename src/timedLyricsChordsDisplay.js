import { alignChordsToLyricLines } from './timedAbcDeriver';
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  hasLyricEmbeddedChords,
  isSectionHeader,
  splitChordChartIntoBlocks,
} from './chordSheetUtils';
import { noteLinesHaveRealMelody } from './timedImportFinalizer';
import { getLyricLinesForDisplay } from './wLinesUtils';
import { lyricLinesForViews } from './tuneDisplayLayers';

export { hasLyricEmbeddedChords };
export { resolveChordRenderPlan } from './chordLyricRenderPlan';

/**
 * True when the tune's lyric field embeds chord placement (COW or ChordPro).
 */
export function tuneHasLyricEmbeddedChords(tune) {
  if (!tune) return false;
  return hasLyricEmbeddedChords(getLyricLinesForDisplay(tune));
}

function getFirstVoiceNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const keys = Object.keys(tune.voices);
  if (keys.length === 0) return [];
  const voice = tune.voices[keys[0]];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function getMelodyChordChart(tune, tunebook, abcjsParser) {
  if (!tune || !abcjsParser) return '';
  try {
    const noteLines = getFirstVoiceNoteLines(tune);
    const melodyAbc = tunebook && tunebook.abcTools
      ? tunebook.abcTools.emptyABC(tune.name) + noteLines.join('\n')
      : noteLines.join('\n');
    if (!melodyAbc) return '';
    const transpose = Number(tune.transpose) || 0;
    return abcjsParser.renderChords(
      melodyAbc, false, transpose, tune.key, tune.noteLength, tune.meter
    ) || '';
  } catch (e) {
    return '';
  }
}

/**
 * Chord content from lyrics chord sheets or melody notation — not timed import
 * metadata alone.
 */
export function tuneHasExplicitChords(tune, tunebook, abcjsParser) {
  if (!tune) return false;
  if (tuneHasLyricEmbeddedChords(tune)) return true;
  const chordBlocks = splitChordChartIntoBlocks(getMelodyChordChart(tune, tunebook, abcjsParser));
  return chordBlocks.some(chartBlockHasChords);
}

/**
 * True when melody chords sit on real notes (not a rest-only chord scaffold).
 * Prefer inline so chords stay on the staff.
 */
export function melodyChordsHaveNotes(tune, tunebook, abcjsParser) {
  if (!tune) return false;
  if (!noteLinesHaveRealMelody(getFirstVoiceNoteLines(tune))) return false;
  const chordBlocks = splitChordChartIntoBlocks(getMelodyChordChart(tune, tunebook, abcjsParser));
  return chordBlocks.some(chartBlockHasChords);
}

/**
 * True when every lyric stanza maps to a chord block (hymn-style single chart
 * and section-header reuse count as complete).
 */
export function chordBlocksCompleteForLyrics(tune, tunebook, abcjsParser) {
  if (!tune) return false;
  const lyrics = lyricLinesForViews(tune);
  const singable = lyrics.filter(function(line) {
    return String(line || '').trim().length > 0 && !isSectionHeader(line);
  });
  if (singable.length === 0) return false;
  const chordChart = getMelodyChordChart(tune, tunebook, abcjsParser);
  if (!chordChart.trim()) return false;
  try {
    const aligned = alignChordBlocksToLyrics(lyrics, chordChart, {});
    if (aligned.length === 0) return false;
    const unmatched = aligned.filter(function(block) {
      return block.lyricLines.length > 0
        && !chartBlockHasChords(block.chart)
        && !block.inlineChords;
    });
    if (unmatched.length > 0) return false;
    return aligned.some(function(block) {
      return chartBlockHasChords(block.chart) || block.inlineChords;
    });
  } catch (e) {
    return false;
  }
}

/** Prefer inline chords when lyrics already embed chord timing. */
export function preferInlineChords(tune, tunebook, abcjsParser) {
  if (tuneHasLyricEmbeddedChords(tune)) return true;
  return melodyChordsHaveNotes(tune, tunebook, abcjsParser)
    || chordBlocksCompleteForLyrics(tune, tunebook, abcjsParser);
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
 * Per-line chord hints from timed alignment (legacy helper).
 * Display prefers ABC / chord-sheet chords; do not use this for rendering.
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
