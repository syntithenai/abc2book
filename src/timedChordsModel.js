import { formatDiscoveredChords } from './chordDiscoveryFormatter';
import { buildVariableMeterBars, normalizeMeterChanges } from './timingGridUtils';

export const TIMED_CHORDS_VERSION = 1;

function normalizeSegment(segment) {
  if (!segment) return null;
  const start = Number(segment.start) || 0;
  const end = Number(segment.end) || start;
  const label = String(segment.label || '').trim();
  if (!label) return null;
  return { start: start, end: end, label: label };
}

export function normalizeTimedChords(input) {
  if (!input || typeof input !== 'object') return null;
  const segments = Array.isArray(input.segments)
    ? input.segments.map(normalizeSegment).filter(Boolean)
    : [];
  const beatTimes = Array.isArray(input.beatTimes)
    ? input.beatTimes.map(function(value) { return Number(value) || 0; })
    : [];

  return {
    version: TIMED_CHORDS_VERSION,
    source: input.source && typeof input.source === 'object' ? input.source : {},
    meter: input.meter ? String(input.meter) : '',
    noteLength: input.noteLength ? String(input.noteLength) : '',
    tempo: typeof input.tempo === 'number' ? input.tempo : 0,
    beatTimes: beatTimes,
    meterChanges: normalizeMeterChanges(input.meterChanges, input.meter, input.beatsPerBar),
    segments: segments,
    bars: Array.isArray(input.bars) ? input.bars : [],
    duration: typeof input.duration === 'number' ? input.duration : 0,
    backend: input.backend ? String(input.backend) : '',
  };
}

export function buildTimedChordsFromDetection(raw, tuneMeta, sourceInfo) {
  const segments = raw && Array.isArray(raw.segments) ? raw.segments : [];
  const beatTimes = raw && Array.isArray(raw.beatTimes) ? raw.beatTimes : [];
  const beatsPerBar = tuneMeta && tuneMeta.meter
    ? parseInt(String(tuneMeta.meter).split('/')[0], 10) || 4
    : 4;
  const model = normalizeTimedChords({
    version: TIMED_CHORDS_VERSION,
    source: sourceInfo || {},
    meter: tuneMeta && tuneMeta.meter ? tuneMeta.meter : '',
    noteLength: tuneMeta && tuneMeta.noteLength ? tuneMeta.noteLength : '',
    tempo: raw && typeof raw.tempo === 'number' ? raw.tempo : 0,
    beatTimes: beatTimes,
    meterChanges: raw && Array.isArray(raw.meterChanges) ? raw.meterChanges : [],
    beatsPerBar: beatsPerBar,
    segments: segments,
    bars: [],
    duration: raw && typeof raw.duration === 'number' ? raw.duration : 0,
    backend: raw && raw.backend ? raw.backend : '',
  });
  if (model) {
    model.bars = buildBarsFromBeatGrid(model, beatsPerBar);
  }
  return model;
}

export function buildBarsFromBeatGrid(timedChords, beatsPerBar) {
  const normalized = normalizeTimedChords(timedChords);
  if (!normalized || normalized.beatTimes.length === 0) return [];
  const bars = buildVariableMeterBars(
    normalized.beatTimes,
    normalized.meterChanges,
    beatsPerBar || 4
  );
  bars.forEach(function(bar) {
    bar.beats.forEach(function(beat) {
      beat.chord = chordAtTime(normalized, beat.start + Math.max(0.01, (beat.end - beat.start) / 2));
    });
  });

  return bars;
}

export function timedChordsToGrid(timedChords, options) {
  const normalized = normalizeTimedChords(timedChords);
  if (!normalized || normalized.segments.length === 0) return '';
  const opts = options || {};
  return formatDiscoveredChords({
    segments: normalized.segments,
    beatTimes: normalized.beatTimes,
    beatsPerBar: opts.beatsPerBar || 4,
    slotsPerBeat: opts.slotsPerBeat || 2,
    barsPerLine: opts.barsPerLine || 5,
    meterChanges: normalized.meterChanges,
  });
}

export function chordAtTime(timedChords, time) {
  const normalized = normalizeTimedChords(timedChords);
  if (!normalized) return '';
  const probe = Number(time) || 0;
  for (let i = 0; i < normalized.segments.length; i++) {
    const segment = normalized.segments[i];
    if (probe >= segment.start && probe < segment.end) {
      return segment.label;
    }
  }
  return '';
}
