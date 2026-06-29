import { normalizeTimedLyrics } from './timedLyricsModel';
import { normalizeTimedChords } from './timedChordsModel';

export const MINIMAL_TIMED_LYRICS_VERSION = 1;
export const MINIMAL_TIMED_CHORDS_VERSION = 1;

export function exportMinimalTimedLyrics(timedLyrics) {
  const normalized = normalizeTimedLyrics(timedLyrics);
  if (!normalized || normalized.lines.length === 0) return null;
  return {
    v: MINIMAL_TIMED_LYRICS_VERSION,
    lines: normalized.lines.map(function(line) {
      const entry = {
        t: line.text,
        s: line.start,
        e: line.end,
      };
      if (line.sectionId) entry.sectionId = line.sectionId;
      return entry;
    }),
    sections: (normalized.sections || []).map(function(section) {
      return {
        id: section.id,
        startLine: section.startLine,
        endLine: section.endLine,
        label: section.label || '',
        type: section.type || 'verse',
      };
    }),
  };
}

export function exportMinimalTimedChords(timedChords) {
  const normalized = normalizeTimedChords(timedChords);
  if (!normalized) return null;
  if (normalized.segments.length === 0 && normalized.beatTimes.length === 0) return null;
  const result = {
    v: MINIMAL_TIMED_CHORDS_VERSION,
    beatTimes: normalized.beatTimes,
    segments: normalized.segments.map(function(segment) {
      return {
        s: segment.start,
        e: segment.end,
        label: segment.label,
      };
    }),
  };
  if (normalized.meter) result.meter = normalized.meter;
  if (normalized.meterChanges && normalized.meterChanges.length > 0) {
    result.meterChanges = normalized.meterChanges;
  }
  return result;
}

export function importMinimalTimedLyrics(minimal) {
  if (!minimal || typeof minimal !== 'object') return null;
  const lines = Array.isArray(minimal.lines) ? minimal.lines.map(function(line, index) {
    return {
      id: 'line-' + index,
      sectionId: line.sectionId || null,
      text: String(line.t || line.text || '').trim(),
      start: Number(line.s != null ? line.s : line.start) || 0,
      end: Number(line.e != null ? line.e : line.end) || 0,
      words: [],
    };
  }).filter(function(line) { return line.text.length > 0; }) : [];
  return normalizeTimedLyrics({
    version: 1,
    source: {},
    lines: lines,
    sections: Array.isArray(minimal.sections) ? minimal.sections : [],
  });
}

export function importMinimalTimedChords(minimal) {
  if (!minimal || typeof minimal !== 'object') return null;
  return normalizeTimedChords({
    version: 1,
    source: {},
    meter: minimal.meter || '',
    beatTimes: Array.isArray(minimal.beatTimes) ? minimal.beatTimes : [],
    meterChanges: Array.isArray(minimal.meterChanges) ? minimal.meterChanges : [],
    segments: Array.isArray(minimal.segments) ? minimal.segments.map(function(segment) {
      return {
        start: Number(segment.s != null ? segment.s : segment.start) || 0,
        end: Number(segment.e != null ? segment.e : segment.end) || 0,
        label: String(segment.label || '').trim(),
      };
    }) : [],
  });
}

export function applyMinimalTimedFieldsToTune(tune, sections) {
  if (!tune) return tune;
  if (tune.timedLyrics) {
    const exported = exportMinimalTimedLyrics(
      Object.assign({}, tune.timedLyrics, { sections: sections || tune.timedLyrics.sections })
    );
    tune.timedLyrics = exported ? importMinimalTimedLyrics(exported) : null;
  }
  if (tune.timedChords) {
    const exported = exportMinimalTimedChords(tune.timedChords);
    tune.timedChords = exported ? importMinimalTimedChords(exported) : null;
  }
  delete tune.timedMelody;
  delete tune.words;
  delete tune.timingScaffold;
  return tune;
}
