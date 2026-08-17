import {
  collapseAnacrusisDoubleBarlines,
  flattenMelodyText,
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
  assignLyricLinesToBarsFromNotation,
  splitMelodyNoteLinesByStrain,
  notationNoteLinesForStrainIndex,
  filterNotationNoteLinesForAlignment,
  allocateChordLinesToLyrics,
} from './lyricBarAlignmentUtils';
import { splitMelodyStrainsWithBarlines } from './melodyStrainSplit';

const ASHOKAN_A = 'Ac | d3 cBA | F4 EF | G3 FED | B,2 D3 B, | A,2 D2 F2 | A2 d2 f2 | f3 gf2 | e4 Ac |';
const ASHOKAN_B = 'd3 cBA | F4 EF | G3 FED | B,2 D3 B, | A,2 D2 F2 | A2 d2 f2 | A2 c2 e2 | d4 FG ::';
const ASHOKAN_C = 'A3 FD2 | d4 A2 | B3 cd2 | A F3 E2 | F3 ED2 | B,4 G,2 | A,6 | A4 FE |';
const ASHOKAN_D = 'D2 F2 A2 | =c6 | B3 cd2 | A2 F2 D2 | A,2 D2 F2 | A2 d2 F2 | E3 DC2 | D4 :|';

describe('lyricBarAlignmentUtils', function() {
  test('flattenMelodyText keeps bars separate when a wrap omits trailing |', function() {
    const notes = [
      '"Dm"zzzzzzzz|"C"zzzzzzzz|"A#"zzzzzzzz|"Am"zzzzzzzz|',
      '"Gm"zzzzzzzz|"F"zzzzzzzz|"A"zzzzzzzz|"A"zzzzzzzz|',
      '"Dm"zzzzzzzz|"C"zzzzzzzz|"A#"zzzzzzzz|"Am"zzzzzzzz|',
      '"Gm"zzzzzzzz|"F"zzzzzzzz|"A"zzzzzzzz|"A"zzzzzzzz||',
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz',
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz ||',
    ];
    const strains = splitMelodyStrainsWithBarlines(notes);
    expect(strains.length).toBe(2);
    expect(extractBarsFromMelodyText(strains[0].text).length).toBe(16);
    expect(extractBarsFromMelodyText(strains[1].text).length).toBe(8);
    expect(extractBarsFromMelodyText(flattenMelodyText(notes)).length).toBe(24);
  });

  test('collapseAnacrusisDoubleBarlines turns pickup || into a single barline', function() {
    expect(collapseAnacrusisDoubleBarlines('|:FG||"D"AFDF AFDF|'))
      .toBe('|:FG|"D"AFDF AFDF|');
    expect(collapseAnacrusisDoubleBarlines('|:de||fdAd fagf|'))
      .toBe('|:de|fdAd fagf|');
    expect(collapseAnacrusisDoubleBarlines('C D E F | G A B c || d e f g |'))
      .toBe('C D E F | G A B c || d e f g |');
  });

  test('splitMelodyIntoBlocks does not split on anacrusis double barlines', function() {
    const strain = '|:FG||"D"AFDF AFDF|A2 d2 d2 cB|AFDF AFDF|"A"G2E2 E2 FG|'
      + '"D"AFDF AFDF|A2 d2 d2 de|fafd "A"egec|"D"d2f2d2:|';
    const blocks = splitMelodyIntoBlocks([strain]);
    expect(blocks.length).toBe(1);
    expect(extractBarsFromMelodyText(blocks[0]).length).toBe(9);
  });

  test('buildNotationLineBarMap normalizes pickup || on a single staff line', function() {
    const strain = '|:FG||"D"AFDF AFDF|A2 d2 d2 cB|AFDF AFDF|"A"G2E2 E2 FG|'
      + '"D"AFDF AFDF|A2 d2 d2 de|fafd "A"egec|"D"d2f2d2:|';
    const barMap = buildNotationLineBarMap([strain]);
    expect(barMap.length).toBe(1);
    expect(barMap[0].barCount).toBe(9);
  });

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

  test('assignLyricLinesToBarsFromNotation maps four lines onto repeat opening strain', function() {
    const noteLines = [
      '"A"e (a/e/"G"g) a/(g/ | "A"e) (a/e/) "G"df | "A"e a/e/ "G"(g/f/)g/(f/ | "E"e/)(d/c) "A"A2 :|',
      '|: "A"A A "C"[ce]2 | "A"A A "G"G2 | "A"A (A/B/ c/)B/c/(d/ | "E"e/d/) c "A"A A :|',
    ];
    const lyrics = ['line one', 'line two', 'line three', 'line four'];
    const firstStrainOnly = [noteLines[0]];
    const viaChart = assignLyricLinesToBarsForChart(lyrics, 4, [['A'], ['G'], ['A'], ['E']], {
      notationNoteLines: firstStrainOnly,
    });
    expect(viaChart.fromNotation).toBe(true);
    expect(viaChart.barsPerLyricLine).toBe(2);
    expect(viaChart.assignments[0]).toMatchObject({ startBar: 0, endBar: 1 });
    const result = assignLyricLinesToBarsFromNotation(lyrics, noteLines);
    expect(result).toEqual([
      expect.objectContaining({ startBar: 0, endBar: 1 }),
      expect.objectContaining({ startBar: 2, endBar: 3 }),
      expect.objectContaining({ startBar: 0, endBar: 1 }),
      expect.objectContaining({ startBar: 2, endBar: 3 }),
    ]);
  });

  test('assignLyricLinesToBarsFromNotation maps Ashokan verse at two bars per line', function() {
    const noteLines = [
      '"Am"zzzzzz|"E7"zzzzzz|"C"zzzzzz|"D"zzzzzz|',
      '"Fmaj7"zzzzzz|"C"zzzzzz|"E"zzzzzz|"E7"zzzzzz|',
    ];
    const lyrics = [
      'Song and melodies change and change',
      'And sway, but they still stay the same',
    ];
    const result = assignLyricLinesToBarsForChart(lyrics, 8, [
      ['Am'], ['E7'], ['C'], ['D'], ['FM7'], ['C'], ['E'], ['E7'],
    ], { notationNoteLines: noteLines });
    expect(result.fromNotation).toBe(true);
    expect(result.assignments[0]).toMatchObject({ startBar: 0, endBar: 3 });
    expect(result.assignments[1]).toMatchObject({ startBar: 4, endBar: 7 });
  });

  test('detectBarsPerLyricLine prefers four bars per line for ABC scaffold verses', function() {
    const bars = new Array(28).fill(null).map(function(_, i) {
      return [['Am'], ['E7'], ['C'], ['D'], ['FM7'], ['C'], ['E'], ['E7']][i % 8];
    });
    expect(detectBarsPerLyricLine(8, 28, chordChangeBarIndices(bars))).toBe(4);
  });

  test('assignLyricLinesToBarsForChart maps two lyrics per chord row on one notation line', function() {
    const lines = [
      'Blood on my teeth. Fire in my gut.',
      'Spark in my eye. Butterflies in flight.',
    ];
    const noteLine = '"G"zzzz"Bm"zzzz|"G"zzzz"A"zzzz||';
    const bars = [['G', 'Bm'], ['G', 'A']];
    const result = assignLyricLinesToBarsForChart(lines, 2, bars, {
      notationNoteLines: [noteLine],
      strainScopedNotation: true,
    });
    expect(result.assignments[0]).toMatchObject({ lineIndex: 0, startBar: 0, endBar: 0 });
    expect(result.assignments[1]).toMatchObject({ lineIndex: 1, startBar: 1, endBar: 1 });
  });

  test('notationNoteLinesForStrainIndex slices staff lines at strain boundaries', function() {
    const noteLines = [
      '"Em"zzzzzzzz|"Em"zzzzzzzz|"Em"zzzzzzzz|"G"zzzz"A"zzzz|',
      '"Em"zzzzzzzz|"Em"zzzzzzzz||"G"zzzz"Bm"zzzz|"G"zzzz"A"zzzz||',
    ];
    const filtered = filterNotationNoteLinesForAlignment(noteLines);
    const strain0 = notationNoteLinesForStrainIndex(filtered, 0);
    const strain1 = notationNoteLinesForStrainIndex(filtered, 1);
    function barsInLines(lines) {
      return lines.reduce(function(sum, line) {
        return sum + extractBarsFromMelodyText(line).length;
      }, 0);
    }
    expect(barsInLines(strain0)).toBe(6);
    expect(barsInLines(strain1)).toBe(2);
    expect(strain1.length).toBe(1);
    expect(strain1[0]).toContain('"G"');
    expect(strain1[0]).not.toContain('"Em"');
  });

  test('wordIndexToNoteIndex maps word positions into note slots', function() {
    expect(wordIndexToNoteIndex(0, 4, 8)).toBe(0);
    expect(wordIndexToNoteIndex(1, 4, 8)).toBe(2);
    expect(wordIndexToNoteIndex(3, 4, 8)).toBe(6);
    expect(wordIndexToNoteIndex(99, 4, 8)).toBe(7);
  });

  test('allocateChordLinesToLyrics pairs 1:1 when chord lines cover every lyric', function() {
    expect(allocateChordLinesToLyrics(2, 2)).toEqual({
      lyricsPerChordLine: 1,
      allocatedChordLines: 2,
      extraChordLines: 0,
      leftoverLyrics: 0,
    });
    expect(allocateChordLinesToLyrics(4, 5)).toEqual({
      lyricsPerChordLine: 1,
      allocatedChordLines: 4,
      extraChordLines: 1,
      leftoverLyrics: 0,
    });
    expect(allocateChordLinesToLyrics(4, 6)).toEqual({
      lyricsPerChordLine: 1,
      allocatedChordLines: 4,
      extraChordLines: 2,
      leftoverLyrics: 0,
    });
  });

  test('allocateChordLinesToLyrics pairs two lyrics per chord line when lyrics outnumber chords', function() {
    expect(allocateChordLinesToLyrics(4, 2)).toEqual({
      lyricsPerChordLine: 2,
      allocatedChordLines: 2,
      extraChordLines: 0,
      leftoverLyrics: 0,
    });
    expect(allocateChordLinesToLyrics(5, 2)).toEqual({
      lyricsPerChordLine: 2,
      allocatedChordLines: 2,
      extraChordLines: 0,
      leftoverLyrics: 1,
    });
    expect(allocateChordLinesToLyrics(4, 3)).toEqual({
      lyricsPerChordLine: 2,
      allocatedChordLines: 2,
      extraChordLines: 1,
      leftoverLyrics: 0,
    });
  });
});
