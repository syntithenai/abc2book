import {
  splitMelodyIntoBlocks,
  extractBarsFromMelodyText,
  assignLyricLinesToBars,
  lyricAssignmentsForMelody,
  buildNotationLineBarMap,
  lyricTextForBarRange,
  detectBarsPerLyricLine,
  assignLyricLinesToBarsForChart,
  chordChangeBarIndices,
  wordIndexToNoteIndex,
} from './lyricBarAlignmentUtils';

const ASHOKAN_A = 'Ac | d3 cBA | F4 EF | G3 FED | B,2 D3 B, | A,2 D2 F2 | A2 d2 f2 | f3 gf2 | e4 Ac |';
const ASHOKAN_B = 'd3 cBA | F4 EF | G3 FED | B,2 D3 B, | A,2 D2 F2 | A2 d2 f2 | A2 c2 e2 | d4 FG ::';
const ASHOKAN_C = 'A3 FD2 | d4 A2 | B3 cd2 | A F3 E2 | F3 ED2 | B,4 G,2 | A,6 | A4 FE |';
const ASHOKAN_D = 'D2 F2 A2 | =c6 | B3 cd2 | A2 F2 D2 | A,2 D2 F2 | A2 d2 F2 | E3 DC2 | D4 :|';

describe('lyricBarAlignmentUtils', function() {
  test('splits melody strains at :: ignoring visual line breaks', function() {
    const blocks = splitMelodyIntoBlocks([ASHOKAN_A + ASHOKAN_B, ASHOKAN_C + ASHOKAN_D]);
    expect(blocks.length).toBe(2);
    expect(extractBarsFromMelodyText(blocks[0]).length).toBeGreaterThan(4);
  });

  test('assigns lyric lines to an even split of bars in a block', function() {
    const assigned = assignLyricLinesToBars(['line one', 'line two', 'line three', 'line four'], 8);
    expect(assigned.length).toBe(4);
    expect(assigned[0]).toMatchObject({ startBar: 0, endBar: 1 });
    expect(assigned[3]).toMatchObject({ startBar: 6, endBar: 7 });
  });

  test('maps one lyric block across multiple melodic strains', function() {
    const noteLines = [ASHOKAN_A + ASHOKAN_B, ASHOKAN_C + ASHOKAN_D];
    const lyrics = [
      'The sun is sinking low',
      'in the sky above Ashokan',
      'The pines and the willows know',
      'soon we will part',
    ];
    const assignments = lyricAssignmentsForMelody(noteLines, lyrics);
    expect(assignments.length).toBe(4);
    const totalBars = assignments[assignments.length - 1].endBar + 1;
    expect(totalBars).toBeGreaterThan(8);
  });

  test('collects lyric text for a notation line bar range', function() {
    const noteLines = ['C D | E F | G A | B c |', 'd e | f g |'];
    const lyrics = ['first pair', 'second pair'];
    const assignments = lyricAssignmentsForMelody(noteLines, lyrics);
    const barMap = buildNotationLineBarMap(noteLines);
    const line0Text = lyricTextForBarRange(assignments, barMap[0].startBar, barMap[0].endBar);
    expect(line0Text).toContain('first');
  });

  test('detectBarsPerLyricLine prefers one bar per line when chord changes every bar', function() {
    const bars = [['C'], ['Am'], ['F'], ['G'], ['C'], ['Am'], ['Dm'], ['G']];
    const changes = chordChangeBarIndices(bars);
    expect(detectBarsPerLyricLine(8, 8, changes)).toBe(1);
    expect(detectBarsPerLyricLine(4, 8, changes)).toBe(2);
  });

  test('detectBarsPerLyricLine keeps two bars per line for hymn cadence pattern', function() {
    // Angels We Have Heard: one 8-bar notes line covers four lyric lines.
    // Cadences land mid-couplet (bars 3 and 7); do not collapse to 4 bars/line.
    const bars = [['G'], [], [], ['D', 'G'], ['G'], [], [], ['D', 'G']];
    const changes = chordChangeBarIndices(bars);
    expect(detectBarsPerLyricLine(4, 8, changes)).toBe(2);
    const result = assignLyricLinesToBarsForChart(
      ['line one', 'line two', 'line three', 'line four'],
      8,
      bars
    );
    expect(result.barsPerLyricLine).toBe(2);
    expect(result.assignments[0]).toMatchObject({ startBar: 0, endBar: 1 });
    expect(result.assignments[1]).toMatchObject({ startBar: 2, endBar: 3 });
    expect(result.assignments[2]).toMatchObject({ startBar: 4, endBar: 5 });
    expect(result.assignments[3]).toMatchObject({ startBar: 6, endBar: 7 });
  });

  test('assignLyricLinesToBarsForChart splits four bars across two lyric lines', function() {
    const chart = [['Fm'], ['Am'], ['Em'], ['F']];
    const lines = ['first sung line', 'second sung line'];
    const result = assignLyricLinesToBarsForChart(lines, 4, chart);
    expect(result.barsPerLyricLine).toBe(2);
    expect(result.assignments[0]).toMatchObject({ startBar: 0, endBar: 1 });
    expect(result.assignments[1]).toMatchObject({ startBar: 2, endBar: 3 });
  });

  test('wordIndexToNoteIndex maps word positions into note slots', function() {
    expect(wordIndexToNoteIndex(0, 4, 8)).toBe(0);
    expect(wordIndexToNoteIndex(1, 4, 8)).toBe(2);
    expect(wordIndexToNoteIndex(3, 4, 8)).toBe(6);
    expect(wordIndexToNoteIndex(99, 4, 8)).toBe(7);
  });
});
