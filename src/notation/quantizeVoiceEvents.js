import { quantizeMelodyTime } from '../melodyRefilterUtils';
import { cloneVoiceEvent } from './voiceEventModel';
import { buildSyntheticBeatTimes, beatsToDuration, parseNoteLengthDecimal } from './beatGrid';
import { materializeAbsoluteTiming } from './timingEdit';

function resolveOverlaps(events) {
  const sorted = events.slice().sort(function(a, b) {
    return (a.startBeat || 0) - (b.startBeat || 0);
  });
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aEnd = (a.startBeat || 0) + (a.durationBeats || 0);
    if (aEnd > (b.startBeat || 0) + 0.0001) {
      b.startBeat = aEnd;
    }
  }
  return sorted;
}

export function quantizeVoiceEvents(events, options) {
  const opts = options || {};
  const strength = typeof opts.strength === 'number' ? opts.strength : 1;
  const slotsPerBeat = opts.slotsPerBeat || 4;
  const quantizeStart = opts.quantizeStart !== false;
  const quantizeDuration = opts.quantizeDuration !== false;
  const beatsPerBar = opts.beatsPerBar || 4;
  const beatTimes = opts.beatTimes && opts.beatTimes.length
    ? opts.beatTimes
    : buildSyntheticBeatTimes(beatsPerBar, opts.numBars || 32, opts.tempo || 120);
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
  return materializeAbsoluteTiming(resolved, {
    meter: opts.meter,
    noteLength: opts.noteLength,
    key: opts.key,
  });
}
