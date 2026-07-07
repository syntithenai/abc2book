import { quantizeMelodyTime } from '../melodyRefilterUtils';
import { cloneVoiceEvent } from './voiceEventModel';
import { materializeAbsoluteTiming, setGlobalBeatOffset, slideEventsInRange } from './timingEdit';
import { findBeatIndex, getBeatDuration } from './recordingGrid';
import { pitchToMidi } from './voiceEventModel';

export function alignSelectionToRecordingGrid(events, eventIds, beatTimes, opts) {
  const options = opts || {};
  const strength = typeof options.strength === 'number' ? options.strength : 1;
  const slotsPerBeat = options.slotsPerBeat || 4;
  const idSet = {};
  (eventIds || []).forEach(function(id) { idSet[id] = true; });
  const target = (eventIds && eventIds.length)
    ? events.filter(function(ev) { return idSet[ev.id]; })
    : events.filter(function(ev) { return ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest'; });

  const next = events.map(cloneVoiceEvent);
  target.forEach(function(src) {
    const ev = next.find(function(x) { return x.id === src.id; });
    if (!ev) return;
    if (options.quantizeStart !== false && typeof ev.startBeat === 'number') {
      ev.startBeat = quantizeMelodyTime(ev.startBeat, beatTimes, strength, slotsPerBeat);
    }
    if (options.quantizeDuration && typeof ev.durationBeats === 'number') {
      const q = quantizeMelodyTime(ev.durationBeats, beatTimes, strength, slotsPerBeat);
      ev.durationBeats = Math.max(0.125, q);
    }
  });

  return materializeAbsoluteTiming(next, {
    meter: options.meter,
    noteLength: options.noteLength,
    key: options.key,
  });
}

export function matchToTimedMelody(events, eventIds, timedMelody, tuneMeta, opts) {
  const options = opts || {};
  const tolerance = typeof options.toleranceBeats === 'number' ? options.toleranceBeats : 0.5;
  if (!timedMelody || !timedMelody.notes || !timedMelody.notes.length) return events;

  const beatTimes = timedMelody.beatTimes || [];
  const idSet = {};
  (eventIds || []).forEach(function(id) { idSet[id] = true; });
  const next = events.map(cloneVoiceEvent);

  next.forEach(function(ev) {
    if (eventIds && eventIds.length && !idSet[ev.id]) return;
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const midi = pitchToMidi(ev.pitch || (ev.pitches && ev.pitches[0]));
    if (midi == null) return;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    timedMelody.notes.forEach(function(note) {
      if (typeof note.midi !== 'number') return;
      const midiDist = Math.abs(note.midi - midi);
      if (midiDist > 1) return;
      const startSec = Number(note.start) || 0;
      let noteBeat;
      if (beatTimes.length) {
        const idx = findBeatIndex(beatTimes, startSec);
        const beatStart = Number(beatTimes[idx]) || 0;
        const beatDur = getBeatDuration(beatTimes, idx);
        noteBeat = idx + (beatDur > 0 ? (startSec - beatStart) / beatDur : 0);
      } else {
        const tempo = timedMelody.tempo || tuneMeta.tempo || 120;
        noteBeat = startSec * tempo / 60;
      }
      const dist = Math.abs((ev.startBeat || 0) - noteBeat);
      if (dist < bestDist) {
        bestDist = dist;
        best = noteBeat;
      }
    });

    if (best != null && bestDist <= tolerance) {
      ev.startBeat = best;
    }
  });

  return materializeAbsoluteTiming(next, tuneMeta);
}

export function applyDownbeatOffset(events, tuneMeta, offsetBeats) {
  return setGlobalBeatOffset(events, offsetBeats, tuneMeta);
}

export function snapToPlaybackRegionStart(events, eventIds, regionStartBeat, tuneMeta) {
  const idSet = {};
  (eventIds || []).forEach(function(id) { idSet[id] = true; });
  const selected = events.filter(function(ev) {
    return (!eventIds || !eventIds.length || idSet[ev.id]) && (ev.type === 'note' || ev.type === 'chord');
  });
  if (!selected.length) return events;
  const minStart = Math.min.apply(null, selected.map(function(ev) { return ev.startBeat || 0; }));
  const delta = regionStartBeat - minStart;
  if (Math.abs(delta) < 0.001) return events;
  const maxBeat = Math.max.apply(null, selected.map(function(ev) {
    return (ev.startBeat || 0) + (ev.durationBeats || 0);
  }));
  return slideEventsInRange(events, minStart, maxBeat, delta, tuneMeta);
}

export function slideSelection(events, startBeat, endBeat, deltaBeat, tuneMeta) {
  return slideEventsInRange(events, startBeat, endBeat, deltaBeat, tuneMeta);
}
