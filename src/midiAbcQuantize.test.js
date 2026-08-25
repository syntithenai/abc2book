import {
  fillSlotGap,
  formatNoteEventsToAbcBody,
  joinAbcMeasures,
  splitEventsAtBarBoundaries,
  trimNotesForQuantization,
} from './midiAbcQuantize';

describe('midiAbcQuantize', function() {
  test('trimNotesForQuantization normalizes to start at zero', function() {
    const result = trimNotesForQuantization([
      { start: 10, end: 10.5, midi: 60 },
      { start: 10.5, end: 11, midi: 62 },
    ]);
    expect(result.notes[0].start).toBe(0);
    expect(result.durationSec).toBeGreaterThan(0);
  });

  test('formatNoteEventsToAbcBody inserts barline between measures', function() {
    const body = formatNoteEventsToAbcBody([
      { slot: 0, durSlots: 2, token: 'C2' },
      { slot: 16, durSlots: 2, token: 'D2' },
    ], { beatsPerBar: 4, slotsPerBeat: 2 });
    expect(body.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/C2/);
    expect(body).toMatch(/D2/);
  });

  test('formatNoteEventsToAbcBody ends each measure with a barline', function() {
    const body = formatNoteEventsToAbcBody([
      { slot: 0, durSlots: 2, token: 'C2' },
      { slot: 16, durSlots: 2, token: 'D2' },
    ], { beatsPerBar: 4, slotsPerBeat: 2 });
    body.split('\n').forEach(function(line) {
      expect(line.trim()).toMatch(/\|$/);
    });
    expect(body.split('|').length).toBeGreaterThanOrEqual(3);
  });

  test('formatNoteEventsToAbcBody clips overlapping notes so bars are not overfilled', function() {
    // Two notes in one 4/4 bar (8 eighth-slots): first would otherwise last whole bar.
    const body = formatNoteEventsToAbcBody([
      { slot: 0, durSlots: 8, token: 'C8' },
      { slot: 2, durSlots: 2, token: 'D2' },
      { slot: 4, durSlots: 2, token: 'E2' },
      { slot: 6, durSlots: 2, token: 'F2' },
    ], { beatsPerBar: 4, slotsPerBeat: 2, allowChords: false });
    const firstBar = body.split('\n')[0];
    expect(firstBar).toMatch(/C2/);
    expect(firstBar).toMatch(/D2/);
    expect(firstBar).toMatch(/E2/);
    expect(firstBar).toMatch(/F2/);
    expect(firstBar).not.toMatch(/C8/);
  });

  test('formatNoteEventsToAbcBody merges same-slot notes into a chord when allowed', function() {
    const body = formatNoteEventsToAbcBody([
      { slot: 0, durSlots: 2, token: 'C2' },
      { slot: 0, durSlots: 2, token: 'E2' },
    ], { beatsPerBar: 4, slotsPerBeat: 2, allowChords: true });
    expect(body).toMatch(/\[CE\]/);
  });
});
