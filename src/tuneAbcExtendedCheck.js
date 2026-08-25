import abcjs from 'abcjs';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { formatTuneDisplayName } from './tuneDisplayName';
import { flattenMelodyText, splitMelodyIntoBlocks } from './lyricBarAlignmentUtils';
import { firstOccurrenceLyricSectionCount, lyricLinesHaveSongFormSections } from './lyricStructureUtils';
import { getLyricLines } from './wLinesUtils';
import { parseVoiceEvents } from './notation/voiceEventModel';
import { parseTempoBpm } from './tempoRange';

function issue(code, message, severity, extras) {
  return Object.assign({
    code: code,
    message: message,
    severity: severity || 'info',
    field: 'voices',
  }, extras || {});
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return [];
  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const voice = tune.voices[voiceKey];
  return voice && Array.isArray(voice.notes) ? voice.notes : [];
}

function checkTempoMismatch(tune, abcText, abcTools) {
  if (!abcTools || typeof abcTools.getMetaValueFromAbc !== 'function') return null;
  const fromAbc = String(abcTools.getMetaValueFromAbc('Q', abcText) || '').trim();
  const fromTune = tune.tempo != null ? String(tune.tempo).trim() : '';
  if (!fromAbc || !fromTune) return null;
  const abcNum = parseTempoBpm('Q:' + fromAbc);
  const tuneNum = parseTempoBpm('Q:' + fromTune) || parseInt(String(fromTune).replace(/[^0-9]/g, ''), 10);
  if (!abcNum || !tuneNum || abcNum === tuneNum) return null;
  return issue(
    'tempo_mismatch',
    'ABC tempo Q:' + fromAbc + ' differs from tune tempo (' + fromTune + ')',
    'info',
    { field: 'tempo' }
  );
}

function normalizeFractionText(value) {
  const parts = String(value || '').trim().split('/');
  if (parts.length !== 2) return String(value || '').trim();
  const num = parseInt(parts[0], 10);
  const den = parseInt(parts[1], 10);
  if (!num || !den) return String(value || '').trim();
  return String(num) + '/' + String(den);
}

function parseQBeatUnit(qText) {
  const match = String(qText || '').match(/(\d+\s*\/\s*\d+)\s*=/);
  return match ? normalizeFractionText(match[1]) : null;
}

function checkTempoBeatUnitMismatch(tune, abcText, abcTools) {
  if (!abcTools || typeof abcTools.getMetaValueFromAbc !== 'function') return null;
  const fromAbc = String(abcTools.getMetaValueFromAbc('Q', abcText) || '').trim();
  if (!fromAbc) return null;
  const beatUnit = parseQBeatUnit(fromAbc);
  if (!beatUnit) return null;
  const meterBeat = typeof abcTools.getBeatLength === 'function'
    ? normalizeFractionText(abcTools.getBeatLength(tune.meter || '4/4'))
    : null;
  if (!meterBeat || beatUnit === meterBeat) return null;
  const tuneBpm = parseTempoBpm('Q:' + String(tune.tempo || ''))
    || parseInt(String(tune.tempo || '').replace(/[^0-9]/g, ''), 10) || 0;
  const abcBpm = parseTempoBpm('Q:' + fromAbc);
  if (tuneBpm && abcBpm && tuneBpm !== abcBpm) return null;
  return issue(
    'tempo_beat_unit_mismatch',
    'ABC tempo Q:' + fromAbc + ' uses beat unit ' + beatUnit
      + ' but meter ' + (tune.meter || '4/4') + ' expects ' + meterBeat
      + ' — use tune tempo only',
    'info',
    { field: 'tempo' }
  );
}

function checkOrphanChordSymbols(tune) {
  const noteLines = getNoteLines(tune);
  if (!noteLines.length) return [];
  const meta = {
    meter: tune.meter || '4/4',
    noteLength: tune.noteLength || '1/8',
    key: tune.key || 'C',
  };
  const events = parseVoiceEvents(flattenMelodyText(noteLines), meta);
  const issues = [];
  events.forEach(function(ev, index) {
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const hasChord = ev.chordSymbol || (ev.chordSymbols && ev.chordSymbols.length);
    if (!hasChord) return;
    if (ev.type === 'rest' || (ev.type === 'note' && ev.rest)) {
      issues.push(issue(
        'orphan_chord_symbol',
        'Chord symbol on rest at event ' + (index + 1),
        'warning'
      ));
    }
  });
  return issues.slice(0, 3);
}

function checkTieAcrossBarline(tune) {
  const noteLines = getNoteLines(tune);
  if (!noteLines.length) return [];
  const meta = {
    meter: tune.meter || '4/4',
    noteLength: tune.noteLength || '1/8',
    key: tune.key || 'C',
  };
  const events = parseVoiceEvents(flattenMelodyText(noteLines), meta);
  const issues = [];
  for (let i = 0; i < events.length - 1; i += 1) {
    const ev = events[i];
    const next = events[i + 1];
    if (!ev || !next) continue;
    if (ev.tieEnd && next.type === 'barline') {
      issues.push(issue(
        'tie_across_barline',
        'Tie may span a barline incorrectly near event ' + (i + 1),
        'warning',
        { barIndex: ev.measureIndex != null ? ev.measureIndex + 1 : null }
      ));
      break;
    }
  }
  return issues;
}

function checkInconsistentNoteLength(tune, abcText) {
  const noteLines = getNoteLines(tune);
  if (!noteLines.length) return null;
  const flat = flattenMelodyText(noteLines);
  const durationCounts = {};
  const matches = flat.match(/[A-Ga-gzZ][^A-Ga-gzZ\s|:\[\]]*/g) || [];
  matches.forEach(function(token) {
    const durMatch = token.match(/(\d+\/?\d*|\/\d+)/);
    const dur = durMatch ? durMatch[1] : 'default';
    durationCounts[dur] = (durationCounts[dur] || 0) + 1;
  });
  const keys = Object.keys(durationCounts);
  if (keys.length <= 1) return null;
  const dominant = keys.reduce(function(best, key) {
    return durationCounts[key] > durationCounts[best] ? key : best;
  }, keys[0]);
  if (dominant === 'default') return null;
  // Longer-than-unit multipliers (2, 3, …) are normal melodic variety.
  // Only flag when writers mostly use subdivisions (/2, /4, …) that suggest
  // the L: header unit may be wrong.
  if (/^\d+$/.test(dominant)) return null;
  return issue(
    'inconsistent_note_length',
    'Mixed note durations; predominant value may differ from L: header',
    'info'
  );
}

function checkDuplicateVoiceContent(tune) {
  if (!tune || !tune.voices) return [];
  const keys = Object.keys(tune.voices);
  if (keys.length < 2) return [];
  const bodies = {};
  keys.forEach(function(key) {
    const notes = tune.voices[key] && Array.isArray(tune.voices[key].notes)
      ? tune.voices[key].notes
      : [];
    bodies[key] = flattenMelodyText(notes).replace(/\s+/g, '');
  });
  const issues = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i];
      const b = keys[j];
      if (bodies[a] && bodies[a] === bodies[b]) {
        issues.push(issue(
          'duplicate_voice_content',
          'Voices ' + a + ' and ' + b + ' have identical notation',
          'info'
        ));
      }
    }
  }
  return issues;
}

function checkMissingRepeatSecondTime(noteLines, tune) {
  const flat = flattenMelodyText(noteLines);
  if (!flat) return null;
  const strains = flat.split(/\|\||::|\|:/).filter(function(part) { return part.trim(); });
  if (strains.length < 3) return null;
  if (/\|:|:\||::/.test(flat)) return null;
  const lyricLines = getLyricLines(tune);
  const lyricOpts = { title: tune && tune.name, composer: tune && tune.composer };
  // Verse/chorus/bridge songs use || as section breaks. ABC repeats would play
  // a strain twice in a row and break V–C–V–B form.
  if (lyricLinesHaveSongFormSections(lyricLines, lyricOpts)) return null;
  const uniqueSections = firstOccurrenceLyricSectionCount(lyricLines, lyricOpts);
  const melodyBlocks = splitMelodyIntoBlocks(noteLines).length;
  if (uniqueSections >= 2 && uniqueSections === melodyBlocks) return null;
  return issue(
    'missing_repeat_second_time',
    'Multiple strains without repeat marks — second strain may need |: :|',
    'info'
  );
}

function checkStaleChordInMelody(tune) {
  const noteLines = getNoteLines(tune);
  if (!noteLines.length) return null;
  const flat = flattenMelodyText(noteLines);
  const key = String(tune.key || 'C').trim();
  if (!key || key === 'none') return null;
  const sharpKeys = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  const isSharp = sharpKeys.indexOf(key.replace(/m$/, '')) >= 0;
  const isFlat = flatKeys.indexOf(key.replace(/m$/, '')) >= 0;
  if (!isSharp && !isFlat) return null;
  const foreign = isSharp ? /\b[A-G]b[^a-z]/ : /\b[A-G]#/;
  if (!foreign.test(flat)) return null;
  return issue(
    'stale_chord_in_melody',
    'Chord symbols may be inconsistent with key ' + key,
    'info'
  );
}

export function checkTuneAbcExtended(tune, options) {
  const opts = options || {};
  const abcTools = opts.abcTools;
  if (!tune || !tune.id) return null;

  const noteLines = getNoteLines(tune);
  if (noteLines.length === 0) return null;

  const abcText = typeof opts.abcText === 'string'
    ? opts.abcText
    : (abcTools ? abcTools.json2abc(tune) : '');

  const issues = [];
  const tempoIssue = checkTempoMismatch(tune, abcText, abcTools);
  if (tempoIssue) {
    issues.push(tempoIssue);
  } else {
    const tempoBeatUnitIssue = checkTempoBeatUnitMismatch(tune, abcText, abcTools);
    if (tempoBeatUnitIssue) issues.push(tempoBeatUnitIssue);
  }

  issues.push.apply(issues, checkOrphanChordSymbols(tune));
  issues.push.apply(issues, checkTieAcrossBarline(tune));

  const noteLengthIssue = checkInconsistentNoteLength(tune, abcText);
  if (noteLengthIssue) issues.push(noteLengthIssue);

  issues.push.apply(issues, checkDuplicateVoiceContent(tune));

  const repeatIssue = checkMissingRepeatSecondTime(noteLines, tune);
  if (repeatIssue) issues.push(repeatIssue);

  const staleChord = checkStaleChordInMelody(tune);
  if (staleChord) issues.push(staleChord);

  if (issues.length === 0) return null;

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    composer: tune.composer || '',
    issues: issues,
  };
}

export function checkTunesAbcExtended(tunes, options) {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map(function(tune) { return checkTuneAbcExtended(tune, options); })
    .filter(Boolean);
}
