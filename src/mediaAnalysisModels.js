import { buildTimedLyricsFromTranscription } from './timedLyricsModel';
import { buildTimedChordsFromDetection } from './timedChordsModel';
import { buildTimedMelodyFromDetection } from './timedMelodyModel';

export function buildTimedModelsFromAnalysis(raw, tune, source) {
  const tuneMeta = tune ? {
    meter: tune.meter,
    noteLength: tune.noteLength,
    key: tune.key,
    tempo: tune.tempo,
  } : {};
  const sourceInfo = source ? {
    id: source.id || '',
    label: source.label || '',
    kind: source.kind || '',
    src: source.src || '',
  } : {};

  const timing = raw && raw.timing ? raw.timing : null;
  const lyricsRaw = raw && raw.lyrics ? raw.lyrics : {};
  const chordsRaw = raw && raw.chords ? raw.chords : {};
  const melodyRaw = raw && raw.melody ? raw.melody : {};

  const sharedBeatTimes = timing && Array.isArray(timing.beatTimes) && timing.beatTimes.length > 0
    ? timing.beatTimes
    : (chordsRaw.beatTimes || []);

  const chordsWithTiming = Object.assign({}, chordsRaw, {
    beatTimes: sharedBeatTimes,
    tempo: timing && timing.tempo ? timing.tempo : chordsRaw.tempo,
    meterChanges: timing && Array.isArray(timing.meterChanges) ? timing.meterChanges : [],
  });

  return {
    timedLyrics: lyricsRaw.text || (lyricsRaw.segments && lyricsRaw.segments.length > 0)
      ? buildTimedLyricsFromTranscription(lyricsRaw, sourceInfo)
      : null,
    timedChords: chordsRaw.segments && chordsRaw.segments.length > 0
      ? buildTimedChordsFromDetection(chordsWithTiming, tuneMeta, sourceInfo)
      : null,
    timedMelody: melodyRaw.notes && melodyRaw.notes.length > 0
      ? buildTimedMelodyFromDetection(melodyRaw, tuneMeta, sourceInfo, timing)
      : null,
  };
}
