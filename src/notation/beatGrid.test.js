import { beatsPerBarFromMeter, durationToBeats, assignTimingToEvents } from './beatGrid';

describe('beatGrid', function() {
  test('4/4 has four quarter beats per bar', function() {
    expect(beatsPerBarFromMeter('4/4')).toBeCloseTo(4, 3);
  });

  test('assignTimingToEvents advances cursor', function() {
    const events = assignTimingToEvents([
      { type: 'note', duration: { num: 2, den: 1, dotted: false } },
      { type: 'note', duration: { num: 2, den: 1, dotted: false } },
    ], '4/4', 0.125);
    expect(events[1].startBeat).toBeGreaterThan(events[0].startBeat);
  });

  test('durationToBeats for unit note', function() {
    const beats = durationToBeats({ num: 1, den: 1, dotted: false }, 0.125);
    expect(beats).toBeCloseTo(0.5, 3);
  });
});
