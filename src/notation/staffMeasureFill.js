import {
  assignTimingToEvents,
  beatsPerBarFromMeter,
  parseNoteLengthDecimal,
  durationToBeats,
  beatsToDuration,
} from './beatGrid';
import { cloneVoiceEvent, createEventId } from './voiceEventModel';
import { materializeAbsoluteTiming } from './timingEdit';

const EPS = 0.001;

function isTimed(ev) {
  return ev && (ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest');
}

function isLayout(ev) {
  return ev && (ev.type === 'barline' || ev.type === 'lineBreak');
}

function minDur(unit) {
  return Math.max(0.125, unit * 4 / 64);
}

function makeFillerRest(beats, unit) {
  const dur = Math.max(minDur(unit), beats);
  return {
    id: createEventId('rest'),
    type: 'rest',
    pitch: null,
    pitches: null,
    duration: beatsToDuration(dur, unit),
    durationBeats: dur,
    tieStart: false,
    tieEnd: false,
    fillerRest: true,
  };
}

function measureEndBeat(measureStart, bpb) {
  return measureStart + bpb;
}

function maxTimedEndInList(list, unit) {
  let max = 0;
  list.forEach(function(ev) {
    if (!isTimed(ev)) return;
    const s = ev.startBeat || 0;
    const d = ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit);
    max = Math.max(max, s + d);
  });
  return max;
}

/** Fill each measure segment to beatsPerBar with filler rests before barlines. */
export function fillToMeasureEnds(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const bpb = beatsPerBarFromMeter(tuneMeta.meter);
  const timed = assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
  const result = [];
  let measureStart = 0;

  function pushMeasureFill(upToBeat) {
    const target = measureEndBeat(measureStart, bpb);
    const cursor = maxTimedEndInList(result, unit);
    const fillEnd = Math.min(upToBeat, target);
    if (fillEnd > cursor + EPS) {
      result.push(makeFillerRest(fillEnd - cursor, unit));
    }
  }

  timed.forEach(function(ev) {
    if (isLayout(ev)) {
      pushMeasureFill(measureEndBeat(measureStart, bpb));
      result.push(cloneVoiceEvent(ev));
      measureStart = measureEndBeat(measureStart, bpb);
      return;
    }
    result.push(cloneVoiceEvent(ev));
  });

  pushMeasureFill(measureEndBeat(measureStart, bpb));
  return assignTimingToEvents(result, tuneMeta.meter, unit);
}

export function stripFillerRests(events) {
  return (events || []).filter(function(ev) {
    return !ev.fillerRest;
  });
}

function markNewFillerRests(originalEvents, filledEvents) {
  const origIds = {};
  (originalEvents || []).forEach(function(ev) {
    if (ev && ev.id) origIds[ev.id] = true;
  });
  filledEvents.forEach(function(ev) {
    if (ev.type === 'rest' && !origIds[ev.id]) {
      ev.fillerRest = true;
    }
  });
  return filledEvents;
}

/**
 * Gap-fill rests, fill measures to meter, assign startBeat. Marks inserted rests as fillerRest.
 */
export function materializeStaffVoice(events, tuneMeta, opts) {
  const options = opts || {};
  const cloned = (events || []).map(cloneVoiceEvent);
  let next = materializeAbsoluteTiming(cloned, tuneMeta);
  next = fillToMeasureEnds(next, tuneMeta);
  if (!options.preserveFillerFlags) {
    markNewFillerRests(cloned, next);
  } else {
    next.forEach(function(ev) {
      if (ev.fillerRest) return;
      const orig = cloned.find(function(o) { return o.id === ev.id; });
      if (orig && orig.fillerRest) ev.fillerRest = true;
    });
    markNewFillerRests(cloned, next);
  }
  return next;
}

export function eventAtBeat(events, beat, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const timed = assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
  for (let i = 0; i < timed.length; i += 1) {
    const ev = timed[i];
    if (!isTimed(ev)) continue;
    const s = ev.startBeat || 0;
    const d = ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit);
    if (beat >= s - EPS && beat < s + d - EPS) return { event: ev, index: i };
  }
  return null;
}

export function totalTimedBeats(events, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  let sum = 0;
  (events || []).forEach(function(ev) {
    if (!isTimed(ev)) return;
    sum += ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit);
  });
  return sum;
}

export function removeTimedEventsInBeatRange(events, startBeat, durationBeats, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const endBeat = startBeat + durationBeats;
  const timed = assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
  const kept = timed.filter(function(ev) {
    if (!isTimed(ev)) return true;
    const s = ev.startBeat || 0;
    const d = ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit);
    const e = s + d;
    return e <= startBeat + EPS || s >= endBeat - EPS;
  });
  return kept;
}

export function insertTimedEventsAtBeat(events, startBeat, insertEvents, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const clipBeats = totalTimedBeats(insertEvents, tuneMeta);
  const stripped = removeTimedEventsInBeatRange(events, startBeat, clipBeats, tuneMeta);
  const timed = assignTimingToEvents(stripped.map(cloneVoiceEvent), tuneMeta.meter, unit);
  const insertClone = insertEvents.map(function(ev) {
    const c = cloneVoiceEvent(ev);
    c.id = createEventId(c.type || 'paste');
    c.startBeat = startBeat;
    return c;
  });
  const before = [];
  const after = [];
  timed.forEach(function(ev) {
    if (isTimed(ev) && (ev.startBeat || 0) >= startBeat + clipBeats - EPS) {
      after.push(cloneVoiceEvent(ev));
    } else {
      before.push(cloneVoiceEvent(ev));
    }
  });
  const merged = before.concat(insertClone, after);
  return stripFillerRests(materializeStaffVoice(merged, tuneMeta, { preserveFillerFlags: true }));
}
