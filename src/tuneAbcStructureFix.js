import abcjs from 'abcjs';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import {
  convertSessionLineBreaks,
  needsSessionLineBreakFix,
} from './abcImportNormalize';
import { splitIntoBlocks } from './chordSheetUtils';
import { normalizeChordChartRepeatMarks } from './chordSheetUtils';
import {
  extractBarsFromMelodyText,
  flattenMelodyText,
} from './lyricBarAlignmentUtils';
import { fixTuneAbcHeaders, normalizeTuneAbc } from './tuneAbcCorrectnessCheck';
import { getLyricLines } from './wLinesUtils';

function getNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function lyricBlockCount(tune) {
  const lyrics = getLyricLines(tune);
  const blocks = splitIntoBlocks(lyrics);
  return blocks.filter(function(block) {
    return block.some(function(line) { return String(line || '').trim().length > 0; });
  }).length;
}

/**
 * Collapse spaces inside repeat marks on melody note lines.
 */
export function normalizeMelodyRepeatMarks(noteLines) {
  if (!Array.isArray(noteLines)) return noteLines;
  return noteLines.map(function(line) {
    return normalizeChordChartRepeatMarks(String(line || ''));
  });
}

export function fixSessionLineBreaksInTune(tune, abcTools) {
  if (!tune || !abcTools) return null;
  const abcText = abcTools.json2abc(tune);
  const noteLines = getNoteLines(tune);
  const noteFlat = flattenMelodyText(noteLines);
  const needsFix = needsSessionLineBreakFix(abcText) || needsSessionLineBreakFix(noteFlat);
  if (!needsFix) return null;

  if (needsSessionLineBreakFix(abcText)) {
    const converted = convertSessionLineBreaks(abcText);
    const json = abcTools.abc2json(converted);
    json.id = tune.id;
    return Object.assign({}, tune, json);
  }

  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const convertedLines = noteLines.map(function(line) {
    return convertSessionLineBreaks(String(line || ''));
  });
  const next = Object.assign({}, tune);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: convertedLines,
  });
  return next;
}

export function syncTuneFieldsFromAbc(tune, abcTools) {
  if (!tune || !abcTools || typeof abcTools.getMetaValueFromAbc !== 'function') return null;
  const abcText = abcTools.json2abc(tune);
  const next = Object.assign({}, tune);
  let changed = false;

  ['M', 'K', 'L', 'Q'].forEach(function(header) {
    const fromAbc = String(abcTools.getMetaValueFromAbc(header, abcText) || '').trim();
    if (!fromAbc) return;
    const fieldMap = { M: 'meter', K: 'key', L: 'noteLength', Q: 'tempo' };
    const field = fieldMap[header];
    const current = String(next[field] || '').trim();
    if (!current && fromAbc) {
      next[field] = fromAbc;
      changed = true;
    }
  });

  return changed ? next : null;
}

export function fixStanzaDoubleBarlinesInTune(tune, abcTools) {
  if (!tune || !abcTools) return null;
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;

  const lyricBlocks = lyricBlockCount(tune);
  if (lyricBlocks <= 1) return null;
  if (/\|\|/.test(flattenMelodyText(noteLines))) return null;

  const flat = flattenMelodyText(noteLines);
  const bars = extractBarsFromMelodyText(flat);
  if (bars.length < lyricBlocks || bars.length % lyricBlocks !== 0) return null;

  const barsPerStanza = bars.length / lyricBlocks;
  const rebuilt = [];
  bars.forEach(function(bar, index) {
    rebuilt.push(bar);
    const barNumber = index + 1;
    if (barNumber % barsPerStanza === 0 && barNumber < bars.length) {
      rebuilt[rebuilt.length - 1] = bar + ' ||';
    }
  });

  const newFlat = rebuilt.join(' | ');
  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: [newFlat],
  });
  return next;
}

export function normalizeMelodyRepeatMarksInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const normalized = normalizeMelodyRepeatMarks(noteLines);
  const changed = normalized.some(function(line, index) {
    return line !== noteLines[index];
  });
  if (!changed) return null;

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: normalized,
  });
  return next;
}

function tuneEndsCleanly(noteLines) {
  const flat = flattenMelodyText(noteLines);
  if (!flat) return false;
  const trimmed = flat.trim();
  if (/\|:\s*$/.test(trimmed)) return false;
  if (/\[[0-9]+\][^|]*$/.test(trimmed)) return false;
  if (/\|]|\|\||:\|\s*$/.test(trimmed)) return true;
  return /\|$/.test(trimmed) || /[a-gA-GzZ0-9"')\]]\s*$/.test(trimmed);
}

export function appendFinalBarlineInTune(tune, abcTools) {
  if (!tune || !abcTools) return null;
  const noteLines = getNoteLines(tune);
  if (!tuneEndsCleanly(noteLines)) return null;

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const lines = noteLines.slice();
  const lastIndex = lines.length - 1;
  const lastLine = String(lines[lastIndex] || '').trim();
  if (!lastLine) return null;

  lines[lastIndex] = lastLine.replace(/\|?\s*$/, '') + ' |]';
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: lines,
  });
  return next;
}

export function previewStructureFix(action, tune, abcTools, parseAndRender) {
  if (!tune || !abcTools) return null;

  let next = null;
  if (action === 'fixHeaders') {
    next = fixTuneAbcHeaders(tune, abcTools);
  } else if (action === 'sessionLineBreaks') {
    next = fixSessionLineBreaksInTune(tune, abcTools);
  } else if (action === 'syncHeadersFromAbc') {
    next = syncTuneFieldsFromAbc(tune, abcTools);
  } else if (action === 'stanzaDoubleBarlines') {
    next = fixStanzaDoubleBarlinesInTune(tune, abcTools);
  } else if (action === 'normalizeRepeatMarks') {
    next = normalizeMelodyRepeatMarksInTune(tune);
  } else if (action === 'normalizeAbc' && typeof parseAndRender === 'function') {
    next = normalizeTuneAbc(tune, abcTools, parseAndRender);
  } else if (action === 'appendFinalBarline') {
    next = appendFinalBarlineInTune(tune, abcTools);
  }

  if (!next) return null;

  const before = abcTools.json2abc(tune);
  const after = abcTools.json2abc(next);
  if (before.trim() === after.trim() && JSON.stringify(tune) === JSON.stringify(next)) {
    return null;
  }

  return { tune: next, before: before, after: after };
}

export function applyStructureFix(action, tune, abcTools, parseAndRender) {
  const preview = previewStructureFix(action, tune, abcTools, parseAndRender);
  return preview ? preview.tune : null;
}

export function structureFixAvailable(action, tune, abcTools, issues) {
  const codes = Array.isArray(issues)
    ? issues.map(function(item) { return item.code; })
    : [];

  if (action === 'fixHeaders') {
    return codes.some(function(code) {
      return code === 'missing_meter_header' || code === 'missing_key_header'
        || code === 'missing_meter' || code === 'missing_key';
    }) || !String(tune.meter || '').trim() || !String(tune.key || '').trim();
  }
  if (action === 'sessionLineBreaks') {
    return codes.indexOf('session_linebreak_markers') >= 0
      || needsSessionLineBreakFix(abcTools.json2abc(tune));
  }
  if (action === 'syncHeadersFromAbc') {
    return codes.indexOf('header_field_mismatch') >= 0;
  }
  if (action === 'stanzaDoubleBarlines') {
    return codes.indexOf('stanza_strain_mismatch') >= 0
      || codes.indexOf('stanza_barlines') >= 0;
  }
  if (action === 'normalizeRepeatMarks') {
    return codes.indexOf('repeat_style_mixed') >= 0;
  }
  if (action === 'normalizeAbc') {
    return codes.indexOf('round_trip_drift') >= 0;
  }
  if (action === 'appendFinalBarline') {
    return codes.indexOf('missing_final_barline') >= 0;
  }
  return false;
}

export const STRUCTURE_FIX_ACTIONS = [
  { id: 'fixHeaders', label: 'Fix missing headers', tier: 'a' },
  { id: 'sessionLineBreaks', label: 'Fix Session ! line breaks', tier: 'a' },
  { id: 'syncHeadersFromAbc', label: 'Sync fields from ABC headers', tier: 'a' },
  { id: 'stanzaDoubleBarlines', label: 'Insert stanza double bar lines', tier: 'a' },
  { id: 'normalizeRepeatMarks', label: 'Normalize repeat mark spacing', tier: 'a' },
  { id: 'normalizeAbc', label: 'Normalize ABC (preview)', tier: 'b', requiresPreview: true },
  { id: 'appendFinalBarline', label: 'Append final bar line (preview)', tier: 'b', requiresPreview: true },
];

export function getAvailableStructureFixes(tune, abcTools, issues, parseAndRender) {
  return STRUCTURE_FIX_ACTIONS.filter(function(action) {
    if (action.id === 'normalizeAbc' && typeof parseAndRender !== 'function') return false;
    if (structureFixAvailable(action.id, tune, abcTools, issues)) return true;
    return !!previewStructureFix(action.id, tune, abcTools, parseAndRender);
  });
}

export function notesContentUnchanged(beforeAbc, afterAbc, abcTools) {
  if (!abcTools || typeof abcTools.justNotesNoMeta !== 'function') return true;
  const before = abcTools.justNotesNoMeta(String(beforeAbc || '').trim());
  const after = abcTools.justNotesNoMeta(String(afterAbc || '').trim());
  return before.replace(/\s+/g, '') === after.replace(/\s+/g, '');
}

export function isSafeNormalizePreview(preview, abcTools) {
  if (!preview) return false;
  return notesContentUnchanged(preview.before, preview.after, abcTools);
}
