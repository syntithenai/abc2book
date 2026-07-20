import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { noteLinesHaveRealMelody } from './timedImportFinalizer';
import { getLyricLines } from './wLinesUtils';
import { formatTuneDisplayName } from './tuneDisplayName';
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  hasLyricEmbeddedChords,
  isSectionHeader,
  splitIntoBlocks,
} from './chordSheetUtils';
import {
  extractBarsFromMelodyText,
  flattenMelodyText,
  splitMelodyIntoBlocks,
} from './lyricBarAlignmentUtils';

const MELODY_BAR_COVERAGE_THRESHOLD = 0.7;

function issue(code, message, field) {
  return { code: code, message: message, field: field || null };
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function singableLyricLines(tune) {
  return getLyricLines(tune).filter(function(line) {
    return String(line || '').trim().length > 0 && !isSectionHeader(line);
  });
}

function noteLinesTextHasChords(noteLines, hasChordsFn) {
  const text = Array.isArray(noteLines) ? noteLines.join('\n') : '';
  if (typeof hasChordsFn === 'function') {
    return hasChordsFn(text);
  }
  return text.indexOf('"') !== -1;
}

function melodyBlockCount(noteLines) {
  const blocks = splitMelodyIntoBlocks(noteLines);
  return blocks.length > 0 ? blocks.length : (flattenMelodyText(noteLines) ? 1 : 0);
}

function lyricBlockCount(tune) {
  const lyrics = getLyricLines(tune);
  const blocks = splitIntoBlocks(lyrics);
  const nonEmpty = blocks.filter(function(block) {
    return block.some(function(line) { return String(line || '').trim().length > 0; });
  });
  return nonEmpty.length;
}

function barCoverage(noteLines) {
  const flat = flattenMelodyText(noteLines);
  if (!flat) return 0;
  const bars = extractBarsFromMelodyText(flat);
  if (bars.length === 0) return 0;
  let withNotes = 0;
  bars.forEach(function(bar) {
    const stripped = String(bar || '')
      .replace(/"([^"]+)"/g, '')
      .replace(/[|\s]/g, '')
      .replace(/z/gi, '')
      .trim();
    if (stripped.length > 0) withNotes += 1;
  });
  return withNotes / bars.length;
}

function hasStanzaDoubleBarlines(noteLines) {
  const text = Array.isArray(noteLines) ? noteLines.join('\n') : '';
  return /\|\|/.test(text);
}

export function checkPathA(tune, options) {
  const opts = options || {};
  const issues = [];
  const noteLines = getNoteLines(tune);
  const lyrics = getLyricLines(tune);
  const singable = singableLyricLines(tune);

  if (!tune.name || !String(tune.name).trim()) {
    issues.push(issue('missing_title', 'Title is missing', 'name'));
  }
  if (singable.length === 0) {
    issues.push(issue('no_lyrics', 'No singable lyrics (W: or w: lines)', 'lyrics'));
  }
  if (!tune.meter || !String(tune.meter).trim()) {
    issues.push(issue('missing_meter', 'Time signature (M:) is required for chord layout', 'meter'));
  }

  const lyricsHaveInlineChords = hasLyricEmbeddedChords(lyrics);
  const abcHasChords = noteLinesTextHasChords(noteLines, opts.hasChords);
  const scaffold = !!tune.timingScaffold;

  if (!lyricsHaveInlineChords && !abcHasChords && !scaffold) {
    issues.push(issue('no_chord_layout', 'No chord layout in lyrics or ABC notation', 'chords'));
  }

  if (noteLinesHaveRealMelody(noteLines) && !scaffold) {
    issues.push(issue('unexpected_melody', 'Path A expects chord scaffold or lyrics-only layout, not a full melody', 'voices'));
  }

  const mBlocks = melodyBlockCount(noteLines);
  const lBlocks = lyricBlockCount(tune);
  if (lBlocks > 1 && mBlocks > 0 && mBlocks !== lBlocks && !hasStanzaDoubleBarlines(noteLines)) {
    issues.push(issue('stanza_barlines', 'Lyric stanzas should be marked with double bar lines (||) in ABC', 'voices'));
  }

  if (typeof opts.renderChords === 'function' && opts.abcText && singable.length > 0) {
    try {
      const chordChart = opts.renderChords(opts.abcText, true);
      const aligned = alignChordBlocksToLyrics(lyrics, chordChart, {
        chordSectionLabels: Array.isArray(tune.chordSectionLabels) ? tune.chordSectionLabels : null,
      });
      const unmatched = aligned.filter(function(block) {
        return block.lyricLines.length > 0 && !chartBlockHasChords(block.chart) && !block.inlineChords;
      });
      if (unmatched.length > 0) {
        issues.push(issue('stanza_chord_mismatch', 'Lyric stanzas cannot be mapped to chord blocks', 'chords'));
      }
    } catch (e) {}
  }

  return issues;
}

export function checkPathB(tune, options) {
  const opts = options || {};
  const issues = [];
  const noteLines = getNoteLines(tune);

  if (!tune.name || !String(tune.name).trim()) {
    issues.push(issue('missing_title', 'Title is missing', 'name'));
  }
  if (!noteLinesHaveRealMelody(noteLines)) {
    issues.push(issue('no_melody', 'No melody notes in ABC notation', 'voices'));
  }
  if (!tune.meter || !String(tune.meter).trim()) {
    issues.push(issue('missing_meter', 'Time signature (M:) is required', 'meter'));
  }
  if (!tune.key || !String(tune.key).trim()) {
    issues.push(issue('missing_key', 'Key (K:) is required', 'key'));
  }

  const coverage = barCoverage(noteLines);
  if (coverage > 0 && coverage < MELODY_BAR_COVERAGE_THRESHOLD) {
    issues.push(issue('sparse_melody', 'Melody notes are missing in many bars (' + Math.round(coverage * 100) + '% coverage)', 'voices'));
  }

  if (!noteLinesTextHasChords(noteLines, opts.hasChords)) {
    issues.push(issue('no_embedded_chords', 'Chords should be embedded in ABC (e.g. "Cm")', 'chords'));
  }

  return issues;
}

export function suggestCompletenessPath(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLinesHaveRealMelody(noteLines) && !tune.timingScaffold) return 'B';
  return 'A';
}

export function checkTuneCompleteness(tune, options) {
  if (!tune || !tune.id) return null;

  const pathAIssues = checkPathA(tune, options);
  const pathBIssues = checkPathB(tune, options);

  if (pathAIssues.length === 0 || pathBIssues.length === 0) {
    return null;
  }

  const suggestedPath = suggestCompletenessPath(tune);
  const issues = suggestedPath === 'B' ? pathBIssues : pathAIssues;

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    composer: tune.composer || '',
    suggestedPath: suggestedPath,
    pathAIssues: pathAIssues,
    pathBIssues: pathBIssues,
    issues: issues,
  };
}

export function checkTunesCompleteness(tunes, options) {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map(function(tune) { return checkTuneCompleteness(tune, options); })
    .filter(Boolean);
}
