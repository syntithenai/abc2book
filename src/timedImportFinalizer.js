import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import {
  deriveWLines,
  deriveRhythmicScaffold,
  deriveChordSymbols,
  getDerivationGridOptions,
} from './timedAbcDeriver';
import { buildSectionsFromLines } from './timedLyricsModel';
import { buildNotationWLines } from './noteSpacingUtils';
import { getLyricLines, setLyricLines } from './wLinesUtils';

export function applyStanzaDoubleBarlines(noteLines, sections) {
  if (!Array.isArray(noteLines) || !Array.isArray(sections) || sections.length === 0) {
    return noteLines;
  }
  const lines = noteLines.slice();
  sections.forEach(function(section, index) {
    if (index === sections.length - 1) return;
    const lineIndex = section.endLine;
    if (lineIndex >= 0 && lineIndex < lines.length && lines[lineIndex]) {
      lines[lineIndex] = lines[lineIndex].replace(/\|(?!\|)\s*$/, '||');
    }
  });
  return lines;
}

export function buildTimedLyricsFromMerged(draft) {
  if (!draft.timedLyrics) return null;
  const lines = (draft.mergedLyricLines || []).filter(function(line) {
    return line !== null && line !== undefined;
  });
  return Object.assign({}, draft.timedLyrics, {
    lines: draft.timedLyrics.lines.map(function(line, index) {
      const mergedText = lines[index] != null ? lines[index] : line.text;
      return Object.assign({}, line, { text: mergedText });
    }),
    sections: draft.sections && draft.sections.length > 0
      ? draft.sections
      : buildSectionsFromLines(draft.timedLyrics),
  });
}

export function noteLinesHaveRealMelody(noteLines) {
  if (!Array.isArray(noteLines)) return false;
  return noteLines.some(function(line) {
    return String(line || '')
      .replace(/"([^"]+)"/g, '')
      .replace(/[|\s]/g, '')
      .replace(/z/gi, '')
      .trim().length > 0;
  });
}

export function clearTransientTimedFields(tune) {
  if (!tune) return tune;
  delete tune.timedLyrics;
  delete tune.timedChords;
  delete tune.timedMelody;
  delete tune.words;
  return tune;
}

function resolveMelodyAndChordGrid(draft, tunebook, tuneMeta) {
  let melodyText = (draft.melodyNotesText && draft.melodyNotesText.trim())
    ? draft.melodyNotesText
    : (draft.melodyAbcText || '');
  let chordGridText = draft.chordGridText || '';
  let timingScaffold = false;

  const gridOptions = getDerivationGridOptions(
    Object.assign({}, tuneMeta, { timedChords: draft.timedChords }),
    tunebook
  );

  if (!melodyText.trim() && draft.timedChords && draft.timedChords.beatTimes
      && draft.timedChords.beatTimes.length > 0) {
    melodyText = deriveRhythmicScaffold(draft.timedChords, draft.timedLyrics, gridOptions);
    timingScaffold = !!melodyText.trim();
  }

  if (!chordGridText.trim() && draft.timedChords) {
    const derivedGrid = deriveChordSymbols(
      draft.timedChords,
      Object.assign({}, gridOptions, { includeMeterChanges: false })
    );
    if (derivedGrid.trim()) chordGridText = derivedGrid;
  }

  return {
    melodyText: melodyText,
    chordGridText: chordGridText,
    timingScaffold: timingScaffold,
  };
}

function deriveWLyricLines(draft, mergedTimedLyrics) {
  let wLines = (draft.lyricLines && draft.lyricLines.length > 0)
    ? draft.lyricLines.slice()
    : (draft.mergedLyricLines || []).slice();
  if (mergedTimedLyrics && draft.timedMelody) {
    const derived = deriveWLines(mergedTimedLyrics, draft.timedMelody).map(function(line) {
      return line.replace(/^w:\s*/, '');
    });
    if (derived.some(function(line) { return String(line).trim().length > 0; })) {
      wLines = derived;
    }
  }
  if (wLines.length === 0 && draft.mergedLyricLines && draft.mergedLyricLines.length > 0) {
    wLines = draft.mergedLyricLines.slice();
  }
  return wLines;
}

/**
 * Algorithm A: collapse wall-clock timed analysis into durable ABC + wLines,
 * then discard persisted timed JSON fields.
 */
export function finalizeMediaTimedImport(options) {
  const {
    tune,
    tunebook,
    abcjsParser,
    draft,
    baseJson,
  } = options;

  if (!tune || !draft || !tunebook || !abcjsParser || !baseJson) {
    throw new Error('Missing data required to finalize timed media import');
  }

  const abcTools = tunebook.abcTools;
  let mergedAbc = abcTools.json2abc(baseJson);
  const resolved = resolveMelodyAndChordGrid(draft, tunebook, baseJson);

  if (resolved.melodyText.trim()) {
    mergedAbc = abcjsParser.mergeMelody(resolved.melodyText, mergedAbc);
  }
  if (resolved.chordGridText.trim()) {
    mergedAbc = abcjsParser.mergeChords(resolved.chordGridText, mergedAbc);
  }

  let noteLines = abcTools.justNotes(mergedAbc).split('\n');
  noteLines = applyStanzaDoubleBarlines(noteLines, draft.sections);

  const voiceKey = resolvePrimaryVoiceKey(baseJson.voices);
  baseJson.voices = Object.assign({}, baseJson.voices);
  baseJson.voices[voiceKey] = Object.assign({}, baseJson.voices[voiceKey] || { meta: '', notes: [] }, {
    notes: noteLines,
  });

  Object.assign(tune, baseJson);
  tune.id = tune.id || baseJson.id;

  const mergedTimedLyrics = buildTimedLyricsFromMerged(draft);
  tune.wLines = deriveWLyricLines(draft, mergedTimedLyrics);

  if (resolved.timingScaffold) {
    tune.timingScaffold = true;
  } else if (noteLinesHaveRealMelody(noteLines) && getLyricLines(tune).length > 0) {
    const spaced = buildNotationWLines(tune);
    if (spaced.some(function(line) { return String(line).trim().length > 0; })) {
      tune.wLines = spaced;
    }
  }

  clearTransientTimedFields(tune);
  return tune;
}

/**
 * Algorithm B8: merge scraped chord grid into ABC and fit w: lines when melody exists.
 */
export function finalizeChordSheetToTune(options) {
  const {
    tune,
    tunebook,
    abcjsParser,
    abc,
    chordGridText,
    lyricLines,
  } = options;

  if (!tune || !tunebook || !abcjsParser || !abc) {
    throw new Error('Missing data required to finalize chord sheet import');
  }

  const abcTools = tunebook.abcTools;
  let mergedAbc = abc;
  if (chordGridText && String(chordGridText).trim()) {
    mergedAbc = abcjsParser.mergeChords(chordGridText, mergedAbc);
  }

  const abcJson = abcTools.abc2json(abc);
  abcJson.id = tune.id || abcJson.id;
  const voiceKey = resolvePrimaryVoiceKey(abcJson.voices);
  const noteLines = abcTools.justNotes(mergedAbc).split('\n');
  abcJson.voices = Object.assign({}, abcJson.voices);
  abcJson.voices[voiceKey] = Object.assign({}, abcJson.voices[voiceKey] || { meta: '', notes: [] }, {
    notes: noteLines,
  });

  Object.assign(tune, abcJson);

  if (Array.isArray(lyricLines)) {
    setLyricLines(tune, lyricLines);
  }

  if (noteLinesHaveRealMelody(noteLines) && getLyricLines(tune).length > 0) {
    const spaced = buildNotationWLines(tune);
    if (spaced.some(function(line) { return String(line).trim().length > 0; })) {
      tune.wLines = spaced;
    }
  }

  clearTransientTimedFields(tune);
  return tune;
}
