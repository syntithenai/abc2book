/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser';
import useAbcTools from './useAbcTools';
import { splitMelodyStrainsWithBarlines, buildUnifiedBlocks } from './chordBlockMerge';
import { extractBarsFromMelodyText } from './lyricBarAlignmentUtils';
import { splitChordChartIntoBlocks, alignChordBlocksToLyrics, mergeChordsIntoLyricLines, extractChordBars, formatChordChartForDisplay, formatSectionChartForEditor } from './chordSheetUtils';

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

    // first verse and chorus show charts; later same-type stanzas are revisits
    // (Verse 2 / chorus repeats keep headings but hide duplicate charts).
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
    expect(aligned[2].chart).toBe(aligned[0].chart);

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
    expect(aligned[0].type).toBe('verse');
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

  test('display charts show held chord before mid-bar change', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const melodyAbc = abcTools.emptyABC('MidBarChange')
      + 'M:4/4\nL:1/4\n"D"z z z z| z z "A"z z|';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'D', '1/4', '4/4');
    expect(formatChordChartForDisplay(displayChart)).toBe('D | D A |');
    expect(extractChordBars(displayChart)).toEqual([['D'], ['D', 'A']]);
  });

  test('display charts collapse pulse slots to beats for structure view', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const melodyAbc = abcTools.emptyABC('BeatChange')
      + 'M:4/4\nL:1/8\n"D"z2 z2 z2 z2| z2 z2 z2 "A"z2|';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'D', '1/8', '4/4');
    expect(formatChordChartForDisplay(displayChart)).toBe('D | D / / A |');
  });

  test('display charts carry held chords in compound meter', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const melodyAbc = abcTools.emptyABC('SixEight')
      + 'M:6/8\nL:1/8\n"D"z2 z2 z2| z2 z2 z2| z2 z2 "A"z2|';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'D', '1/8', '6/8');
    expect(formatChordChartForDisplay(displayChart)).toBe('D | / | D A |');
  });

  test('display charts keep 5/4 slash timing when inline [M:] is present', function() {
    const abcjsParser = useAbcjsParser();
    // Mid-tune [M:] after a completed bar (abcjs emits timeSignature there).
    const abc = [
      'X:1',
      'T:FiveFourInline',
      'M:4/4',
      'L:1/4',
      'K:C',
      '"C"z z z z | [M:5/4] "C"z z z "G"z z |',
    ].join('\n');
    const displayChart = abcjsParser.renderChords(abc, false, 0, 'C', '1/4', '4/4');
    expect(displayChart).toContain('[M:5/4]');
    expect(displayChart).toMatch(/\[M:5\/4\]\s+C \/ \/ G \//);
    expect(formatChordChartForDisplay(displayChart)).toBe('C | [M:5/4] C / / G / |');
  });

  test('editor grid omits empty bar before leading |: repeat', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const body = [
      '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|',
      ' |:"Am"a2e2 e2fg|abag e2fg|abaf "Em"g3e|"G"dedB G4|! "Am"a2e2 e2fg|abag e2d2|"Em"B2e2 "G"d2B2|"Am"A4 A4:|',
    ].join('\n');
    const melodyAbc = abcTools.emptyABC('Session Repeat') + body;
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'Am', '1/8', '4/4');
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'Am', '1/8', '4/4');

    expect(extractChordBars(editorChart)[0]).toEqual(['Am']);
    expect(displayChart).toMatch(/^\|:\s*Am/);
    expect(editorChart).not.toMatch(/^\s*\.\s/);
  });

  test('editor grid bar count matches melody per repeat strain', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const body = [
      '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|',
      ' |:"Am"a2e2 e2fg|abag e2fg|abaf "Em"g3e|"G"dedB G4|! "Am"a2e2 e2fg|abag e2d2|"Em"B2e2 "G"d2B2|"Am"A4 A4:|',
    ].join('\n');
    const melodyAbc = abcTools.emptyABC('Session Repeat') + body;
    const noteLines = abcTools.justNotes(melodyAbc).split('\n');
    const strains = splitMelodyStrainsWithBarlines(noteLines);
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'Am', '1/8', '4/4');
    const chartBlocks = splitChordChartIntoBlocks(editorChart);
    expect(chartBlocks.length).toBe(strains.length);
    chartBlocks.forEach(function(block, index) {
      const melodyBars = extractBarsFromMelodyText(strains[index].text).length;
      expect(extractChordBars(block).length).toBe(melodyBars);
    });
  });

  test('display charts emit inline repeats and ending markers', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const melodyAbc = abcTools.emptyABC('Volta')
      + '|: "C"c2 "G"d2 | [1 "Am"e2 "F"f2 :| [2 "G"g2 "C"c2 |]';
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'C', '1/4', '4/4');
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'C', '1/4', '4/4');

    expect(displayChart).toMatch(/\|:/);
    expect(displayChart).toMatch(/:\|/);
    expect(displayChart).toMatch(/\[1/);
    expect(displayChart).toMatch(/\[2/);
    expect(displayChart).not.toMatch(/\|\s+:/);
    expect(displayChart).not.toMatch(/:\s+\|/);
    // Endings stay on the same line(s) — no dedicated ending-only newlines.
    expect(displayChart).not.toMatch(/\n\s*\[1/);
    expect(displayChart).not.toMatch(/\n\s*\[2/);
    expect(formatChordChartForDisplay(displayChart)).toMatch(/\|:.*\[1.*:\|.*\[2/);
    expect(formatChordChartForDisplay(displayChart)).not.toMatch(/\|\s+:|:\s+\|/);
    expect(extractChordBars(displayChart)).toEqual([['C', 'G'], ['Am', 'F'], ['G', 'C']]);
    // Editor grid stays marker-free for merge/edit round-trip.
    expect(editorChart).not.toMatch(/\|:/);
    expect(editorChart).not.toMatch(/\[1/);
  });

  test('buildUnifiedBlocks populates volta metadata and editor shows ABC markers', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const melodyAbc = abcTools.emptyABC('Volta')
      + '|: "C"c2 "G"d2 | [1 "Am"e2 "F"f2 :| [2 "G"g2 "C"c2 |]';
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'C', '1/4', '4/4');
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'C', '1/4', '4/4');
    const built = buildUnifiedBlocks({
      noteLines: abcTools.justNotes(melodyAbc).split('\n'),
      chordChart: editorChart,
      displayChordChart: displayChart,
      defaultMeter: '4/4',
    });
    expect(built.blocks.length).toBeGreaterThan(0);
    const block = built.blocks[0];
    expect(block.endingMarkers.length).toBeGreaterThanOrEqual(2);
    expect(block.displayChart).toMatch(/\[1/);
    const editorText = formatSectionChartForEditor(block);
    expect(editorText).toMatch(/\|:/);
    expect(editorText).toMatch(/\[1/);
    expect(editorText).toMatch(/\[2/);
  });

  test('chords extracted from notation keep ABC system line breaks in the editor', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const noteLines = [
      '"C"c2 d2 | "G"e2 f2 |',
      '"Am"g2 a2 | "F"b2 c2 ||',
    ];
    const melodyAbc = abcTools.emptyABC('LineBreaks') + noteLines.join('\n');
    const editorChart = abcjsParser.renderChords(melodyAbc, true, 0, 'C', '1/4', '4/4');
    const displayChart = abcjsParser.renderChords(melodyAbc, false, 0, 'C', '1/4', '4/4');
    expect(editorChart).toMatch(/\n/);
    const built = buildUnifiedBlocks({
      noteLines: abcTools.justNotes(melodyAbc).split('\n'),
      chordChart: editorChart,
      displayChordChart: displayChart,
      defaultMeter: '4/4',
      defaultNoteLength: '1/4',
    });
    expect(built.blocks.length).toBe(1);
    expect(built.blocks[0].chart).toMatch(/\n/);
    const editorText = formatSectionChartForEditor(built.blocks[0]);
    expect(editorText).toMatch(/\n/);
    expect(editorText.split('\n').filter(Boolean).length).toBeGreaterThan(1);
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
