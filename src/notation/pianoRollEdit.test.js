import {
  moveEventToBeat,
  resizeEventDuration,
  insertNoteAtBeat,
  deleteEventById,
} from './pianoRollEdit';
import { assignTimingToEvents, parseNoteLengthDecimal, beatsToDuration } from './beatGrid';
import { reassignEventTiming } from './abcVoiceSerializer';

const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C' };

function note(id, beats) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  return {
    id: id,
    type: 'note',
    pitch: { step: 'C', octave: 4, accidental: 0, abcName: 'C' },
    pitches: [{ step: 'C', octave: 4, accidental: 0, abcName: 'C' }],
    duration: beatsToDuration(beats, unit),
    tieStart: false,
    tieEnd: false,
  };
}

describe('pianoRollEdit', function() {
  test('moveEventToBeat sets absolute start', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 0.5), note('b', 0.5)], tuneMeta.meter, unit);
    const out = moveEventToBeat(events, 'b', 2, tuneMeta);
    const b = out.find(function(ev) { return ev.id === 'b'; });
    expect(b.startBeat).toBeCloseTo(2, 2);
    expect(reassignEventTiming(out, tuneMeta).find(function(ev) { return ev.id === 'b'; }).startBeat).toBeCloseTo(2, 2);
  });

  test('resizeEventDuration changes length', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 0.5)], tuneMeta.meter, unit);
    const out = resizeEventDuration(events, 'a', 1, tuneMeta);
    expect(out[0].durationBeats).toBeCloseTo(1, 2);
  });

  test('insertNoteAtBeat places note at beat', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 0.5)], tuneMeta.meter, unit);
    const session = { durationKey: 5, dotted: false, unitLengthDecimal: unit };
    const result = insertNoteAtBeat(events, 2, 60, session, tuneMeta);
    const inserted = result.events.find(function(ev) { return ev.type === 'note' && ev.id !== 'a'; });
    expect(inserted.startBeat).toBeCloseTo(2, 2);
  });

  test('deleteEventById removes note', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 0.5), note('b', 0.5)], tuneMeta.meter, unit);
    const out = deleteEventById(events, 'a', tuneMeta);
    expect(out.some(function(ev) { return ev.id === 'a'; })).toBe(false);
  });
});
