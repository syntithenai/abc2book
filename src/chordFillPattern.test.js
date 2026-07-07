import {
  beatsPerBarFromMeter,
  noteNameToAbc,
  chordNotesToAbcChord,
  getFillBeatIndices,
  buildChordFillAbc,
} from './chordFillPattern';

describe('chordFillPattern', function() {
  test('beatsPerBarFromMeter parses numerator', function() {
    expect(beatsPerBarFromMeter('4/4')).toBe(4);
    expect(beatsPerBarFromMeter('3/4')).toBe(3);
    expect(beatsPerBarFromMeter('')).toBe(4);
  });

  test('noteNameToAbc converts accidentals', function() {
    expect(noteNameToAbc('C')).toBe('C');
    expect(noteNameToAbc('F#')).toBe('^F');
    expect(noteNameToAbc('Eb')).toBe('_E');
  });

  test('chordNotesToAbcChord builds bracket token', function() {
    expect(chordNotesToAbcChord(['C', 'E', 'G'])).toBe('[CEG]');
    expect(chordNotesToAbcChord(['A', 'C', 'E'])).toBe('[ACE]');
  });

  test('getFillBeatIndices for common meters', function() {
    expect(getFillBeatIndices(4)).toEqual([0, 2]);
    expect(getFillBeatIndices(3)).toEqual([0, 1]);
    expect(getFillBeatIndices(5)).toEqual([0]);
  });

  test('buildChordFillAbc for C major in 4/4', function() {
    const abc = buildChordFillAbc('C', { meter: '4/4', tempo: 120, key: 'C' });
    expect(abc).toContain('M:4/4');
    expect(abc).toContain('Q:1/4=120');
    expect(abc).toContain('[CEG]2');
    expect(abc).toContain('z2');
    expect(abc).toMatch(/\|$/m);
  });

  test('buildChordFillAbc for Am in 3/4', function() {
    const abc = buildChordFillAbc('Am', { meter: '3/4', tempo: 90, key: 'A' });
    expect(abc).toContain('M:3/4');
    expect(abc).toContain('[ACE]2');
  });

  test('buildChordFillAbc for G7', function() {
    const abc = buildChordFillAbc('G7', { meter: '4/4', tempo: 120, key: 'G' });
    expect(abc).toContain('[BDFG]');
  });

  test('buildChordFillAbc returns null for invalid chord', function() {
    expect(buildChordFillAbc('', { meter: '4/4' })).toBeNull();
    expect(buildChordFillAbc('notachord', { meter: '4/4' })).toBeNull();
  });
});
