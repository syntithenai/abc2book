import { formatMelodyNotes } from './melodyFormatter';
import { normalizeMeterChanges } from './timingGridUtils';

export const TIMED_MELODY_VERSION = 1;

function normalizeNote(note, index) {
  if (!note) return null;
  const start = Number(note.start) || 0;
  const end = Number(note.end) || start;
  const midi = Number(note.midi);
  if (!Number.isFinite(midi)) return null;
  return {
    id: note.id || ('note-' + index),
    start: start,
    end: end,
    midi: midi,
    name: note.name ? String(note.name) : '',
    confidence: typeof note.confidence === 'number' ? note.confidence : null,
    label: note.label ? String(note.label) : '',
  };
}

export function normalizeTimedMelody(input) {
  if (!input || typeof input !== 'object') return null;
  const notes = Array.isArray(input.notes)
    ? input.notes.map(normalizeNote).filter(Boolean)
    : [];

  return {
    version: TIMED_MELODY_VERSION,
    source: input.source && typeof input.source === 'object' ? input.source : {},
    key: input.key ? String(input.key) : '',
    meter: input.meter ? String(input.meter) : '',
    noteLength: input.noteLength ? String(input.noteLength) : '',
    tempo: typeof input.tempo === 'number' ? input.tempo : 0,
    detectedKey: input.detectedKey ? String(input.detectedKey) : '',
    detectedMeter: input.detectedMeter ? String(input.detectedMeter) : '',
    processing: input.processing && typeof input.processing === 'object' ? input.processing : {},
    notes: notes,
    silences: Array.isArray(input.silences) ? input.silences : [],
    noise: Array.isArray(input.noise) ? input.noise : [],
    beatTimes: Array.isArray(input.beatTimes)
      ? input.beatTimes.map(function(value) { return Number(value) || 0; })
      : [],
    downbeatTimes: Array.isArray(input.downbeatTimes)
      ? input.downbeatTimes.map(function(value) { return Number(value) || 0; })
      : [],
    beatsPerBar: parseInt(input.beatsPerBar, 10) || 0,
    meterChanges: normalizeMeterChanges(input.meterChanges, input.meter, input.beatsPerBar),
    duration: typeof input.duration === 'number' ? input.duration : 0,
    backend: input.backend ? String(input.backend) : '',
    separated: !!input.separated,
    melodySource: input.melodySource ? String(input.melodySource) : '',
  };
}

export function buildTimedMelodyFromDetection(raw, tuneMeta, sourceInfo, timing) {
  const beatTimes = timing && Array.isArray(timing.beatTimes) && timing.beatTimes.length > 0
    ? timing.beatTimes
    : (raw && Array.isArray(raw.beatTimes) ? raw.beatTimes : []);
  const downbeatTimes = timing && Array.isArray(timing.downbeatTimes) ? timing.downbeatTimes : [];
  const beatsPerBar = timing && timing.beatsPerBar
    ? parseInt(timing.beatsPerBar, 10)
    : 0;

  return normalizeTimedMelody({
    version: TIMED_MELODY_VERSION,
    source: sourceInfo || {},
    key: tuneMeta && tuneMeta.key ? tuneMeta.key : '',
    meter: tuneMeta && tuneMeta.meter ? tuneMeta.meter : (timing && timing.meter ? timing.meter : ''),
    noteLength: tuneMeta && tuneMeta.noteLength ? tuneMeta.noteLength : '',
    tempo: timing && typeof timing.tempo === 'number'
      ? timing.tempo
      : (raw && typeof raw.tempo === 'number' ? raw.tempo : 0),
    detectedKey: (raw && raw.detectedKey) || (timing && timing.detectedKey) || '',
    detectedMeter: (raw && raw.detectedMeter) || (timing && timing.detectedMeter) || '',
    processing: raw && raw.processing ? raw.processing : {},
    notes: raw && Array.isArray(raw.notes) ? raw.notes : [],
    silences: raw && Array.isArray(raw.silences) ? raw.silences : [],
    noise: raw && Array.isArray(raw.noise) ? raw.noise : [],
    beatTimes: beatTimes,
    downbeatTimes: downbeatTimes,
    beatsPerBar: beatsPerBar || (raw && raw.beatsPerBar) || 0,
    meterChanges: timing && Array.isArray(timing.meterChanges)
      ? timing.meterChanges
      : (raw && Array.isArray(raw.meterChanges) ? raw.meterChanges : []),
    duration: raw && typeof raw.duration === 'number' ? raw.duration : 0,
    backend: raw && raw.backend ? raw.backend : '',
    separated: !!(raw && raw.separated),
    melodySource: raw && raw.melodySource ? String(raw.melodySource) : '',
  });
}

export function timedMelodyToAbc(timedMelody, options) {
  const normalized = normalizeTimedMelody(timedMelody);
  if (!normalized || normalized.notes.length === 0) return '';
  const opts = options || {};
  return formatMelodyNotes({
    notes: normalized.notes,
    beatTimes: normalized.beatTimes,
    beatsPerBar: opts.beatsPerBar || normalized.beatsPerBar || 4,
    slotsPerBeat: opts.slotsPerBeat || 2,
    meterChanges: normalized.meterChanges,
    noteLength: opts.noteLength || normalized.noteLength,
    key: opts.key || normalized.key || normalized.detectedKey || '',
    snapToScale: !!opts.snapToScale,
  });
}

export function noteTimelineFromMelody(timedMelody) {
  const normalized = normalizeTimedMelody(timedMelody);
  if (!normalized) return [];
  return normalized.notes.map(function(note) {
    return {
      start: note.start,
      end: note.end,
      midi: note.midi,
      midpoint: (note.start + note.end) / 2,
    };
  });
}
