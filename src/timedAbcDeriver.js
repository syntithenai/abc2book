import { timedLyricsToPlainText, normalizeTimedLyrics } from './timedLyricsModel';
import { chordAtTime, normalizeTimedChords } from './timedChordsModel';
import { noteTimelineFromMelody, normalizeTimedMelody } from './timedMelodyModel';
import { formatDiscoveredChords } from './chordDiscoveryFormatter';
import { buildVariableMeterBars, prefixMeterChange } from './timingGridUtils';
import { getBarModel } from './barModel';

export function deriveWordHeaders(timedLyrics) {
  return timedLyricsToPlainText(timedLyrics)
    .split('\n')
    .filter(function(line) { return line.trim().length > 0; })
    .map(function(line) { return 'W: ' + line; });
}

export function alignChordsToLyricLines(timedLyrics, timedChords) {
  const lyrics = timedLyrics && Array.isArray(timedLyrics.lines) ? timedLyrics.lines : [];
  if (lyrics.length === 0) return [];

  return lyrics.map(function(line) {
    const probe = Number(line.start) || 0;
    const chord = chordAtTime(timedChords, probe);
    return {
      text: line.text,
      chord: chord,
      start: line.start,
      end: line.end,
    };
  });
}

function findNearestNoteIndex(notes, time) {
  if (!Array.isArray(notes) || notes.length === 0) return -1;
  let bestIndex = 0;
  let bestDistance = Infinity;
  notes.forEach(function(note, index) {
    const mid = (Number(note.start) + Number(note.end)) / 2;
    const distance = Math.abs(mid - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function deriveWLines(timedLyrics, timedMelody) {
  const lyrics = normalizeTimedLyrics(timedLyrics);
  const melody = normalizeTimedMelody(timedMelody);
  if (!lyrics || !melody || melody.notes.length === 0) return [];

  const timeline = noteTimelineFromMelody(melody);
  let noteCursor = 0;

  return lyrics.lines.map(function(line) {
    const tokens = (line.words || []).map(function(word) {
      const mid = (Number(word.start) + Number(word.end)) / 2;
      const nearest = findNearestNoteIndex(timeline, mid);
      if (nearest < 0) return word.text;
      const prefix = nearest > noteCursor ? ' '.repeat(Math.max(0, nearest - noteCursor)) : '';
      noteCursor = nearest + 1;
      return (prefix ? prefix : '') + word.text;
    });
    return 'w: ' + tokens.join(' ').replace(/\s+/g, ' ').trim();
  });
}

export function deriveRhythmicScaffold(timedChords, timedLyrics, options) {
  const chords = normalizeTimedChords(timedChords);
  const opts = options || {};
  const meter = (opts.meter)
    || (chords && chords.meter)
    || '4/4';
  const noteLength = opts.noteLength || '1/8';
  const model = getBarModel(meter, noteLength);
  const beatsPerBar = opts.beatsPerBar || model.beatCount;
  const slotsPerBeat = opts.slotsPerBeat || model.beatUnitSlots;
  const beatTimes = chords && chords.beatTimes.length > 0
    ? chords.beatTimes
    : (opts.beatTimes || []);

  return deriveBeatGridScaffold(beatTimes, {
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    meterChanges: chords && chords.meterChanges ? chords.meterChanges : opts.meterChanges,
  });
}

function deriveBeatGridScaffold(beatTimes, options) {
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) return '';
  const safeBeatsPerBar = Math.max(1, parseInt(options && options.beatsPerBar, 10) || 4);
  const safeSlotsPerBeat = Math.max(1, parseInt(options && options.slotsPerBeat, 10) || 2);
  const bars = buildVariableMeterBars(
    beatTimes,
    options && options.meterChanges,
    safeBeatsPerBar
  );

  let previousMeter = null;
  return bars.map(function(bar, index) {
    const slots = new Array(bar.beatsPerBar * safeSlotsPerBeat).fill('z');
    const suffix = ((index + 1) % 4 === 0) ? ' |\n' : ' | ';
    const text = prefixMeterChange(slots.join(' '), bar, previousMeter) + suffix;
    previousMeter = bar.meter;
    return text;
  }).join('').trim();
}

export function deriveChordSymbols(timedChords, options) {
  const chords = normalizeTimedChords(timedChords);
  if (!chords) return '';
  return formatDiscoveredChords({
    segments: chords.segments,
    beatTimes: chords.beatTimes,
    beatsPerBar: (options && options.beatsPerBar) || 4,
    slotsPerBeat: (options && options.slotsPerBeat) || 2,
    barsPerLine: (options && options.barsPerLine) || 5,
    meterChanges: chords.meterChanges,
    includeMeterChanges: !(options && options.includeMeterChanges === false),
  });
}

export function getDerivationGridOptions(tune, tunebook) {
  const meter = tune && tune.meter ? tune.meter : '4/4';
  const noteLength = tune && tune.noteLength ? tune.noteLength : '1/8';
  const model = tunebook && tunebook.abcTools && typeof tunebook.abcTools.getBarModel === 'function'
    ? tunebook.abcTools.getBarModel(meter, noteLength)
    : getBarModel(meter, noteLength);
  return {
    beatsPerBar: model.beatCount,
    slotsPerBeat: model.beatUnitSlots,
    noteLength: model.noteLength,
    meter: model.meter,
    meterChanges: tune && tune.timedChords && tune.timedChords.meterChanges
      ? tune.timedChords.meterChanges
      : [],
  };
}

export function applyWLinesToTune(tune, timedLyrics, timedMelody) {
  if (!tune) return [];
  const lines = deriveWLines(timedLyrics || tune.timedLyrics, timedMelody || tune.timedMelody);
  tune.wLines = lines.map(function(line) {
    return line.replace(/^w:\s*/, '').trim();
  }).filter(Boolean);
  return tune.wLines;
}

export function applyRhythmicScaffoldToAbc(tune, tunebook, abcjsParser, abcString) {
  const options = getDerivationGridOptions(tune, tunebook);
  const scaffold = deriveRhythmicScaffold(tune.timedChords, tune.timedLyrics, options);
  if (!scaffold) return abcString;
  const chordGrid = deriveChordSymbols(
    tune.timedChords,
    Object.assign({}, options, { includeMeterChanges: false })
  );
  let merged = abcjsParser.mergeMelody(scaffold, abcString || tunebook.abcTools.json2abc(tune));
  if (chordGrid) {
    merged = abcjsParser.mergeChords(chordGrid, merged);
  }
  return merged;
}
