import abcjs from 'abcjs';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import {
  convertSessionLineBreaks,
  needsSessionLineBreakFix,
} from './abcImportNormalize';
import { splitIntoBlocks } from './chordSheetUtils';
import { normalizeChordChartRepeatMarks } from './chordSheetUtils';
import { classifyBar } from './chordBlockMerge';
import {
  extractBarsFromMelodyText,
  flattenMelodyText,
} from './lyricBarAlignmentUtils';
import { ensureBarlinesAtMusicLineJoins, melodyHasAnacrusisDoubleBarlines, normalizeMelodyBarlines, abcForAbcjs } from './melodyBarlineNormalize';
import { fixTuneAbcHeaders, normalizeTuneAbc } from './tuneAbcCorrectnessCheck';
import { getLyricLines } from './wLinesUtils';
import { applyNoteSpacingToTune } from './noteSpacingUtils';
import { parseTempoBpm } from './tempoRange';
import { countVoiceBars, maxVoiceBarCount } from './scratchpadNotationMerge';
import { parseVoiceEvents, beatsToDuration } from './notation/voiceEventModel';
import { serializeVoiceEvents } from './notation/abcVoiceSerializer';
import { parseNoteLengthDecimal, beatsPerBarFromMeter } from './notation/beatGrid';
import { quantizeVoiceEvents } from './notation/quantizeVoiceEvents';
import {
  canConvertSectionPickupsToVoltas,
  convertSectionPickupsToVoltasFlat,
} from './sectionPickupVolta';
import { analyzeVoiceBarDurations } from './tuneAbcStructureCheck';
import {
  canFixStrainRepeatEnds,
  collapseEmptyRepeatBarsOnLines,
  fixStrainRepeatEndsOnLines,
  hasEmptyBarsBetweenRepeatMarks,
  hasOpenRepeatBeforeDoubleBar,
} from './repeatStrainFix';

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

const MELODY_BARLINE_RE = /(\|\]|\[\||\|\||::|:\||\|:|\|)/;

function withPrimaryVoiceNotes(tune, nextNotes) {
  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], { notes: nextNotes });
  return next;
}

function mapMelodyNoteLineBars(line, callback) {
  const tokens = String(line || '').split(MELODY_BARLINE_RE);
  const out = [];
  let changed = false;

  function pushPart(part) {
    if (part.content != null) out.push(part.content);
    if (part.barline) out.push(part.barline);
  }

  for (let i = 0; i < tokens.length; i += 2) {
    const content = tokens[i] != null ? tokens[i] : '';
    const barline = tokens[i + 1];
    const hasBarline = barline != null && barline !== '';
    const isPrefix = i === 0 && !String(content).trim() && hasBarline;
    const isTrailingEmpty = !hasBarline && !String(content).trim();
    const part = {
      content: content,
      barline: hasBarline ? barline : '',
      skip: isPrefix || isTrailingEmpty,
    };
    const result = callback(part);
    const results = Array.isArray(result) ? result : [result || part];
    if (results.length !== 1
      || results[0].content !== part.content
      || results[0].barline !== part.barline) {
      changed = true;
    }
    results.forEach(pushPart);
  }
  return { line: out.join(''), changed: changed };
}

function mapMelodyNoteLinesBars(noteLines, callback) {
  let changed = false;
  const next = (noteLines || []).map(function(line) {
    const mapped = mapMelodyNoteLineBars(line, callback);
    if (mapped.changed) changed = true;
    return mapped.line;
  });
  return changed ? next : null;
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
  const needsAbcFix = needsSessionLineBreakFix(abcText);
  const needsNoteFix = needsSessionLineBreakFix(noteFlat);
  if (!needsAbcFix && !needsNoteFix) return null;

  let next = Object.assign({}, tune);

  if (needsAbcFix) {
    const converted = convertSessionLineBreaks(abcText);
    const json = abcTools.abc2json(converted);
    json.id = tune.id;
    next = Object.assign({}, tune, json);
  } else {
    const voiceKey = resolvePrimaryVoiceKey(tune.voices);
    const convertedLines = noteLines.map(function(line) {
      return convertSessionLineBreaks(String(line || ''));
    });
    next.voices = Object.assign({}, tune.voices);
    next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
      notes: convertedLines,
    });
  }

  const afterNoteLines = getNoteLines(next);
  const afterFlat = flattenMelodyText(afterNoteLines);
  if (needsSessionLineBreakFix(afterFlat)) {
    const voiceKey = resolvePrimaryVoiceKey(next.voices);
    const convertedLines = afterNoteLines.map(function(line) {
      return convertSessionLineBreaks(String(line || ''));
    });
    next.voices = Object.assign({}, next.voices);
    next.voices[voiceKey] = Object.assign({}, next.voices[voiceKey], {
      notes: convertedLines,
    });
  }

  const afterAbc = abcTools.json2abc(next);
  if (needsSessionLineBreakFix(afterAbc)) {
    const converted = convertSessionLineBreaks(afterAbc);
    const json = abcTools.abc2json(converted);
    json.id = tune.id;
    next = Object.assign({}, next, json);
  }

  return next;
}

export function canFixSessionLineBreaks(tune, abcTools) {
  if (!tune || !abcTools) return false;
  const abcText = abcTools.json2abc(tune);
  const noteFlat = flattenMelodyText(getNoteLines(tune));
  return needsSessionLineBreakFix(abcText) || needsSessionLineBreakFix(noteFlat);
}

export function canNormalizeMelodyRepeatMarks(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return false;
  const normalized = normalizeMelodyRepeatMarks(noteLines);
  return normalized.some(function(line, index) {
    return line !== noteLines[index];
  });
}

const HEADER_FIELD_MAP = { M: 'meter', K: 'key', L: 'noteLength', Q: 'tempo' };

export function syncTuneFieldsFromAbc(tune, abcTools) {
  if (!tune || !abcTools || typeof abcTools.getMetaValueFromAbc !== 'function') return null;
  const abcText = abcTools.json2abc(tune);
  const next = Object.assign({}, tune);
  let changed = false;

  Object.keys(HEADER_FIELD_MAP).forEach(function(header) {
    const fromAbc = String(abcTools.getMetaValueFromAbc(header, abcText) || '').trim();
    if (!fromAbc) return;
    const field = HEADER_FIELD_MAP[header];
    const current = String(next[field] || '').trim();
    if (!current && fromAbc) {
      next[field] = fromAbc;
      changed = true;
    }
  });

  return changed ? next : null;
}

/** Prefer ABC header values when tune fields conflict. */
export function resolveHeaderConflictFromAbc(tune, abcTools) {
  if (!tune || !abcTools || typeof abcTools.getMetaValueFromAbc !== 'function') return null;
  const abcText = abcTools.json2abc(tune);
  const next = Object.assign({}, tune);
  let changed = false;

  Object.keys(HEADER_FIELD_MAP).forEach(function(header) {
    const fromAbc = String(abcTools.getMetaValueFromAbc(header, abcText) || '').trim();
    if (!fromAbc) return;
    const field = HEADER_FIELD_MAP[header];
    const current = String(next[field] || '').trim();
    if (current && current !== fromAbc) {
      next[field] = fromAbc;
      changed = true;
    }
  });

  return changed ? next : null;
}

/** Keep tune tempo; re-export ABC so Q: uses meter beat unit (drops conflicting Q beat unit). */
export function applyTuneTempoOnlyInTune(tune, abcTools) {
  if (!tune || !abcTools) return null;
  const abcText = abcTools.json2abc(tune);
  const fromAbc = String(abcTools.getMetaValueFromAbc('Q', abcText) || '').trim();
  if (!fromAbc) return null;
  const tuneBpm = typeof abcTools.cleanTempo === 'function'
    ? parseInt(String(abcTools.cleanTempo(tune.tempo) || ''), 10) || 0
    : parseTempoBpm('Q:' + String(tune.tempo || ''));
  const abcBpm = parseTempoBpm('Q:' + fromAbc);
  const bpm = tuneBpm > 0 ? tuneBpm : abcBpm;
  if (bpm <= 0) return null;

  const next = Object.assign({}, tune, { tempo: bpm });
  const newAbcText = abcTools.json2abc(next);
  const newQ = String(abcTools.getMetaValueFromAbc('Q', newAbcText) || '').trim();
  const tempoNeedsNormalize = String(tune.tempo || '').trim() !== String(bpm);
  if (fromAbc === newQ && !tempoNeedsNormalize) return null;

  const json = abcTools.abc2json(newAbcText);
  json.id = tune.id;
  return Object.assign({}, next, json, { tempo: bpm });
}

/** Prefer tune field values over ABC headers (updates tune object for json2abc round-trip). */
export function resolveHeaderConflictFromTune(tune, abcTools) {
  if (!tune || !abcTools || typeof abcTools.getMetaValueFromAbc !== 'function') return null;
  const abcText = abcTools.json2abc(tune);
  const next = Object.assign({}, tune);
  let changed = false;

  Object.keys(HEADER_FIELD_MAP).forEach(function(header) {
    const field = HEADER_FIELD_MAP[header];
    const fromTune = String(next[field] || '').trim();
    if (!fromTune) return;
    const fromAbc = String(abcTools.getMetaValueFromAbc(header, abcText) || '').trim();
    if (fromAbc && fromAbc !== fromTune) {
      next[field] = fromTune;
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
  let globalBar = 0;
  const nextLines = mapMelodyNoteLinesBars(noteLines, function(part) {
    if (part.skip || !String(part.content).trim()) return part;
    globalBar += 1;
    if (globalBar % barsPerStanza === 0 && globalBar < bars.length && part.barline === '|') {
      return { content: part.content, barline: '||' };
    }
    return part;
  });
  if (!nextLines) return null;
  return withPrimaryVoiceNotes(tune, nextLines);
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

/** End-repeat, zero or more empty bars, then start-repeat (e.g. :| |:, :| | |:). */
export { hasEmptyBarsBetweenRepeatMarks, hasOpenRepeatBeforeDoubleBar } from './repeatStrainFix';

export function collapseEmptyBarsBetweenRepeatMarks(flat) {
  let next = String(flat || '');
  if (!hasEmptyBarsBetweenRepeatMarks(next)) return next;
  next = next.replace(/:\|(?:\s*\|)*\s*\|:/g, '::');
  next = next.replace(/\|\|(?:\s*\|)+\s*\|:/g, '|| |:');
  return next;
}

function normalizeAdjacentRepeatMarks(flat) {
  return String(flat || '')
    .replace(/:\|\s*:\|/g, '::')
    .replace(/\|\s+:/g, '|:')
    .replace(/:\s+\|/g, ':|');
}

export function previewCollapseEmptyRepeatMarks(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const flat = flattenMelodyText(noteLines);
  let next = collapseEmptyBarsBetweenRepeatMarks(flat);
  const normalized = normalizeMelodyRepeatMarks([next]);
  next = normalized[0] || next;
  next = normalizeAdjacentRepeatMarks(next);
  if (next === flat) return null;
  return next;
}

export function canCollapseEmptyRepeatBars(tune) {
  return previewCollapseEmptyRepeatMarks(tune) != null;
}

export function collapseEmptyRepeatBarsInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const nextLines = collapseEmptyRepeatBarsOnLines(noteLines);
  if (!nextLines) return null;

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: nextLines,
  });
  return next;
}

export function fixStrainRepeatEndsInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const nextLines = fixStrainRepeatEndsOnLines(noteLines);
  if (!nextLines) return null;

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: nextLines,
  });
  return next;
}

export function canFixStrainRepeatEndsInTune(tune) {
  return canFixStrainRepeatEnds(getNoteLines(tune));
}

/** One-click: collapse empty repeat bars, insert :| before strain ||, normalize repeat spacing. */
export function standardizeBarsAndRepeatsInTune(tune) {
  return fixStrainRepeatEndsInTune(tune);
}

export function canStandardizeBarsAndRepeats(tune) {
  return canFixStrainRepeatEndsInTune(tune);
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

export function closeOpenRepeatInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const flat = flattenMelodyText(noteLines);
  const trimmed = flat.replace(/\s+/g, '');
  if (!/\|:\s*$/.test(trimmed) || /:\|\s*$/.test(trimmed)) return null;

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const lines = noteLines.slice();
  const lastIndex = lines.length - 1;
  lines[lastIndex] = String(lines[lastIndex] || '').trim() + ' :|';
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], { notes: lines });
  return next;
}

function tuneMetaForFix(tune) {
  return {
    meter: tune.meter || '4/4',
    noteLength: tune.noteLength || '1/8',
    key: tune.key || 'C',
  };
}

function voiceBodyWithLineBreaks(noteLines) {
  return ensureBarlinesAtMusicLineJoins(noteLines).join('\n');
}

function eventSpanBars(events, beatsPerBar) {
  let maxBeat = 0;
  (events || []).forEach(function(ev) {
    const end = (ev.startBeat || 0) + (ev.durationBeats || 0);
    if (end > maxBeat) maxBeat = end;
  });
  const bpb = beatsPerBar > 0 ? beatsPerBar : 4;
  return Math.max(1, Math.ceil(maxBeat / bpb) + 1);
}

export function padBarWithRestsInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const meta = tuneMetaForFix(tune);
  const unit = parseNoteLengthDecimal(meta.noteLength, meta.meter);
  const beatsPerBar = beatsPerBarFromMeter(meta.meter);
  const events = parseVoiceEvents(voiceBodyWithLineBreaks(noteLines), meta);
  let barBeats = 0;
  let changed = false;
  const nextEvents = [];

  events.forEach(function(ev) {
    if (ev.type === 'barline') {
      if (barBeats > 0.001 && barBeats < beatsPerBar - 0.05) {
        const missing = beatsPerBar - barBeats;
        nextEvents.push({
          id: 'rest-pad',
          type: 'rest',
          duration: beatsToDuration(missing, unit),
          tieStart: false,
          tieEnd: false,
        });
        changed = true;
      }
      barBeats = 0;
      nextEvents.push(ev);
      return;
    }
    if (ev.durationBeats) barBeats += ev.durationBeats;
    nextEvents.push(ev);
  });

  if (!changed) return null;
  const body = serializeVoiceEvents(nextEvents, meta);
  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: body.split('\n'),
  });
  return next;
}

function isRemovableEmptyBarSegment(segment) {
  const text = String(segment || '');
  if (!text.trim() && text.length > 0) return true;
  if (!text.trim() && text.length === 0) return false;
  return classifyBar(text) === 'empty';
}

export function removeEmptyBarsFromFlatMelody(flat) {
  const source = String(flat || '');
  const parts = source.split('|');
  if (parts.length <= 1) return source;

  let out = parts[0];
  let afterDoubleBar = false;
  for (let i = 1; i < parts.length; i++) {
    const segment = String(parts[i]);
    const isLast = i === parts.length - 1;

    if (!isLast) {
      if (isRemovableEmptyBarSegment(segment)) {
        afterDoubleBar = false;
        continue;
      }
      if (!segment.trim() && segment.length === 0) {
        if (!out.endsWith('|')) out += '|';
        out += '|';
        afterDoubleBar = true;
        continue;
      }
      if (afterDoubleBar) {
        out += segment;
        afterDoubleBar = false;
      } else {
        out += '|' + segment;
      }
      continue;
    }

    if (!segment) {
      if (source.trimEnd().endsWith('|') && !out.endsWith('|')) out += '|';
      continue;
    }
    if (afterDoubleBar) {
      out += segment;
    } else {
      out += '|' + segment;
    }
  }

  return out.replace(/:\|:/g, '::');
}

export function removeEmptyBarsInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const originalFlat = flattenMelodyText(noteLines);
  let body = originalFlat;
  const needsRepeatFix = hasEmptyBarsBetweenRepeatMarks(body) || hasOpenRepeatBeforeDoubleBar(body);
  if (needsRepeatFix) {
    return fixStrainRepeatEndsInTune(tune);
  }

  let nextNotes;
  const joinedBody = noteLines.join('\n');
  const nextBody = removeEmptyBarsFromFlatMelody(joinedBody);
  if (nextBody === joinedBody) return null;
  nextNotes = nextBody.split(/\r?\n/);

  if (flattenMelodyText(nextNotes) === originalFlat
    && nextNotes.join('\n') === noteLines.join('\n')) {
    return null;
  }

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: nextNotes,
  });
  return next;
}

function restBarLine(tune) {
  const meta = tuneMetaForFix(tune);
  const beats = beatsPerBarFromMeter(meta.meter);
  const unit = parseNoteLengthDecimal(meta.noteLength, meta.meter);
  return serializeVoiceEvents([{
    id: 'rest-bar',
    type: 'rest',
    duration: beatsToDuration(beats, unit),
    tieStart: false,
    tieEnd: false,
  }, {
    id: 'bar-rest',
    type: 'barline',
    barToken: '|',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
  }], meta).trim();
}

export function padVoicesToMatchInTune(tune) {
  if (!tune || !tune.voices) return null;
  const keys = Object.keys(tune.voices);
  if (keys.length <= 1) return null;
  const byKey = {};
  let maxBars = 0;
  keys.forEach(function(key) {
    const notes = tune.voices[key] && Array.isArray(tune.voices[key].notes)
      ? tune.voices[key].notes
      : [];
    byKey[key] = notes;
    maxBars = Math.max(maxBars, countVoiceBars(notes, tune));
  });
  if (maxBars <= 0) return null;

  let changed = false;
  const next = Object.assign({}, tune);
  next.voices = Object.assign({}, tune.voices);
  const restBar = restBarLine(tune);

  keys.forEach(function(key) {
    const notes = byKey[key];
    const bars = countVoiceBars(notes, tune);
    if (bars >= maxBars) return;
    changed = true;
    const padded = notes.slice();
    while (countVoiceBars(padded, tune) < maxBars) {
      const lastIdx = padded.length - 1;
      padded[lastIdx] = (String(padded[lastIdx] || '').trim() + ' ' + restBar).trim();
    }
    next.voices[key] = Object.assign({}, tune.voices[key], { notes: padded });
  });

  return changed ? next : null;
}

export function wrapEndingInRepeatInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const body = voiceBodyWithLineBreaks(noteLines);
  const endingIndex = body.search(/\[[0-9]+\]|\[[0-9]+(?=\s)/);
  if (endingIndex < 0) return null;

  const before = body.slice(0, endingIndex).replace(/[ \t]+$/, '');
  if (/\|:\s*$/.test(before) || /::\s*$/.test(before)) return null;

  const after = body.slice(endingIndex).replace(/^[ \t]+/, '');
  const glue = /\n$/.test(before) ? '|: ' : ' |: ';
  let nextBody = before + glue + after;
  if (!/:\|\s*$/.test(nextBody.replace(/\s+/g, ' ').trim())) {
    nextBody = nextBody.replace(/\|?\s*$/, '') + ' :|';
  }
  if (nextBody === body) return null;
  return withPrimaryVoiceNotes(tune, nextBody.split(/\r?\n/));
}

export function removeEmptyVoiceInTune(tune) {
  if (!tune || !tune.voices) return null;
  const keys = Object.keys(tune.voices);
  if (keys.length <= 1) return null;
  const primary = resolvePrimaryVoiceKey(tune.voices);
  const next = Object.assign({}, tune);
  next.voices = Object.assign({}, tune.voices);
  let changed = false;

  keys.forEach(function(key) {
    if (key === primary) return;
    const voice = tune.voices[key];
    const notes = voice && Array.isArray(voice.notes) ? voice.notes : [];
    const hasContent = notes.some(function(line) { return String(line || '').trim().length > 0; });
    if (!hasContent) {
      delete next.voices[key];
      changed = true;
    }
  });

  return changed ? next : null;
}

function scaffoldRestForBar(tune) {
  const meta = tuneMetaForFix(tune);
  const beats = beatsPerBarFromMeter(meta.meter);
  const unit = parseNoteLengthDecimal(meta.noteLength, meta.meter);
  return serializeVoiceEvents([{
    id: 'scaffold-rest',
    type: 'rest',
    duration: beatsToDuration(beats, unit),
    tieStart: false,
    tieEnd: false,
  }], meta).trim();
}

function replaceClassifiedBarsInTune(tune, kindSet) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const restText = scaffoldRestForBar(tune);
  const nextLines = mapMelodyNoteLinesBars(noteLines, function(part) {
    if (part.skip) return part;
    const kind = classifyBar(part.content);
    if (!kindSet[kind]) return part;
    return { content: ' ' + restText + ' ', barline: part.barline || '|' };
  });
  if (!nextLines) return null;
  return withPrimaryVoiceNotes(tune, nextLines);
}

export function convertScaffoldToRestsInTune(tune) {
  return replaceClassifiedBarsInTune(tune, { chord_scaffold: true });
}

export function collapseAnacrusisDoubleBarlinesInTune(tune) {
  if (!tune || !tune.voices) return null;
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  const noteLines = voice && Array.isArray(voice.notes) ? voice.notes : [];
  if (noteLines.length === 0) return null;
  if (!melodyHasAnacrusisDoubleBarlines(noteLines)) return null;

  const normalized = noteLines.map(function(line) {
    return normalizeMelodyBarlines(String(line || ''));
  });
  const next = Object.assign({}, tune);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, voice, { notes: normalized });
  return next;
}

export function canCollapseAnacrusisDoubleBarlines(tune) {
  return melodyHasAnacrusisDoubleBarlines(getNoteLines(tune));
}

export function convertSectionPickupsToVoltasInTune(tune, abcTools) {
  if (!tune || !abcTools) return null;
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;

  const abcText = abcForAbcjs(abcTools.json2abc(tune));
  let parsedTune = null;
  try {
    parsedTune = abcjs.parseOnly(abcText)[0];
  } catch (e) {
    return null;
  }
  if (!parsedTune) return null;

  const durationIssues = analyzeVoiceBarDurations(parsedTune);
  if (!canConvertSectionPickupsToVoltas(noteLines, durationIssues, parsedTune)) return null;

  const flat = flattenMelodyText(noteLines);
  const nextFlat = convertSectionPickupsToVoltasFlat(noteLines);
  if (!nextFlat || nextFlat === flat) return null;

  try {
    const probeAbc = abcTools.emptyABC('Probe') + '\n' + nextFlat;
    abcjs.parseOnly(abcForAbcjs(probeAbc));
  } catch (e) {
    return null;
  }

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  const nextNotes = nextFlat.indexOf('\n') >= 0 ? nextFlat.split('\n') : [nextFlat];
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], { notes: nextNotes });
  return next;
}

export function declarePickupLengthInTune(tune, abcTools, parseAndRender) {
  if (!tune || !abcTools) return null;
  if (typeof parseAndRender === 'function') {
    const normalized = normalizeTuneAbc(tune, abcTools, parseAndRender);
    if (normalized) return normalized;
  }
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const flat = flattenMelodyText(noteLines);
  if (/^\s*\|/.test(flat)) return null;
  return null;
}

export function removeOrphanRepeatEndInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const body = voiceBodyWithLineBreaks(noteLines);
  // Do not strip when voltas are present — :|2 / |1 are not orphans.
  if (/\|[0-9]|:\|[0-9]|\[[0-9]/.test(body)) return null;
  const idx = body.indexOf(':|');
  if (idx < 0) return null;
  const before = body.slice(0, idx);
  if (/\|:/.test(before)) return null;
  // Music before :| is an implied open repeat — leave it alone.
  if (/[A-Ga-gzZ]/.test(before)) return null;

  const nextBody = before.replace(/[ \t]+$/, '') + body.slice(idx + 2).replace(/^[ \t]+/, '');
  if (!nextBody.trim() || nextBody === body) return null;
  return withPrimaryVoiceNotes(tune, nextBody.split(/\r?\n/));
}

export function closeRepeatAtEndInTune(tune) {
  const closed = closeOpenRepeatInTune(tune);
  return closed;
}

function endingBarCounts(flat) {
  const counts = {};
  let current = null;
  const parts = String(flat || '').split('|');
  parts.forEach(function(segment) {
    const endingMatch = segment.match(/\[([0-9]+)\]/);
    if (endingMatch) {
      current = '[' + endingMatch[1] + ']';
      if (!counts[current]) counts[current] = 0;
      return;
    }
    if (current && segment.trim()) {
      counts[current] += 1;
    }
  });
  return counts;
}

export function balanceEndingsInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const body = voiceBodyWithLineBreaks(noteLines);
  const counts = endingBarCounts(body);
  const keys = Object.keys(counts);
  if (keys.length < 2) return null;

  const maxBars = Math.max.apply(null, keys.map(function(key) { return counts[key]; }));
  const minBars = Math.min.apply(null, keys.map(function(key) { return counts[key]; }));
  if (maxBars === minBars) return null;

  const restText = scaffoldRestForBar(tune);
  let nextBody = body;
  keys.forEach(function(key) {
    const deficit = maxBars - counts[key];
    if (deficit <= 0) return;
    const marker = key.replace(/[\[\]]/g, '\\$&');
    const re = new RegExp('(' + marker + '[^|]*)(\\s*\\|)', '');
    let pads = '';
    for (let i = 0; i < deficit; i += 1) pads += ' ' + restText + ' |';
    nextBody = nextBody.replace(re, '$1' + pads + '$2');
  });

  if (nextBody === body) return null;
  return withPrimaryVoiceNotes(tune, nextBody.split(/\r?\n/));
}

export function quantizeOverfullBarsInTune(tune) {
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const meta = tuneMetaForFix(tune);
  const beatsPerBar = beatsPerBarFromMeter(meta.meter);
  const events = parseVoiceEvents(voiceBodyWithLineBreaks(noteLines), meta);
  const quantized = quantizeVoiceEvents(events, {
    meter: meta.meter,
    noteLength: meta.noteLength,
    beatsPerBar: beatsPerBar,
    numBars: eventSpanBars(events, beatsPerBar),
    strength: 1,
    slotsPerBeat: 4,
  });
  if (quantized.unchanged) return null;
  const body = serializeVoiceEvents(quantized, meta);
  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey], {
    notes: body.split('\n'),
  });
  return next;
}

export function fillSparseBarsInTune(tune) {
  return replaceClassifiedBarsInTune(tune, { empty: true, chord_scaffold: true });
}

export function rebuildWLinesInTune(tune) {
  if (!tune) return null;
  const wLines = applyNoteSpacingToTune(tune);
  const current = Array.isArray(tune.wLines) ? tune.wLines : [];
  const same = current.length === wLines.length && current.every(function(line, index) {
    return String(line || '') === String(wLines[index] || '');
  });
  if (same) return null;
  const next = Object.assign({}, tune);
  next.wLines = wLines;
  return next;
}

export function relayoutNoteLinesInTune(tune, abcTools) {
  if (!tune || !abcTools || typeof abcTools.fixNotes !== 'function') return null;
  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;
  const barMap = maxVoiceBarCount({ '1': noteLines }, tune);
  const barsPerLine = Math.max(1, Math.round(barMap / Math.max(1, noteLines.length)));
  const candidate = [4, 6, 8].reduce(function(best, value) {
    return Math.abs(value - barsPerLine) < Math.abs(best - barsPerLine) ? value : best;
  }, 4);

  const next = Object.assign({}, tune);
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  const notes = Array.isArray(voice.notes) ? voice.notes : [];
  const abcInput = 'X:8\nK:' + (tune.key || 'C') + '\n' + notes.join('\n');
  const relaid = abcTools.fixNotes(abcInput, candidate);
  const newNotes = relaid.split('\n').filter(function(line) {
    return !/^[A-Z]:/.test(String(line || '').trim());
  });
  if (newNotes.join('\n') === notes.join('\n')) return null;
  next.voices = Object.assign({}, tune.voices);
  next.voices[voiceKey] = Object.assign({}, voice, { notes: newNotes.length ? newNotes : notes });
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
  } else if (action === 'resolveHeaderConflict') {
    next = resolveHeaderConflictFromAbc(tune, abcTools);
  } else if (action === 'resolveHeaderConflictFromTune') {
    next = resolveHeaderConflictFromTune(tune, abcTools);
  } else if (action === 'stanzaDoubleBarlines') {
    next = fixStanzaDoubleBarlinesInTune(tune, abcTools);
  } else if (action === 'normalizeRepeatMarks') {
    next = normalizeMelodyRepeatMarksInTune(tune);
  } else if (action === 'collapseEmptyRepeatBars') {
    next = collapseEmptyRepeatBarsInTune(tune);
  } else if (action === 'fixStrainRepeatEnds' || action === 'standardizeBarsAndRepeats') {
    next = fixStrainRepeatEndsInTune(tune);
  } else if (action === 'applyTuneTempoOnly') {
    next = applyTuneTempoOnlyInTune(tune, abcTools);
  } else if (action === 'normalizeAbc' && typeof parseAndRender === 'function') {
    next = normalizeTuneAbc(tune, abcTools, parseAndRender);
  } else if (action === 'appendFinalBarline') {
    next = appendFinalBarlineInTune(tune, abcTools);
  } else if (action === 'closeOpenRepeat') {
    next = closeOpenRepeatInTune(tune);
  } else if (action === 'padBarWithRests') {
    next = padBarWithRestsInTune(tune);
  } else if (action === 'removeEmptyBars') {
    next = removeEmptyBarsInTune(tune);
  } else if (action === 'padVoicesToMatch') {
    next = padVoicesToMatchInTune(tune);
  } else if (action === 'rebuildWLines') {
    next = rebuildWLinesInTune(tune);
  } else if (action === 'relayoutNoteLines') {
    next = relayoutNoteLinesInTune(tune, abcTools);
  } else if (action === 'wrapEndingInRepeat') {
    next = wrapEndingInRepeatInTune(tune);
  } else if (action === 'removeEmptyVoice') {
    next = removeEmptyVoiceInTune(tune);
  } else if (action === 'collapseAnacrusisDoubleBarlines') {
    next = collapseAnacrusisDoubleBarlinesInTune(tune);
  } else if (action === 'declarePickupLength') {
    next = declarePickupLengthInTune(tune, abcTools, parseAndRender);
  } else if (action === 'convertScaffoldToRests') {
    next = convertScaffoldToRestsInTune(tune);
  } else if (action === 'quantizeOverfullBars') {
    next = quantizeOverfullBarsInTune(tune);
  } else if (action === 'balanceEndings') {
    next = balanceEndingsInTune(tune);
  } else if (action === 'closeRepeatAtEnd') {
    next = closeRepeatAtEndInTune(tune);
  } else if (action === 'removeOrphanRepeatEnd') {
    next = removeOrphanRepeatEndInTune(tune);
  } else if (action === 'fillSparseBars') {
    next = fillSparseBarsInTune(tune);
  } else if (action === 'convertSectionPickupsToVoltas') {
    next = convertSectionPickupsToVoltasInTune(tune, abcTools);
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
  if (action === 'resolveHeaderConflict' || action === 'resolveHeaderConflictFromTune') {
    return codes.indexOf('header_field_mismatch') >= 0;
  }
  if (action === 'stanzaDoubleBarlines') {
    return codes.indexOf('stanza_strain_mismatch') >= 0
      || codes.indexOf('stanza_barlines') >= 0;
  }
  if (action === 'normalizeRepeatMarks') {
    return codes.indexOf('repeat_style_mixed') >= 0;
  }
  if (action === 'collapseEmptyRepeatBars') {
    return codes.indexOf('empty_bar') >= 0
      || codes.indexOf('repeat_style_mixed') >= 0
      || canCollapseEmptyRepeatBars(tune);
  }
  if (action === 'fixStrainRepeatEnds' || action === 'standardizeBarsAndRepeats') {
    return codes.indexOf('strain_missing_repeat_end') >= 0
      || codes.indexOf('unmatched_repeat_start') >= 0
      || codes.indexOf('empty_bar') >= 0
      || codes.indexOf('repeat_style_mixed') >= 0
      || canFixStrainRepeatEndsInTune(tune);
  }
  if (action === 'applyTuneTempoOnly') {
    return codes.indexOf('tempo_beat_unit_mismatch') >= 0
      || codes.indexOf('tempo_mismatch') >= 0;
  }
  if (action === 'collapseAnacrusisDoubleBarlines') {
    return codes.indexOf('anacrusis_double_barline') >= 0
      || canCollapseAnacrusisDoubleBarlines(tune);
  }
  if (action === 'normalizeAbc') {
    return codes.indexOf('round_trip_drift') >= 0;
  }
  if (action === 'appendFinalBarline') {
    return codes.indexOf('missing_final_barline') >= 0;
  }
  if (action === 'closeOpenRepeat') {
    return codes.indexOf('truncated_repeat') >= 0;
  }
  if (action === 'padBarWithRests') {
    return codes.indexOf('underfull_bar') >= 0;
  }
  if (action === 'removeEmptyBars') {
    return codes.indexOf('empty_bar') >= 0;
  }
  if (action === 'padVoicesToMatch') {
    return codes.indexOf('voice_bar_count_mismatch') >= 0;
  }
  if (action === 'rebuildWLines') {
    return codes.some(function(code) {
      return code === 'wline_count_mismatch' || code === 'lyric_note_misalignment'
        || code === 'stale_wlines' || code === 'interleaved_w_spacing';
    });
  }
  if (action === 'relayoutNoteLines') {
    return codes.indexOf('visual_line_break_mid_bar') >= 0
      || codes.indexOf('wline_count_mismatch') >= 0;
  }
  if (action === 'wrapEndingInRepeat') {
    return codes.indexOf('ending_without_repeat') >= 0;
  }
  if (action === 'removeEmptyVoice') {
    return codes.indexOf('secondary_voice_empty') >= 0;
  }
  if (action === 'declarePickupLength') {
    return codes.indexOf('anacrusis_inconsistent') >= 0;
  }
  if (action === 'convertScaffoldToRests') {
    return codes.indexOf('chord_scaffold_in_melody') >= 0;
  }
  if (action === 'quantizeOverfullBars') {
    return codes.indexOf('overfull_bar') >= 0;
  }
  if (action === 'balanceEndings') {
    return codes.indexOf('ending_bar_mismatch') >= 0;
  }
  if (action === 'closeRepeatAtEnd') {
    return codes.indexOf('unmatched_repeat_start') >= 0
      || codes.indexOf('truncated_repeat') >= 0;
  }
  if (action === 'removeOrphanRepeatEnd') {
    if (codes.indexOf('unmatched_repeat_end') < 0) return false;
    const noteLines = getNoteLines(tune);
    const flat = flattenMelodyText(noteLines);
    // Volta short forms and section endings — do not strip "orphan" :|.
    if (/\|[0-9]|:\|[0-9]|\[[0-9]/.test(flat)) return false;
    return true;
  }
  if (action === 'fillSparseBars') {
    return codes.indexOf('sparse_melody') >= 0;
  }
  if (action === 'convertSectionPickupsToVoltas') {
    if (codes.indexOf('section_pickup_should_be_ending') < 0) return false;
    const noteLines = getNoteLines(tune);
    if (!abcTools || noteLines.length === 0) return false;
    let parsedTune = null;
    try {
      parsedTune = abcjs.parseOnly(abcForAbcjs(abcTools.json2abc(tune)))[0];
    } catch (e) {
      return false;
    }
    if (!parsedTune) return false;
    return canConvertSectionPickupsToVoltas(noteLines, analyzeVoiceBarDurations(parsedTune), parsedTune);
  }
  return false;
}

export const STRUCTURE_FIX_ACTIONS = [
  { id: 'fixHeaders', label: 'Fix missing headers', tier: 'a' },
  { id: 'sessionLineBreaks', label: 'Fix Session ! line breaks', tier: 'a' },
  { id: 'syncHeadersFromAbc', label: 'Sync fields from ABC headers', tier: 'a' },
  { id: 'resolveHeaderConflict', label: 'Use ABC header values', tier: 'b', requiresPreview: true },
  { id: 'resolveHeaderConflictFromTune', label: 'Use tune field values', tier: 'b', requiresPreview: true },
  { id: 'stanzaDoubleBarlines', label: 'Insert stanza double bar lines', tier: 'a' },
  { id: 'normalizeRepeatMarks', label: 'Normalize repeat mark spacing', tier: 'a' },
  { id: 'fixStrainRepeatEnds', label: 'Fix strain repeat ends', tier: 'a' },
  { id: 'applyTuneTempoOnly', label: 'Use tune tempo (fix Q: beat unit)', tier: 'a' },
  { id: 'closeOpenRepeat', label: 'Close open repeat', tier: 'a' },
  { id: 'closeRepeatAtEnd', label: 'Close repeat at tune end', tier: 'a' },
  { id: 'removeOrphanRepeatEnd', label: 'Remove orphan repeat end', tier: 'a' },
  { id: 'wrapEndingInRepeat', label: 'Wrap ending in repeat marks', tier: 'b', requiresPreview: true },
  { id: 'padBarWithRests', label: 'Pad underfull bars with rests', tier: 'a' },
  { id: 'removeEmptyBars', label: 'Remove empty bars', tier: 'a' },
  { id: 'padVoicesToMatch', label: 'Pad voices to match bar count', tier: 'a' },
  { id: 'removeEmptyVoice', label: 'Remove empty voice', tier: 'b', requiresPreview: true },
  { id: 'collapseAnacrusisDoubleBarlines', label: 'Use single barline after pickup', tier: 'a' },
  { id: 'declarePickupLength', label: 'Fix pickup/anacrusis parsing', tier: 'b', requiresPreview: true },
  { id: 'convertScaffoldToRests', label: 'Convert chord scaffolds to rests', tier: 'a' },
  { id: 'quantizeOverfullBars', label: 'Quantize overfull bars', tier: 'b', requiresPreview: true },
  { id: 'balanceEndings', label: 'Balance first/second endings', tier: 'b', requiresPreview: true },
  { id: 'convertSectionPickupsToVoltas', label: 'Use 1st/2nd endings for section pickups', tier: 'b', requiresPreview: true },
  { id: 'fillSparseBars', label: 'Fill sparse bars with rests', tier: 'b', requiresPreview: true },
  { id: 'rebuildWLines', label: 'Rebuild w: lyrics from melody', tier: 'a' },
  { id: 'relayoutNoteLines', label: 'Relayout notation lines', tier: 'b', requiresPreview: true },
  { id: 'normalizeAbc', label: 'Normalize notation (preview)', tier: 'b', requiresPreview: true },
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
