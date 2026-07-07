import { findBeatIndex, getBeatDuration } from './recordingGrid';
import { pitchFromMidi } from './notationActions';

export function timedMelodyToOverlayEvents(timedMelody, tuneMeta) {
  if (!timedMelody || !Array.isArray(timedMelody.notes) || !timedMelody.notes.length) {
    return [];
  }
  const beatTimes = timedMelody.beatTimes || [];
  const tempo = timedMelody.tempo || tuneMeta.tempo || 120;

  return timedMelody.notes.map(function(note, index) {
    const startSec = Number(note.start) || 0;
    const endSec = Number(note.end) || startSec + 0.1;
    let startBeat;
    let durationBeats;
    if (beatTimes.length) {
      const beatIdx = findBeatIndex(beatTimes, startSec);
      const beatStart = Number(beatTimes[beatIdx]) || 0;
      const beatDur = getBeatDuration(beatTimes, beatIdx);
      startBeat = beatIdx + (beatDur > 0 ? (startSec - beatStart) / beatDur : 0);
      durationBeats = Math.max(0.125, secondsToBeatsApprox(endSec - startSec, beatTimes, beatIdx));
    } else {
      startBeat = startSec * tempo / 60;
      durationBeats = Math.max(0.125, (endSec - startSec) * tempo / 60);
    }
    const midi = typeof note.midi === 'number' ? note.midi : 60;
    const pitch = pitchFromMidi(midi, tuneMeta);
    return {
      id: 'tm-' + (note.id || index),
      type: 'note',
      source: 'timedMelody',
      pitch: pitch,
      pitches: [pitch],
      startBeat: startBeat,
      durationBeats: durationBeats,
      duration: { num: 1, den: 4, dotted: false },
      tieStart: false,
      tieEnd: false,
    };
  });
}

function secondsToBeatsApprox(seconds, beatTimes, beatIdx) {
  const beatDur = getBeatDuration(beatTimes, beatIdx);
  return beatDur > 0 ? seconds / beatDur : seconds;
}
