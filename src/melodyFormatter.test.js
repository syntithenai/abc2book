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
      key: 'C',
    });

    expect(text).toContain('C');
    expect(text).toContain('D');
  });

  it('chooses a denser subdivision when notes need it', function() {
    const text = formatMelodyNotes({
      notes: [
        { start: 0.0, end: 0.12, midi: 60 },
        { start: 0.13, end: 0.25, midi: 62 },
        { start: 0.26, end: 0.38, midi: 64 },
        { start: 0.39, end: 0.49, midi: 65 },
      ],
      beatTimes: [0, 0.5, 1.0],
      beatsPerBar: 1,
      key: 'C',
    });
    expect(text).toContain('C');
    expect(text).toContain('F');
  });
});
