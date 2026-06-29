import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { deriveWLines } from './timedAbcDeriver';
import { buildSectionsFromLines } from './timedLyricsModel';
import { exportMinimalTimedLyrics, exportMinimalTimedChords, importMinimalTimedLyrics, importMinimalTimedChords } from './timedExportUtils';
import { clearTimedMediaDraft } from './timedMediaCache';

function applyStanzaDoubleBarlines(noteLines, sections) {
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

function buildTimedLyricsFromMerged(draft) {
  if (!draft.timedLyrics) return null;
  const lines = (draft.mergedLyricLines || []).filter(function(line) {
    return line !== null && line !== undefined;
  });
  const timed = Object.assign({}, draft.timedLyrics, {
    lines: draft.timedLyrics.lines.map(function(line, index) {
      const mergedText = lines[index] != null ? lines[index] : line.text;
      return Object.assign({}, line, { text: mergedText });
    }),
    sections: draft.sections && draft.sections.length > 0
      ? draft.sections
      : buildSectionsFromLines(draft.timedLyrics),
  });
  return timed;
}

export function finishMediaImportWizard(options) {
  const {
    tune,
    tunebook,
    abcjsParser,
    draft,
  } = options;

  if (!tune || !draft || !tunebook || !abcjsParser) {
    throw new Error('Missing data required to finish the media import wizard');
  }

  const metadata = draft.metadata || {};
  if (metadata.name) tune.name = metadata.name;
  if (metadata.composer) tune.composer = metadata.composer;
  if (metadata.meter) tune.meter = metadata.meter;
  if (metadata.key) tune.key = metadata.key;
  if (metadata.noteLength) tune.noteLength = metadata.noteLength;

  const abcTools = tunebook.abcTools;
  const baseAbc = draft.baseTuneAbc && draft.baseTuneAbc.trim()
    ? draft.baseTuneAbc
    : abcTools.json2abc(tune);

  // Apply wizard metadata to the tune header before merging edited melody/chords.
  const baseJson = abcTools.abc2json(baseAbc);
  if (metadata.meter) baseJson.meter = metadata.meter;
  if (metadata.key) baseJson.key = metadata.key;
  if (metadata.noteLength) baseJson.noteLength = metadata.noteLength;
  if (metadata.name) baseJson.name = metadata.name;
  if (metadata.composer) baseJson.composer = metadata.composer;

  let mergedAbc = abcTools.json2abc(baseJson);

  const melodyText = (draft.melodyNotesText && draft.melodyNotesText.trim())
    ? draft.melodyNotesText
    : (draft.melodyAbcText || '');
  if (melodyText.trim()) {
    mergedAbc = abcjsParser.mergeMelody(melodyText, mergedAbc);
  }
  if (draft.chordGridText && draft.chordGridText.trim()) {
    mergedAbc = abcjsParser.mergeChords(draft.chordGridText, mergedAbc);
  }

  const noteText = abcTools.justNotes(mergedAbc);
  let noteLines = noteText ? noteText.split('\n') : [];
  noteLines = applyStanzaDoubleBarlines(noteLines, draft.sections);

  // mergeMelody/mergeChords render note-only ABC, dropping the % abcbook-*
  // metadata (links, files, recordings, tags, src-url, etc.). Use baseJson,
  // which was parsed from the original tune ABC and still holds that metadata,
  // and only replace the primary voice notes so nothing else is lost.
  const voiceKey = resolvePrimaryVoiceKey(baseJson.voices);
  baseJson.voices = Object.assign({}, baseJson.voices);
  baseJson.voices[voiceKey] = Object.assign({}, baseJson.voices[voiceKey] || { meta: '', notes: [] }, {
    notes: noteLines,
  });

  Object.assign(tune, baseJson);
  tune.id = tune.id || baseJson.id;

  const mergedTimedLyrics = buildTimedLyricsFromMerged(draft);
  let wLines = (draft.mergedLyricLines || []).slice();
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
  tune.wLines = wLines;

  const minimalLyrics = exportMinimalTimedLyrics(
    mergedTimedLyrics || draft.timedLyrics
  );
  const minimalChords = exportMinimalTimedChords(draft.timedChords);
  tune.timedLyrics = minimalLyrics ? importMinimalTimedLyrics(minimalLyrics) : null;
  tune.timedChords = minimalChords ? importMinimalTimedChords(minimalChords) : null;

  delete tune.timedMelody;
  delete tune.words;
  delete tune.timingScaffold;

  if (tune.id) {
    clearTimedMediaDraft(tune.id);
  }

  return tunebook.saveTune(tune);
}
