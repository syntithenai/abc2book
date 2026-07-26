import { parseNoteLengthDecimal, durationToBeats, beatsToDuration, assignTimingToEvents } from './beatGrid';
import { cloneVoiceEvent, createEventId } from './voiceEventModel';
import { collapseAdjacentRests } from './timingEdit';
import {
  insertTimedEventsAtBeat,
  removeTimedEventsInBeatRange,
  materializeStaffVoice,
  stripFillerRests,
} from './staffMeasureFill';

const EPS = 0.001;

function minDur(unit) {
  return Math.max(0.125, unit * 4 / 64);
}

function timedBeats(ev, unit) {
  return ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit);
}

function isTimed(ev) {
  return ev && (ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest');
}

export function makeUserRest(beats, unit) {
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
  };
}

/** Greedy longest-fit rest decomposition (MuseScore-style). */
export function longestRestChain(totalBeats, unit) {
  const mults = [32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125];
  const sizes = [];
  mults.forEach(function(m) {
    const beats = m * unit * 4;
    if (beats >= minDur(unit) - EPS) sizes.push(beats);
  });
  sizes.sort(function(a, b) { return b - a; });

  let rem = totalBeats;
  const chain = [];
  sizes.forEach(function(size) {
    while (rem >= size - EPS) {
      chain.push(makeUserRest(size, unit));
      rem -= size;
    }
  });
  if (rem > minDur(unit) - EPS) {
    chain.push(makeUserRest(rem, unit));
  }
  return chain;
}

export function splitRestToDuration(restEv, targetBeats, unit) {
  const total = timedBeats(restEv, unit);
  const chunk = Math.max(minDur(unit), targetBeats);
  if (chunk >= total - EPS) {
    const one = cloneVoiceEvent(restEv);
    one.duration = beatsToDuration(total, unit);
    one.durationBeats = total;
    return [one];
  }
  const parts = [];
  let rem = total;
  while (rem > chunk + EPS) {
    parts.push(makeUserRest(chunk, unit));
    rem -= chunk;
  }
  if (rem > EPS) parts.push(makeUserRest(rem, unit));
  return parts;
}

export function mergeBeatSpans(spans) {
  if (!spans.length) return [];
  const sorted = spans.slice().sort(function(a, b) { return a.start - b.start; });
  const merged = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + EPS) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

export function beatSpanForEvent(ev, unit) {
  if (!isTimed(ev)) return null;
  const start = ev.startBeat || 0;
  const end = start + timedBeats(ev, unit);
  return { start: start, end: end };
}

export function removeBeatRangeAndRefillLongestRests(events, startBeat, durationBeats, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const stripped = removeTimedEventsInBeatRange(events, startBeat, durationBeats, tuneMeta);
  const chain = longestRestChain(durationBeats, unit);
  return insertTimedEventsAtBeat(stripped, startBeat, chain, tuneMeta);
}

export function replaceBeatRangeWithRests(events, startBeat, durationBeats, restParts, tuneMeta) {
  const stripped = removeTimedEventsInBeatRange(events, startBeat, durationBeats, tuneMeta);
  return insertTimedEventsAtBeat(stripped, startBeat, restParts, tuneMeta);
}

export function finalizeRestOps(events, session, opts) {
  const options = opts || {};
  let next = options.skipCollapse
    ? events.map(cloneVoiceEvent)
    : collapseAdjacentRests(events, session.tuneMeta);
  if (session.fillMeasures) {
    next = stripFillerRests(materializeStaffVoice(next, session.tuneMeta, { preserveFillerFlags: true }));
  }
  return next;
}

export function restSpansForIds(events, ids, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const timed = assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
  const spans = [];
  ids.forEach(function(id) {
    const ev = timed.find(function(e) { return e.id === id; });
    if (!ev || ev.type !== 'rest') return;
    const span = beatSpanForEvent(ev, unit);
    if (span) spans.push(span);
  });
  return mergeBeatSpans(spans);
}

export function applyRestDurationChange(events, restId, targetBeats, session) {
  const tuneMeta = session.tuneMeta;
  const unit = session.unitLengthDecimal;
  const timed = assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
  const ev = timed.find(function(e) { return e.id === restId; });
  if (!ev || ev.type !== 'rest') return events;

  const start = ev.startBeat || 0;
  const total = timedBeats(ev, unit);
  const parts = splitRestToDuration(ev, targetBeats, unit);

  if (parts.length === 1 && Math.abs(timedBeats(parts[0], unit) - total) < EPS) {
    const next = events.map(cloneVoiceEvent);
    const idx = next.findIndex(function(e) { return e.id === restId; });
    if (idx < 0) return events;
    next[idx] = parts[0];
    return finalizeRestOps(next, session);
  }

  const replaced = replaceBeatRangeWithRests(events, start, total, parts, tuneMeta);
  return finalizeRestOps(replaced, session, { skipCollapse: true });
}
