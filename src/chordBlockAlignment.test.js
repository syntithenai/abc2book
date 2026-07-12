/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser';
import useAbcTools from './useAbcTools';
import { splitChordChartIntoBlocks, alignChordBlocksToLyrics, mergeChordsIntoLyricLines, extractChordBars, formatChordChartForDisplay } from './chordSheetUtils';

// Mirrors the real data shape: a chord scaffold built from z-rests with the
// melody divided into sections by double barlines (||), plus clean lyrics that
// carry [Section] headers but no inline chords.
const VERSE = '"F"zzzzzz|"F"zzzzzz|"Bb"zzzzzz|"F"zzzzzz||';
const CHORUS = '"C"zzzzzz|"C"zzzzzz|"Bb"zzzzzz|"Bb"zzzzzz||';
const BRIDGE = '"Gm"zzzzzz|"C"zzzzzz|"F"zzzzzz|';

function chartFor(notesLines) {
  const abcjsParser = useAbcjsParser();
  const abcTools = useAbcTools();
  const melodyAbc = abcTools.emptyABC('Test') + notesLines.join('\n');
  return abcjsParser.renderChords(melodyAbc, false, 0, 'F', '1/8', '6/8');
}

describe('chord block alignment against melody double barlines', function() {
  test('renderChords separates sections at double barlines', function() {
    const chart = chartFor([VERSE, CHORUS, BRIDGE]);
    const blocks = splitChordChartIntoBlocks(chart);
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toContain('F');
    expect(blocks[0]).toContain('Bb');
    expect(blocks[1]).toContain('C');
    expect(blocks[2]).toContain('Gm');
  });

  test('repeated verse/chorus reuse the matching chord block; all lyrics kept', function() {
    const chart = chartFor([VERSE, CHORUS, BRIDGE]);
    const blocks = splitChordChartIntoBlocks(chart);
    const lyrics = [
      '[Verse 1]', 'verse one line a', 'verse one line b', '',
      '[Chorus]', 'chorus line', '',
      '[Verse 2]', 'verse two line a', '',
      '[Chorus]', 'chorus line again', '',
      '[Bridge]', 'bridge line',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, blocks);

    expect(aligned.length).toBe(5);
    expect(aligned[0].type).toBe('verse');
    expect(aligned[2].type).toBe('verse');
    expect(aligned[0].chart).toBe(aligned[2].chart);
    expect(aligned[1].chart).toBe(aligned[3].chart);
    expect(aligned[0].chart).not.toBe(aligned[1].chart);
    expect(aligned[4].type).toBe('bridge');
    expect(aligned[4].chart).toContain('Gm');

    // first verse and chorus merge inline; second verse reuses verse chords
    // (structure shows title only via chartRevisit; lyrics still merge inline).
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[0].chartRevisit).toBe(false);
    expect(aligned[1].inlineChords).toBe(true);
    expect(aligned[1].chartRevisit).toBe(false);
    expect(aligned[2].inlineChords).toBe(true);
    expect(aligned[2].chartRevisit).toBe(true);
    expect(aligned[4].inlineChords).toBe(true);
    expect(aligned[4].chartRevisit).toBe(false);

    const verseInline = mergeChordsIntoLyricLines(aligned[0].lyricLines, aligned[0].chart);
    expect(verseInline.flat().some(function(t) { return t.chord; })).toBe(true);
    const verseTwoInline = mergeChordsIntoLyricLines(aligned[2].lyricLines, aligned[2].chart);
    expect(verseTwoInline.flat().some(function(t) { return t.chord; })).toBe(true);

    // no words dropped
    expect(aligned[0].lyricLines).toEqual(['verse one line a', 'verse one line b']);
    expect(aligned[2].lyricLines).toEqual(['verse two line a']);
  });

  test('splits a four-bar melody line across two two-bar lyric lines', function() {
    // The bridge case: one ABC chart line holds four bars, but each sung line
    // is only two bars. The second-half chords must land on the second lyric
    // line, not bleed onto the first.
    const chart = 'Fm | Am | Em | F |';
    const merged = mergeChordsIntoLyricLines(
      ['Poseidon probly weren\'t the best of daddies',
       'to learn the skills to really think things through'],
      chart
    );
    const line0Chords = merged[0].map(function(t) { return t.chord; }).filter(Boolean);
    const line1Chords = merged[1].map(function(t) { return t.chord; }).filter(Boolean);
    expect(line0Chords).toEqual(['Fm', 'Am']);
    expect(line1Chords).toEqual(['Em', 'F']);
    expect(line0Chords).not.toContain('Em');
  });

  test('eight-bar notes line spreads across four hymn lyric lines', function() {
    // Angels We Have Heard: one ABC notes/chart line holds the whole verse.
    const chart = 'G | | | D G | G | | | D G |';
    const merged = mergeChordsIntoLyricLines(
      [
        'Angels we have heard on high',
        'Sweetly singing o\'er the plains,',
        'And the mountains in reply',
        'Echoing their joyous strains.',
      ],
      chart
    );
    expect(merged.length).toBe(4);
    const perLine = merged.map(function(row) {
      return row.map(function(t) { return t.chord; }).filter(Boolean);
    });
    // Two bars per sung line: open on G, cadence D G on the even lines.
    expect(perLine[0][0]).toBe('G');
    expect(perLine[0]).not.toContain('D');
    expect(perLine[1].some(function(c) { return c.indexOf('D') !== -1; })).toBe(true);
    expect(perLine[2][0]).toBe('G');
    expect(perLine[2].join(' ')).not.toMatch(/^D/);
    expect(perLine[3].some(function(c) { return c.indexOf('D') !== -1; })).toBe(true);
  });

  test('untyped verse before [Chorus] gets the first chart when |: splits strains', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const notes = [
      '"G"B2 B2 B2 d2 | d2>c2 B4 | B2 A2 B2 d2 | "D"B2>A2 "G"G4 |"G"B2 B2 B2 d2 | d2>c2 B4 | B2 A2 B2 d2 | "D"B2>A2 "G"G4 |',
      '|:("G"d4 "C"edcB | "C"c4 "D"dcBA | "G"B4 "C"cBAG | "D"A2>)D2 D4 | "G"G2 A2 B2 c2 | [1 "D"B4 A4 :| [2 "D"(B4 A4) | "G"G8 |]',
    ];
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC('Angels') + notes.join('\n'),
      false, 0, 'G', '1/4', '4/4'
    );
    const blocks = splitChordChartIntoBlocks(chart);
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const lyrics = [
      'Angels we have heard on high',
      'Sweetly singing o\'er the plains,',
      'And the mountains in reply',
      'Echoing their joyous strains.',
      '',
      '[Chorus]',
      'Gloria in excelsis Deo.',
      'Gloria in excelsis Deo.',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, blocks);
    expect(aligned[0].type).toBe(null);
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[1].type).toBe('chorus');
    expect(aligned[1].inlineChords).toBe(true);
    expect(aligned[0].chart).not.toBe(aligned[1].chart);

    const verseMerged = mergeChordsIntoLyricLines(aligned[0].lyricLines, aligned[0].chart);
    expect(verseMerged.length).toBe(4);
    expect(verseMerged[0].some(function(t) { return t.chord === 'G'; })).toBe(true);
    expect(verseMerged[0].every(function(t) { return t.chord.indexOf('C') === -1; })).toBe(true);
  });

  test('holds a chord across bars without repeating or leaking it forward', function() {
    // Fm held for the whole first sung line (two bars), Am for the second.
    const chart = 'Fm | Fm | Am | Am |';
    const merged = mergeChordsIntoLyricLines(
      ['first line here now', 'second line over there'],
      chart
    );
    expect(merged[0].map(function(t) { return t.chord; }).filter(Boolean)).toEqual(['Fm']);
    expect(merged[1].map(function(t) { return t.chord; }).filter(Boolean)).toEqual(['Am']);
  });

  test('display charts omit the anacrusis bar', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    // Quarter-note pickup into a full bar, then another full bar.
    const melodyAbc = abcTools.emptyABC('Pickup')
      + '"G"G2 | "C"c2 d2 e2 f2 | "G"g4 g4 |';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'C', '1/8', '4/4');
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'C', '1/8', '4/4');

    expect(extractChordBars(displayChart)).toEqual([['C'], ['G']]);
    expect(formatChordChartForDisplay(displayChart)).toBe('C | G |');
    // Editor grid still includes the pickup so it remains editable.
    expect(extractChordBars(editorChart)[0]).toEqual(['G']);
    expect(extractChordBars(editorChart).length).toBe(3);
  });

  test('display charts keep a full first bar', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const melodyAbc = abcTools.emptyABC('NoPickup')
      + '"C"c2 d2 e2 f2 | "G"g4 g4 |';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'C', '1/8', '4/4');
    expect(extractChordBars(displayChart)).toEqual([['C'], ['G']]);
  });

  test('display charts keep rest-only bars and omit bars with no notes', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    // Middle bar is rests only (held chord → empty chart slot, still a real bar).
    // Trailing empty barlines have no notes or rests and must not appear.
    const melodyAbc = abcTools.emptyABC('RestsAndEmpty')
      + '"C"c2 d2 e2 f2 | z8 | "G"g4 g4 | | |';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'C', '1/8', '4/4');
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'C', '1/8', '4/4');

    expect(extractChordBars(displayChart)).toEqual([['C'], [], ['G']]);
    expect(formatChordChartForDisplay(displayChart)).toBe('C | / | G |');
    // Editor grid still includes empty slots for editing.
    expect(extractChordBars(editorChart).length).toBeGreaterThan(3);
  });

  test('chords do not leak across lyric line boundaries (line-for-line chart)', function() {
    // two chart lines, two lyric lines: each lyric line gets only its own
    // chords rather than a chord from the next line bleeding onto this one.
    const chart = 'Fm | Am |\nEm | F |';
    const merged = mergeChordsIntoLyricLines(
      ['Poseidon probly weren\'t the best of daddies', 'to learn the skills to really think things through'],
      chart
    );
    const line0Chords = merged[0].map(function(t) { return t.chord; }).filter(Boolean).join(' ');
    const line1Chords = merged[1].map(function(t) { return t.chord; }).filter(Boolean).join(' ');
    expect(line0Chords).toContain('Fm');
    expect(line0Chords).toContain('Am');
    expect(line0Chords).not.toContain('Em');
    expect(line1Chords).toContain('Em');
    expect(line1Chords).toContain('F');
    expect(line1Chords).not.toContain('Am');
  });
});
