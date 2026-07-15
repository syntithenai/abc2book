import { quantizeMelodyTime } from '../melodyRefilterUtils';
import { cloneVoiceEvent } from './voiceEventModel';
import { beatsToDuration, parseNoteLengthDecimal } from './beatGrid';

/** Beat-index grid in the same units as event.startBeat / durationBeats. */
export function buildBeatUnitGrid(beatsPerBar, numBars) {
  const bars = numBars > 0 ? numBars : 32;
  const bpb = beatsPerBar > 0 ? beatsPerBar : 4;
  const totalBeats = Math.ceil(bpb * bars) + 1;
  const times = [];
  for (let i = 0; i < totalBeats; i += 1) times.push(i);
  return times;
}

function resolveOverlaps(events) {
  const sorted = events.slice().sort(function(a, b) {
    return (a.startBeat || 0) - (b.startBeat || 0);
  });
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.type === 'barline' || a.type === 'lineBreak') continue;
    if (b.type === 'barline' || b.type === 'lineBreak') continue;
    const aEnd = (a.startBeat || 0) + (a.durationBeats || 0);
    if (aEnd > (b.startBeat || 0) + 0.0001) {
      b.startBeat = aEnd;
    }
  }
  return sorted;
}

function eventsTimingEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
    if (Math.abs((a[i].startBeat || 0) - (b[i].startBeat || 0)) > 1e-6) return false;
    if (Math.abs((a[i].durationBeats || 0) - (b[i].durationBeats || 0)) > 1e-6) return false;
  }
  return true;
}

/**
 * Snap voice-event start/duration in beat space (not seconds).
 * Does not re-layout the timeline (avoids inserting leading rests that would
 * reset subset selections back to beat 0).
 */
export function quantizeVoiceEvents(events, options) {
  const opts = options || {};
  const strength = typeof opts.strength === 'number' ? opts.strength : 1;
  const slotsPerBeat = opts.slotsPerBeat || 4;
  const quantizeStart = opts.quantizeStart !== false;
  const quantizeDuration = opts.quantizeDuration !== false;
  const beatsPerBar = opts.beatsPerBar || 4;
  const beatTimes = opts.beatTimes && opts.beatTimes.length
    ? opts.beatTimes
    : buildBeatUnitGrid(beatsPerBar, opts.numBars || 32);
  const unit = parseNoteLengthDecimal(opts.noteLength, opts.meter);
  const next = events.map(cloneVoiceEvent);
  next.forEach(function(ev) {
    if (ev.type === 'barline' || ev.type === 'lineBreak') return;
    if (quantizeStart && typeof ev.startBeat === 'number') {
      ev.startBeat = quantizeMelodyTime(ev.startBeat, beatTimes, strength, slotsPerBeat);
    }
    if (quantizeDuration && typeof ev.durationBeats === 'number') {
      const q = quantizeMelodyTime(ev.durationBeats, beatTimes, strength, slotsPerBeat);
      ev.durationBeats = Math.max(unit * 4, q);
      ev.duration = beatsToDuration(ev.durationBeats, unit);
    }
  });
  const resolved = resolveOverlaps(next);
  resolved.unchanged = eventsTimingEqual(events, resolved);
  return resolved;
}
