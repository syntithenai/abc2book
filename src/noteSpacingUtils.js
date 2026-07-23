import abcjs from 'abcjs';
import { isSectionHeader } from './chordSheetUtils';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import {
  getPlainLyricLines,
  getNoteAlignedLyricLines,
  hasStoredNoteAlignedLyrics,
  lyricLineHasNoteSpacing,
} from './wLinesUtils';
import {
  buildNotationLineBarMap,
  lyricAssignmentsForMelody,
  lyricTextForBarRange,
  countNotesInBarRange,
} from './lyricBarAlignmentUtils';

export { lyricLineHasNoteSpacing };

function getBoundaryAwareLyricLines(tune) {
  const alignment = tune && tune.meta && Array.isArray(tune.meta.chordSheetAlignment)
    ? tune.meta.chordSheetAlignment
    : [];
  if (alignment.length === 0) return getPlainLyricLines(tune);

  const lines = [];
  alignment.forEach(function(block, blockIndex) {
    if (block && block.header) {
      lines.push(String(block.header));
    }
    const linePairs = block && Array.isArray(block.linePairs) ? block.linePairs : [];
    linePairs.forEach(function(pair) {
      const text = pair && pair.lyricLine != null ? String(pair.lyricLine) : '';
      if (text.trim().length > 0) lines.push(text);
      else lines.push('');
    });
    if (blockIndex < alignment.length - 1) lines.push('');
  });

  return lines.length > 0 ? lines : getPlainLyricLines(tune);
}

/**
 * Count lyric syllable slots on one ABC note line (notes and rests each use one
 * slot; barlines and chord symbols do not).
 */
export function countLyricSlotsInNoteLine(noteLine, options) {
  const opts = options || {};
  const meter = opts.meter || '4/4';
  const noteLength = opts.noteLength || '1/8';
  const key = opts.key || 'C';
  const line = String(noteLine || '').trim();
  if (!line) return 0;

  const abc = 'X:1\nT:t\nM:' + meter + '\nL:' + noteLength + '\nK:' + key + '\n' + line + '\n';
  let parsed;
  try {
    parsed = abcjs.parseOnly(abc);
  } catch (e) {
    return 0;
  }
  if (!Array.isArray(parsed) || !parsed[0] || !Array.isArray(parsed[0].lines)) return 0;

  let count = 0;
  parsed[0].lines.forEach(function(staffLine) {
    if (!staffLine.staff || !staffLine.staff[0] || !staffLine.staff[0].voices) return;
    staffLine.staff[0].voices.forEach(function(voice) {
      voice.forEach(function(symbol) {
        if (symbol && symbol.el_type === 'note') count += 1;
      });
    });
  });
  return count;
}

function estimateSyllableCount(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 1;
  if (w.length <= 3) return 1;
  const groups = w.match(/[aeiouy]+/g);
  if (!groups) return 1;
  let count = groups.length;
  if (w.endsWith('e') && count > 1 && !w.endsWith('le') && w.length > 3) {
    count -= 1;
  }
  return Math.max(1, count);
}

function splitWordIntoSyllables(word, count) {
  const target = Math.max(1, parseInt(count, 10) || 1);
  const w = String(word || '');
  if (!w) return [''];
  if (target === 1) return [w];

  const lower = w.toLowerCase();
  const splitPoints = [];
  const vowelEnds = [];
  let match;
  const re = /[aeiouy]+/gi;
  while ((match = re.exec(lower)) !== null) {
    vowelEnds.push(match.index + match[0].length);
  }

  for (let i = 0; i < vowelEnds.length - 1 && splitPoints.length < target - 1; i += 1) {
    let point = vowelEnds[i];
    while (point < lower.length && !/[aeiouy]/i.test(lower[point])) point += 1;
    if (point > 0 && point < w.length) splitPoints.push(point);
  }

  while (splitPoints.length < target - 1) {
    const idx = Math.round((w.length * (splitPoints.length + 1)) / target);
    if (idx <= 0 || idx >= w.length) break;
    if (splitPoints.indexOf(idx) === -1) splitPoints.push(idx);
    else break;
  }

  splitPoints.sort(function(a, b) { return a - b; });
  const parts = [];
  let start = 0;
  splitPoints.slice(0, target - 1).forEach(function(point) {
    parts.push(w.slice(start, point));
    start = point;
  });
  parts.push(w.slice(start));
  return parts.filter(function(part) { return part.length > 0; });
}

function wordsFromPlainLine(line) {
  return String(line || '').trim().split(/\s+/).filter(Boolean);
}

function formatUnits(units) {
  return units.map(function(unit) {
    let text = String(unit.text || '');
    if (unit.hyphenAfter && !text.endsWith('-')) text += '-';
    return text;
  }).join(' ').replace(/\s+/g, ' ').trim();
}

function buildSyllableUnits(words) {
  const units = [];
  words.forEach(function(word, wordIndex) {
    const parts = splitWordIntoSyllables(word, estimateSyllableCount(word));
    parts.forEach(function(part, partIndex) {
      units.push({
        text: part,
        wordIndex: wordIndex,
        lastInWord: partIndex === parts.length - 1,
        hyphenAfter: partIndex < parts.length - 1,
      });
    });
  });
  return units;
}

function mergeUnitsAtIndex(units, index) {
  const left = units[index];
  const right = units[index + 1];
  if (!left || !right) return false;
  const sameWord = left.wordIndex === right.wordIndex;
  units.splice(index, 2, {
    text: sameWord ? left.text + right.text : left.text + '~' + right.text,
    wordIndex: left.wordIndex,
    lastInWord: right.lastInWord,
    hyphenAfter: false,
  });
  return true;
}

function reduceUnitsToCount(units, target) {
  while (units.length > target) {
    let merged = false;
    for (let i = 0; i < units.length - 1; i += 1) {
      if (units[i].lastInWord && units[i + 1].wordIndex !== units[i].wordIndex) {
        mergeUnitsAtIndex(units, i);
        merged = true;
        break;
      }
    }
    if (merged) continue;

    for (let i = 0; i < units.length - 1; i += 1) {
      if (units[i].wordIndex === units[i + 1].wordIndex) {
        mergeUnitsAtIndex(units, i);
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }
}

function splitLongestUnit(units) {
  let bestIndex = -1;
  let bestLen = 0;
  units.forEach(function(unit, index) {
    if (unit.text.length > bestLen) {
      bestLen = unit.text.length;
      bestIndex = index;
    }
  });
  if (bestIndex < 0 || bestLen < 2) return false;

  const unit = units[bestIndex];
  const parts = splitWordIntoSyllables(unit.text, 2);
  if (parts.length < 2) return false;

  const replacement = [
    {
      text: parts[0],
      wordIndex: unit.wordIndex,
      lastInWord: false,
      hyphenAfter: true,
    },
    {
      text: parts[1],
      wordIndex: unit.wordIndex,
      lastInWord: unit.lastInWord,
      hyphenAfter: false,
    },
  ];
  units.splice(bestIndex, 1, replacement[0], replacement[1]);
  return true;
}

/**
 * Fit one plain lyric line to a target number of ABC w: syllable slots.
 */
export function fitLyricLineToNoteCount(line, noteCount) {
  const target = Math.max(0, parseInt(noteCount, 10) || 0);
  const trimmed = String(line || '').trim();
  if (!trimmed || target === 0) return trimmed;
  if (lyricLineHasNoteSpacing(trimmed)) return trimmed;

  const words = wordsFromPlainLine(trimmed);
  if (words.length === 0) return trimmed;

  // Word count already matches note slots: keep the line as-is (no hyphenation).
  if (words.length === target) return trimmed;

  let units = buildSyllableUnits(words);
  reduceUnitsToCount(units, target);
  while (units.length < target) {
    if (!splitLongestUnit(units)) break;
  }

  let formatted = formatUnits(units);
  if (units.length < target) {
    formatted += ' *'.repeat(target - units.length);
  }
  return formatted.trim();
}

/**
 * Apply best-guess ABC note spacing to lyric lines paired with melody lines.
 */
export function applyNoteSpacingToLyrics(lyricLines, noteLines, options) {
  const lyrics = Array.isArray(lyricLines) ? lyricLines.slice() : [];
  const notes = Array.isArray(noteLines) ? noteLines.slice() : [];
  const opts = options || {};
  const limit = Math.max(lyrics.length, notes.length);

  for (let i = 0; i < limit; i += 1) {
    const line = lyrics[i];
    const noteLine = notes[i];
    if (line === null || line === undefined) continue;
    if (!String(line).trim()) continue;
    if (isSectionHeader(line)) continue;
    if (lyricLineHasNoteSpacing(line)) continue;
    if (!noteLine || !String(noteLine).trim()) continue;

    const noteCount = countLyricSlotsInNoteLine(noteLine, opts);
    if (noteCount <= 0) continue;

    lyrics[i] = fitLyricLineToNoteCount(line, noteCount);
  }

  return lyrics;
}

/**
 * Build one w: line per ABC notation line using bar-block lyric assignment, then
 * fit syllables to the note count on that staff line (notation display only).
 * Uses plain lyrics as the source; does not read stored note-aligned lines.
 */
export function buildNotationWLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  const noteLines = voice && Array.isArray(voice.notes) ? voice.notes : [];
  const lyricLines = getBoundaryAwareLyricLines(tune);
  if (noteLines.length === 0) return [];

  const opts = {
    meter: tune.meter,
    noteLength: tune.noteLength,
    key: tune.key,
  };
  const assignments = lyricAssignmentsForMelody(noteLines, lyricLines);
  const barMap = buildNotationLineBarMap(noteLines);

  return noteLines.map(function(noteLine, index) {
    const range = barMap[index];
    if (!range || range.barCount === 0) return '';

    const text = lyricTextForBarRange(assignments, range.startBar, range.endBar);
    if (!text.trim()) return '';
    if (lyricLineHasNoteSpacing(text)) return text;

    const noteCount = countLyricSlotsInNoteLine(noteLine, opts);
    if (noteCount <= 0) return text;
    return fitLyricLineToNoteCount(text, noteCount);
  });
}

/**
 * Resolve note-aligned w: lines for notation: prefer stored syllable-marked
 * lines, otherwise generate from plain lyrics and melody.
 */
export function resolveNoteAlignedWLines(tune) {
  if (!tune) return [];
  const rawWLines = Array.isArray(tune.wLines) ? tune.wLines : [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices && tune.voices[voiceKey];
  const noteLines = voice && Array.isArray(voice.notes) ? voice.notes : [];
  const hasRawWLines = rawWLines.some(function(line) {
    return String(line || '').trim();
  });

  // Prefer stored w: lines as edited — do not re-fit to one letter per note.
  if (hasRawWLines) {
    if (noteLines.length === 0) return rawWLines.slice();
    return noteLines.map(function(_noteLine, index) {
      return index < rawWLines.length ? String(rawWLines[index] || '') : '';
    });
  }

  if (hasStoredNoteAlignedLyrics(tune)) {
    const stored = getNoteAlignedLyricLines(tune);
    const voiceKey = resolvePrimaryVoiceKey(tune.voices);
    const voice = tune.voices && tune.voices[voiceKey];
    const noteLines = voice && Array.isArray(voice.notes) ? voice.notes : [];
    if (noteLines.length === 0) return stored;
    const opts = {
      meter: tune.meter,
      noteLength: tune.noteLength,
      key: tune.key,
    };
    // Pad/trim to note-line count and apply spacing to any plain stored lines.
    return noteLines.map(function(noteLine, index) {
      const line = index < stored.length ? stored[index] : '';
      if (!String(line).trim()) return '';
      if (lyricLineHasNoteSpacing(line)) return line;
      const noteCount = countLyricSlotsInNoteLine(noteLine, opts);
      if (noteCount <= 0) return line;
      return fitLyricLineToNoteCount(line, noteCount);
    });
  }
  return buildNotationWLines(tune);
}

/**
 * Apply bar-aware note spacing as one w: line per melody note line.
 * Returns lines suitable for tune.wLines (notation alignment), not plain words.
 */
export function applyNoteSpacingToTune(tune) {
  return buildNotationWLines(tune);
}

/**
 * Build ABC for notation rendering with bar-aligned w: lines applied for display.
 * Pass { includeLyrics: false } for notation-only views that should not show w:/W: lines.
 * Block W: lyrics are omitted so only under-staff syllable lines appear.
 */
export function buildAbcWithNoteSpacing(tune, abcTools, options) {
  if (!tune || !abcTools || typeof abcTools.json2abc !== 'function') return '';
  const includeLyrics = !options || options.includeLyrics !== false;
  if (!includeLyrics) {
    return abcTools.json2abc(Object.assign({}, tune, { wLines: [], words: [] }));
  }
  const plain = getPlainLyricLines(tune);
  const stored = getNoteAlignedLyricLines(tune);
  const hasRawWLines = Array.isArray(tune.wLines) && tune.wLines.some(function(line) {
    return String(line || '').trim();
  });
  if (plain.length === 0 && stored.length === 0 && !hasRawWLines) {
    return abcTools.json2abc(Object.assign({}, tune, { wLines: [], words: [] }));
  }
  const wLines = resolveNoteAlignedWLines(tune);
  // words cleared so only interleaved w: lines render under the staff.
  return abcTools.json2abc(Object.assign({}, tune, { wLines: wLines, words: [] }));
}

/**
 * Remove ABC embedded chord symbols ("Am", "G7", etc.) from notation lines.
 */
export function stripEmbeddedChordsFromAbc(abcText, abcTools) {
  if (!abcText) return '';
  const isNoteLine = abcTools && typeof abcTools.isNoteLine === 'function'
    ? abcTools.isNoteLine.bind(abcTools)
    : null;
  return abcText.split('\n').map(function(line) {
    if (!isNoteLine || !isNoteLine(line)) return line;
    return line.replace(/"[^"]*"/g, '');
  }).join('\n');
}

/**
 * Remove lyric lines under notes (w:) and block words after the tune (W:).
 */
export function stripLyricLinesFromAbc(abcText) {
  if (!abcText) return '';
  return String(abcText).split('\n').filter(function(line) {
    const trimmed = String(line || '').trim();
    if (/^w:/i.test(trimmed)) return false;
    if (/^W:/i.test(trimmed)) return false;
    return true;
  }).join('\n');
}

function defaultIsNoteLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('%')) return false;
  if (/^[A-Za-z]:/.test(trimmed)) return false;
  if (/^w:/i.test(trimmed)) return false;
  return true;
}

/**
 * Join each voice's note lines into a single line so ABC ignores source line
 * breaks. Pair with staffwidth set to the page width (and no responsive
 * shrink) so music wraps across the full page at natural size.
 */
export function flattenTuneNoteLineBreaks(tune) {
  if (!tune || !tune.voices) return tune;
  const voices = {};
  Object.keys(tune.voices).forEach(function(key) {
    const voice = tune.voices[key] || {};
    const notes = Array.isArray(voice.notes) ? voice.notes : [];
    const joined = notes
      .map(function(line) { return String(line || '').trim(); })
      .filter(Boolean)
      .join(' ');
    voices[key] = Object.assign({}, voice, { notes: joined ? [joined] : [] });
  });
  return Object.assign({}, tune, { voices: voices });
}

/**
 * Join ABC note lines into one continuous staff flow, ignoring source line
 * breaks. Interleaved w: lyric lines are merged onto a single w: line.
 * Prefer flattenTuneNoteLineBreaks when a tune object is available.
 */
export function flattenAbcNoteLineBreaks(abcText, abcTools) {
  if (!abcText) return '';
  const isNoteLine = abcTools && typeof abcTools.isNoteLine === 'function'
    ? abcTools.isNoteLine.bind(abcTools)
    : defaultIsNoteLine;
  const lines = String(abcText).split('\n');
  const out = [];
  let noteParts = [];
  let lyricParts = [];

  function flushNoteRun() {
    if (noteParts.length === 0 && lyricParts.length === 0) return;
    if (noteParts.length > 0) {
      out.push(noteParts.filter(Boolean).join(' '));
    }
    if (lyricParts.length > 0) out.push('w: ' + lyricParts.join(' '));
    noteParts = [];
    lyricParts = [];
  }

  lines.forEach(function(line) {
    const trimmed = String(line || '').trim();
    // Empty lines are "note lines" in abcTools.isNoteLine but must not be
    // collected or they can break continuous-flow rendering.
    if (!trimmed) {
      if (noteParts.length > 0 || lyricParts.length > 0) flushNoteRun();
      else out.push(line);
      return;
    }
    if (isNoteLine(line) && !/^w:/i.test(trimmed)) {
      noteParts.push(trimmed);
      return;
    }
    if (/^w:/i.test(trimmed)) {
      const lyric = trimmed.replace(/^w:\s*/i, '');
      if (lyric) lyricParts.push(lyric);
      return;
    }
    flushNoteRun();
    out.push(line);
  });
  flushNoteRun();
  return out.join('\n');
}
