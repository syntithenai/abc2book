import { formatMelodyNotes } from './melodyFormatter';

describe('melodyFormatter', function() {
  it('formats detected notes onto the shared beat grid', function() {
    const text = formatMelodyNotes({
      notes: [
        { start: 0.0, end: 0.4, midi: 60 },
        { start: 0.5, end: 0.9, midi: 62 },
      ],
      beatTimes: [0, 0.5, 1.0, 1.5],
      beatsPerBar: 2,
      slotsPerBeat: 1,
    });

    expect(text).toContain('C');
    expect(text).toContain('D');
  });
});
