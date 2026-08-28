import { audioFiltersAreNeutral } from './pitchTempoUtils';

const PREFIX = '% abcbook-json ';
const CHUNK_SIZE = 180;

/** Timed lyrics/chords are wizard-session only; never persist in ABC. */
export const TIMED_JSON_FIELDS = [];
export const PLAYBACK_JSON_FIELDS = ['playbackAudioFilters'];
/** Chord-editor stanza labels (override positional lyric assignment). */
/** bookPages: { [bookId]: { page, tuneIndex } } — per-book page order. */
export const EXTRA_JSON_FIELDS = ['chordSectionLabels', 'bookPages'];
export const LEGACY_TIMED_JSON_FIELDS = ['timedLyrics', 'timedChords', 'timedMelody'];

export function renderAbcbookJsonField(fieldName, value) {
  if (value === null || value === undefined) return [];
  const json = JSON.stringify(value);
  if (!json || json === 'null') return [];
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE));
  }
  return chunks.map(function(chunk, idx) {
    return PREFIX + fieldName + ' ' + (idx + 1) + '/' + chunks.length + ' ' + chunk;
  });
}

export function renderExtraAbcbookJsonFields(tune) {
  const lines = [];
  if (!tune) return lines;
  EXTRA_JSON_FIELDS.forEach(function(fieldName) {
    const value = tune[fieldName];
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return;
    lines.push.apply(lines, renderAbcbookJsonField(fieldName, value));
  });
  return lines;
}

export function renderTimedJsonFields(tune) {
  const lines = [];
  if (!tune) return lines;
  PLAYBACK_JSON_FIELDS.forEach(function(fieldName) {
    const value = tune[fieldName];
    if (!value) return;
    if (fieldName === 'playbackAudioFilters' && audioFiltersAreNeutral(value)) return;
    lines.push.apply(lines, renderAbcbookJsonField(fieldName, value));
  });
  lines.push.apply(lines, renderExtraAbcbookJsonFields(tune));
  return lines;
}

export function parseAbcbookJsonLine(line) {
  if (!line || !line.startsWith(PREFIX)) return null;
  const rest = line.slice(PREFIX.length);
  const firstSpace = rest.indexOf(' ');
  if (firstSpace < 0) return null;
  const fieldName = rest.slice(0, firstSpace);
  const chunkPart = rest.slice(firstSpace + 1);
  const match = chunkPart.match(/^(\d+)\/(\d+)\s+(.*)$/);
  if (!match) return null;
  return {
    fieldName: fieldName,
    index: parseInt(match[1], 10) - 1,
    total: parseInt(match[2], 10),
    data: match[3],
  };
}

export function applyAbcbookJsonChunks(chunksByField) {
  const result = {};
  Object.keys(chunksByField || {}).forEach(function(fieldName) {
    const parts = chunksByField[fieldName];
    if (!Array.isArray(parts) || parts.length === 0) return;
    const sorted = parts.slice().sort(function(a, b) {
      return a.index - b.index;
    });
    const json = sorted.map(function(part) { return part.data; }).join('');
    try {
      result[fieldName] = JSON.parse(json);
    } catch (e) {
      // Skip corrupt chunks.
    }
  });
  return result;
}

export function collectAbcbookJsonChunk(parsedChunk, chunksByField) {
  if (!parsedChunk) return chunksByField;
  const store = chunksByField || {};
  if (!store[parsedChunk.fieldName]) store[parsedChunk.fieldName] = [];
  store[parsedChunk.fieldName].push(parsedChunk);
  return store;
}
