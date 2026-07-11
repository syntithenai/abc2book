import { buildChordSheetAlignmentFromLines } from './chordSheetImportUtils';

describe('chordSheetImportUtils', function() {
  test('buildChordSheetAlignmentFromLines maps chords onto a single lyric by offset', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      '[Chorus]',
      'Am         G',
      "Who's that girl",
    ]);

    expect(blocks.length).toBe(1);
    expect(blocks[0].header).toBe('[Chorus]');
    expect(blocks[0].type).toBe('chorus');
    expect(blocks[0].linePairs.length).toBe(1);
    expect(blocks[0].linePairs[0].anchors.map(function(a) { return a.chord; })).toEqual(['Am', 'G']);
    expect(blocks[0].linePairs[0].anchors[0].wordIndex).toBe(0);
  });

  test('distributes one chord row across following lyric lines as a shared harmonic span', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      'C       G       Am      F',
      'Twinkle twinkle little star',
      'How I wonder what you are',
    ]);

    expect(blocks.length).toBe(1);
    expect(blocks[0].linePairs.length).toBe(2);

    const first = blocks[0].linePairs[0];
    const second = blocks[0].linePairs[1];
    expect(first.chordLines).toEqual(['C       G       Am      F']);
    expect(second.chordLines).toEqual([]);
    expect(first.anchors.map(function(a) { return a.chord; })).toEqual(['C', 'G']);
    expect(second.anchors.map(function(a) { return a.chord; })).toEqual(['Am', 'F']);
    expect(first.anchors[0].word).toBe('Twinkle');
    expect(second.anchors[0].word).toBe('How');
    expect(first.anchors.length + second.anchors.length).toBe(4);
  });

  test('stops shared harmonic span at blank lines and new chord rows', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      'C    G',
      'First line',
      'Second line',
      '',
      'Am   F',
      'After blank',
    ]);

    expect(blocks.length).toBe(2);
    expect(blocks[0].linePairs.length).toBe(2);
    expect(blocks[0].linePairs[0].anchors.map(function(a) { return a.chord; })).toEqual(['C']);
    expect(blocks[0].linePairs[1].anchors.map(function(a) { return a.chord; })).toEqual(['G']);
    expect(blocks[1].linePairs.length).toBe(1);
    expect(blocks[1].linePairs[0].anchors.map(function(a) { return a.chord; })).toEqual(['Am', 'F']);
  });
});
