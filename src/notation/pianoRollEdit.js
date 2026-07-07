import { assignTimingToEvents, parseNoteLengthDecimal, durationToBeats } from './beatGrid';
import { cloneVoiceEvent, createEventId } from './voiceEventModel';
import { durationFromSession, pitchFromMidi } from './notationActions';
import { defaultNoteExtensions } from './notationMarks';
import {
  moveNoteTiming,
  achieveDuration,
  collapseAdjacentRests,
  eventDurationBeats as timingEventDurationBeats,
} from './timingEdit';

export function moveEventToBeat(events, eventId, targetBeat, tuneMeta) {
  return moveNoteTiming(events, eventId, targetBeat, tuneMeta);
}

export function resizeEventDuration(events, eventId, newDurationBeats, tuneMeta) {
  return achieveDuration(events, eventId, newDurationBeats, tuneMeta);
}

export function insertNoteAtBeat(events, beat, midi, session, tuneMeta) {
  const pitch = pitchFromMidi(midi, tuneMeta);
  const ev = Object.assign({
    id: createEventId('note'),
    type: 'note',
    pitch: pitch,
    pitches: [pitch],
    duration: durationFromSession(session),
    tieStart: false,
    tieEnd: false,
  }, defaultNoteExtensions());
  let next = events.map(cloneVoiceEvent);
  next.push(ev);
  next = moveNoteTiming(next, ev.id, beat, tuneMeta);
  const caretIndex = next.findIndex(function(x) { return x.id === ev.id; }) + 1;
  return { events: next, caretIndex: Math.max(1, caretIndex) };
}

export function deleteEventById(events, eventId, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const next = events.filter(function(ev) { return ev.id !== eventId; }).map(cloneVoiceEvent);
  const collapsed = collapseAdjacentRests(next, tuneMeta);
  return assignTimingToEvents(collapsed, tuneMeta.meter, unit);
}

export function eventDurationBeats(ev, tuneMeta) {
  const unit = tuneMeta
    ? parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter)
    : 0.125;
  return timingEventDurationBeats(ev, unit);
}
