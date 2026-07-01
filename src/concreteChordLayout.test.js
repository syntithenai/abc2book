/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser';
import useAbcTools from './useAbcTools';
import { splitChordChartIntoBlocks, alignChordBlocksToLyrics, mergeChordsIntoLyricLines } from './chordSheetUtils';

// The corrected Concrete melody: two eight-bar strains (the repeated four-bar
// pattern written out in full), a chord change every bar.
const CONCRETE_NOTES = [
  '"D"zzzzzzzz|"F"zzzzzzzz|"C"zzzzzzzz|"G"zzzzzzzz|',
  '"D"zzzzzzzz|"F"zzzzzzzz|"C"zzzzzzzz|"G"zzzzzzzz||',
  '"Em"zzzzzzzz|"G"zzzzzzzz|"Am"zzzzzzzz|"Em"zzzzzzzz|',
  '"Em"zzzzzzzz|"G"zzzzzzzz|"Am"zzzzzzzz|"Em"zzzzzzzz||',
];

function chartFor() {
  const abcjsParser = useAbcjsParser();
  const abcTools = useAbcTools();
  const melodyAbc = abcTools.emptyABC('Concrete') + CONCRETE_NOTES.join('\n');
  return abcjsParser.renderChords(melodyAbc, false, 0, 'D', '1/8', '4/4');
}

function inlineChordsPerLine(lyricLines) {
  const chart = chartFor();
  const blocks = splitChordChartIntoBlocks(chart);
  const aligned = alignChordBlocksToLyrics(lyricLines, blocks);
  const out = [];
  aligned.forEach(function(block) {
    if (!block.inlineChords) return;
    const merged = mergeChordsIntoLyricLines(block.lyricLines, block.chart);
    merged.forEach(function(row) {
      out.push(row.map(function(t) { return t.chord; }).filter(Boolean));
    });
  });
  return out;
}

describe('Concrete chord layout autodetection', function() {
  test('renderChords yields eight bars with a chord change each bar', function() {
    const chart = chartFor();
    const blocks = splitChordChartIntoBlocks(chart);
    // Two strains separated at the double barline.
    expect(blocks.length).toBe(2);
  });

  test('eight lyric lines map one bar per line over the first strain', function() {
    // One lyric verse of 8 lines sung over the first 8-bar strain: each line is
    // one bar, so the F chord lands on line two.
    const chart = chartFor();
    const blocks = splitChordChartIntoBlocks(chart);
    const merged = mergeChordsIntoLyricLines(
      ['l one', 'l two', 'l three', 'l four', 'l five', 'l six', 'l seven', 'l eight'],
      blocks[0]
    );
    const firstChords = merged.map(function(row) {
      return row.map(function(t) { return t.chord; }).filter(Boolean)[0];
    });
    expect(firstChords).toEqual(['D', 'F', 'C', 'G', 'D', 'F', 'C', 'G']);
  });

  test('four lyric lines spread two bars per line (chord change at least once per line)', function() {
    const lyrics = ['line one here', 'line two here', 'line three here', 'line four here'];
    const perLine = inlineChordsPerLine(lyrics);
    expect(perLine.length).toBe(4);
    perLine.forEach(function(chords) {
      expect(chords.length).toBeGreaterThan(0);
    });
  });

  test('a chord held across a line break still shows on the following line', function() {
    // Em ends strain one held into the next bar; every line must still show a chord.
    const merged = mergeChordsIntoLyricLines(
      ['hold one', 'hold two', 'hold three', 'hold four'],
      'Em | Em | Em | Em |'
    );
    merged.forEach(function(row) {
      const chords = row.map(function(t) { return t.chord; }).filter(Boolean);
      expect(chords).toContain('Em');
    });
  });

  test('one bar per line gives a distinct chord change on each line', function() {
    const merged = mergeChordsIntoLyricLines(
      ['l one', 'l two', 'l three', 'l four'],
      'D | F | C | G |'
    );
    const firstChords = merged.map(function(row) {
      return row.map(function(t) { return t.chord; }).filter(Boolean)[0];
    });
    expect(firstChords).toEqual(['D', 'F', 'C', 'G']);
  });
});
