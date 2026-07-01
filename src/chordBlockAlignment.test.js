/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser';
import useAbcTools from './useAbcTools';
import { splitChordChartIntoBlocks, alignChordBlocksToLyrics, mergeChordsIntoLyricLines } from './chordSheetUtils';

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

    // every block with its own lyric words merges chords inline, including the
    // second verse (distinct words) which reuses the verse chord block.
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[1].inlineChords).toBe(true);
    expect(aligned[2].inlineChords).toBe(true);
    expect(aligned[4].inlineChords).toBe(true);

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
