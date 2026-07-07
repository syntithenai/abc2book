import {
  assignTimingToEvents,
  parseNoteLengthDecimal,
  durationToBeats,
  beatsToDuration,
} from './beatGrid';
import { cloneVoiceEvent, createEventId } from './voiceEventModel';
import { midiToAbcPitch } from '../melodyPitchSpelling';

const TIMING_EPSILON = 0.001;

function minDurationBeats(unit) {
  return Math.max(0.125, unit * 4 / 64);
}

function isTimedEvent(ev) {
  return ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest';
}

function isLayoutEvent(ev) {
  return ev.type === 'barline' || ev.type === 'lineBreak';
}

function makeRest(beats, unit) {
  return {
    id: createEventId('rest'),
    type: 'rest',
    pitch: null,
    pitches: null,
    duration: beatsToDuration(beats, unit),
    tieStart: false,
    tieEnd: false,
  };
}

function setEventDurationBeats(ev, beats, unit) {
  const dur = Math.max(minDurationBeats(unit), beats);
  ev.duration = beatsToDuration(dur, unit);
  ev.durationBeats = dur;
  return ev;
}

function stripStartPositions(events) {
  return events.map(function(ev) {
    const copy = cloneVoiceEvent(ev);
    delete copy.startBeat;
    delete copy.measureIndex;
    return copy;
  });
}

function withTiming(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  return assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
}

function findEventIndex(events, eventId) {
  return events.findIndex(function(ev) { return ev.id === eventId; });
}

export function insertRestGap(events, beforeIndex, beats, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const gap = Math.max(minDurationBeats(unit), beats);
  if (gap < TIMING_EPSILON) return events.map(cloneVoiceEvent);

  const next = events.map(cloneVoiceEvent);
  const idx = Math.max(0, Math.min(beforeIndex, next.length));

  if (idx > 0 && next[idx - 1].type === 'rest') {
    const rest = next[idx - 1];
    const current = durationToBeats(rest.duration, unit);
    setEventDurationBeats(rest, current + gap, unit);
    return next;
  }

  next.splice(idx, 0, makeRest(gap, unit));
  return next;
}

export function shrinkPrefixByBeats(events, beforeIndex, beats, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  let remaining = Math.max(0, beats);
  if (remaining < TIMING_EPSILON) return events.map(cloneVoiceEvent);

  const next = events.map(cloneVoiceEvent);
  let idx = Math.min(beforeIndex, next.length) - 1;

  while (remaining > TIMING_EPSILON && idx >= 0) {
    const ev = next[idx];
    if (isLayoutEvent(ev)) {
      idx -= 1;
      continue;
    }
    const current = durationToBeats(ev.duration, unit);
    if (current <= remaining + TIMING_EPSILON) {
      remaining -= current;
      next.splice(idx, 1);
      idx -= 1;
      continue;
    }
    setEventDurationBeats(ev, current - remaining, unit);
    remaining = 0;
    break;
  }

  return next;
}

export function collapseAdjacentRests(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const next = [];
  events.forEach(function(ev) {
    const copy = cloneVoiceEvent(ev);
    if (copy.type === 'rest' && next.length > 0 && next[next.length - 1].type === 'rest') {
      const prev = next[next.length - 1];
      const combined = durationToBeats(prev.duration, unit) + durationToBeats(copy.duration, unit);
      setEventDurationBeats(prev, combined, unit);
      return;
    }
    next.push(copy);
  });
  return next;
}

export function materializeAbsoluteTiming(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const cloned = events.map(cloneVoiceEvent);

  cloned.forEach(function(ev) {
    if (isTimedEvent(ev)) {
      if (ev.durationBeats == null) {
        ev.durationBeats = durationToBeats(ev.duration, unit);
      }
    }
  });

  const needsAssign = cloned.some(function(ev) {
    return isTimedEvent(ev) && typeof ev.startBeat !== 'number';
  });
  const timed = needsAssign
    ? assignTimingToEvents(cloned, tuneMeta.meter, unit)
    : cloned;

  const layout = [];
  const musical = [];
  timed.forEach(function(ev, index) {
    if (isLayoutEvent(ev)) {
      layout.push({ ev: cloneVoiceEvent(ev), atBeat: ev.startBeat || 0, index: index });
    } else if (isTimedEvent(ev)) {
      musical.push(cloneVoiceEvent(ev));
    }
  });

  musical.sort(function(a, b) {
    const sa = a.startBeat || 0;
    const sb = b.startBeat || 0;
    if (Math.abs(sa - sb) > TIMING_EPSILON) return sa - sb;
    return 0;
  });

  for (let i = 0; i < musical.length - 1; i += 1) {
    const a = musical[i];
    const b = musical[i + 1];
    const aEnd = (a.startBeat || 0) + (a.durationBeats || durationToBeats(a.duration, unit));
    if (aEnd > (b.startBeat || 0) + TIMING_EPSILON) {
      b.startBeat = aEnd;
    }
  }

  const result = [];
  let cursor = 0;
  let layoutIdx = 0;
  const placedLayout = new Set();

  function flushLayoutUpTo(beat) {
    while (layoutIdx < layout.length) {
      const item = layout[layoutIdx];
      if (item.atBeat > beat + TIMING_EPSILON) break;
      if (!placedLayout.has(item.ev.id)) {
        result.push(item.ev);
        placedLayout.add(item.ev.id);
      }
      layoutIdx += 1;
    }
  }

  musical.forEach(function(ev) {
    const targetStart = Math.max(0, ev.startBeat || 0);
    const dur = Math.max(
      minDurationBeats(unit),
      ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit)
    );

    flushLayoutUpTo(targetStart);

    if (targetStart > cursor + TIMING_EPSILON) {
      result.push(makeRest(targetStart - cursor, unit));
      cursor = targetStart;
    }

    setEventDurationBeats(ev, dur, unit);
    result.push(ev);
    cursor = targetStart + dur;
  });

  flushLayoutUpTo(Number.POSITIVE_INFINITY);
  layout.forEach(function(item) {
    if (!placedLayout.has(item.ev.id)) result.push(item.ev);
  });

  return assignTimingToEvents(result, tuneMeta.meter, unit);
}

export function achieveStartBeat(events, eventId, targetBeat, tuneMeta, opts) {
  const options = opts || {};
  let next = withTiming(events, tuneMeta);
  const idx = findEventIndex(next, eventId);
  if (idx < 0) return events;

  const ev = next[idx];
  if (!isTimedEvent(ev)) return events;

  const currentStart = ev.startBeat || 0;
  const snappedTarget = options.snap && typeof options.snap === 'function'
    ? options.snap(Math.max(0, targetBeat))
    : Math.max(0, targetBeat);
  const delta = snappedTarget - currentStart;

  if (Math.abs(delta) < TIMING_EPSILON) return next;

  if (delta > 0) {
    next = insertRestGap(next, idx, delta, tuneMeta);
  } else {
    next = shrinkPrefixByBeats(next, idx, -delta, tuneMeta);
  }

  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  return assignTimingToEvents(stripStartPositions(next), tuneMeta.meter, unit);
}

export function achieveDuration(events, eventId, durationBeats, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const next = events.map(function(ev) {
    if (ev.id !== eventId) return cloneVoiceEvent(ev);
    const copy = cloneVoiceEvent(ev);
    setEventDurationBeats(copy, durationBeats, unit);
    return copy;
  });
  return materializeAbsoluteTiming(next, tuneMeta);
}

export function moveNoteTiming(events, eventId, targetBeat, tuneMeta, opts) {
  return achieveStartBeat(events, eventId, targetBeat, tuneMeta, opts);
}

export function moveNotePitch(events, eventId, toneIndex, midi, tuneMeta) {
  const names = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  let pitch;
  try {
    const abcName = midiToAbcPitch(midi, { key: tuneMeta.key || 'C' });
    pitch = {
      step: names[pc].replace('^', '').charAt(0),
      octave: octave,
      accidental: names[pc].startsWith('^') ? 1 : 0,
      abcName: abcName,
    };
  } catch (err) {
    pitch = {
      step: names[pc].replace('^', '').charAt(0),
      octave: octave,
      accidental: names[pc].startsWith('^') ? 1 : 0,
      abcName: names[pc] + (octave >= 5 ? "'" : ''),
    };
  }

  return events.map(function(item) {
    if (item.id !== eventId) return cloneVoiceEvent(item);
    const copy = cloneVoiceEvent(item);
    if (copy.type === 'chord') {
      copy.pitches[toneIndex] = pitch;
    } else {
      copy.pitch = pitch;
      copy.pitches = [pitch];
    }
    return copy;
  });
}

export function splitEventAtBeat(events, eventId, splitBeat, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  let next = withTiming(events, tuneMeta);
  const idx = findEventIndex(next, eventId);
  if (idx < 0) return events;

  const ev = next[idx];
  if (!isTimedEvent(ev) || ev.type === 'rest') return events;

  const start = ev.startBeat || 0;
  const total = ev.durationBeats || durationToBeats(ev.duration, unit);
  const split = Math.max(start + minDurationBeats(unit), Math.min(splitBeat, start + total - minDurationBeats(unit)));
  if (split <= start + TIMING_EPSILON || split >= start + total - TIMING_EPSILON) return events;

  const firstDur = split - start;
  const secondDur = start + total - split;
  const first = cloneVoiceEvent(ev);
  const second = cloneVoiceEvent(ev);
  second.id = createEventId(ev.type);
  setEventDurationBeats(first, firstDur, unit);
  setEventDurationBeats(second, secondDur, unit);
  if (first.tieEnd) first.tieEnd = true;
  second.tieStart = !!ev.tieEnd;
  second.tieEnd = ev.tieEnd;
  second.startBeat = split;

  next.splice(idx, 1, first, second);
  return materializeAbsoluteTiming(next, tuneMeta);
}

export function slideEventsInRange(events, startBeat, endBeat, deltaBeat, tuneMeta) {
  if (Math.abs(deltaBeat) < TIMING_EPSILON) return events.map(cloneVoiceEvent);

  let next = withTiming(events, tuneMeta);
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);

  next.forEach(function(ev) {
    if (!isTimedEvent(ev)) return;
    const start = ev.startBeat || 0;
    const dur = ev.durationBeats || durationToBeats(ev.duration, unit);
    const end = start + dur;
    const inRange = start >= startBeat - TIMING_EPSILON && end <= endBeat + TIMING_EPSILON;
    if (inRange) {
      ev.startBeat = Math.max(0, start + deltaBeat);
    }
  });

  return materializeAbsoluteTiming(next, tuneMeta);
}

export function setGlobalBeatOffset(events, offsetBeats, tuneMeta) {
  if (Math.abs(offsetBeats) < TIMING_EPSILON) return events.map(cloneVoiceEvent);

  let next = withTiming(events, tuneMeta);
  if (offsetBeats > 0) {
    next = insertRestGap(next, 0, offsetBeats, tuneMeta);
  } else {
    next = shrinkPrefixByBeats(next, next.length, -offsetBeats, tuneMeta);
  }
  return materializeAbsoluteTiming(next, tuneMeta);
}

export function splitChordsToSingleNotes(events, eventIds, tuneMeta) {
  const idSet = {};
  (eventIds || []).forEach(function(id) { idSet[id] = true; });

  const next = [];
  events.forEach(function(ev) {
    if (!idSet[ev.id] || ev.type !== 'chord' || !ev.pitches || ev.pitches.length < 2) {
      next.push(cloneVoiceEvent(ev));
      return;
    }
    ev.pitches.forEach(function(pitch) {
      next.push({
        id: createEventId('note'),
        type: 'note',
        pitch: pitch,
        pitches: [pitch],
        duration: cloneVoiceEvent(ev).duration,
        tieStart: ev.tieStart,
        tieEnd: ev.tieEnd,
      });
    });
  });

  return materializeAbsoluteTiming(next, tuneMeta);
}

export function eventDurationBeats(ev, unitLengthDecimal) {
  if (typeof ev.durationBeats === 'number') return ev.durationBeats;
  return durationToBeats(ev.duration, unitLengthDecimal || 0.125);
}
