import {
  achieveStartBeat,
  materializeAbsoluteTiming,
  moveNoteTiming,
  splitEventAtBeat,
  slideEventsInRange,
  setGlobalBeatOffset,
} from './timingEdit';
import { assignTimingToEvents, parseNoteLengthDecimal, beatsToDuration } from './beatGrid';
import { reassignEventTiming } from './abcVoiceSerializer';

const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C' };

function note(id, beats, startBeat) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const ev = {
    id: id,
    type: 'note',
    pitch: { step: 'C', octave: 4, accidental: 0, abcName: 'C' },
    pitches: [{ step: 'C', octave: 4, accidental: 0, abcName: 'C' }],
    duration: beatsToDuration(beats, unit),
    tieStart: false,
    tieEnd: false,
  };
  if (typeof startBeat === 'number') ev.startBeat = startBeat;
  return ev;
}

describe('timingEdit', function() {
  test('moveNoteTiming later inserts rest', function() {
    const events = assignTimingToEvents([
      note('a', 0.5),
      note('b', 0.5),
    ], tuneMeta.meter, parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter));

    const out = moveNoteTiming(events, 'b', 2, tuneMeta);
    const moved = out.find(function(ev) { return ev.id === 'b'; });
    expect(moved.startBeat).toBeCloseTo(2, 2);
    expect(out.some(function(ev) { return ev.type === 'rest'; })).toBe(true);
  });

  test('moveNoteTiming earlier shrinks prefix', function() {
    const events = assignTimingToEvents([
      note('a', 1),
      note('b', 0.5),
    ], tuneMeta.meter, parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter));

    const out = achieveStartBeat(events, 'b', 0.5, tuneMeta);
    const moved = out.find(function(ev) { return ev.id === 'b'; });
    expect(moved.startBeat).toBeCloseTo(0.5, 2);
  });

  test('materializeAbsoluteTiming resolves overlaps', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 1), note('b', 1)], tuneMeta.meter, unit);
    events[0].startBeat = 0;
    events[1].startBeat = 0.5;
    const out = materializeAbsoluteTiming(events, tuneMeta);
    const b = out.find(function(ev) { return ev.id === 'b'; });
    expect(b.startBeat).toBeGreaterThanOrEqual(1 - 0.01);
  });

  test('splitEventAtBeat creates two notes', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 1)], tuneMeta.meter, unit);
    const out = splitEventAtBeat(events, 'a', 0.5, tuneMeta);
    const notes = out.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.length).toBe(2);
    const total = notes.reduce(function(sum, ev) { return sum + ev.durationBeats; }, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  test('slideEventsInRange shifts selection', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([
      note('a', 0.5),
      note('b', 0.5),
      note('c', 0.5),
    ], tuneMeta.meter, unit);
    const out = slideEventsInRange(events, 0.5, 1, 0.5, tuneMeta);
    const b = out.find(function(ev) { return ev.id === 'b'; });
    expect(b.startBeat).toBeCloseTo(1, 2);
  });

  test('setGlobalBeatOffset inserts leading rest', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([note('a', 0.5)], tuneMeta.meter, unit);
    const out = setGlobalBeatOffset(events, 1, tuneMeta);
    const a = out.find(function(ev) { return ev.id === 'a'; });
    expect(a.startBeat).toBeCloseTo(1, 2);
  });

  test('materialize survives reassignEventTiming', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    let events = assignTimingToEvents([note('a', 0.5), note('b', 0.5)], tuneMeta.meter, unit);
    events = moveNoteTiming(events, 'b', 2, tuneMeta);
    const roundTrip = reassignEventTiming(events, tuneMeta);
    const b = roundTrip.find(function(ev) { return ev.id === 'b'; });
    expect(b.startBeat).toBeCloseTo(2, 2);
  });
});
