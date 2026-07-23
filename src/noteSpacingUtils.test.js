import {
  lyricLineHasNoteSpacing,
  countLyricSlotsInNoteLine,
  fitLyricLineToNoteCount,
  applyNoteSpacingToLyrics,
  buildAbcWithNoteSpacing,
  resolveNoteAlignedWLines,
  stripEmbeddedChordsFromAbc,
  stripLyricLinesFromAbc,
  flattenAbcNoteLineBreaks,
  flattenTuneNoteLineBreaks,
} from './noteSpacingUtils';
import useAbcTools from './useAbcTools';

describe('noteSpacingUtils', function() {
  test('detects existing ABC note-spacing markers', function() {
    expect(lyricLineHasNoteSpacing('hel- lo world')).toBe(true);
    expect(lyricLineHasNoteSpacing('word~next')).toBe(true);
    expect(lyricLineHasNoteSpacing('skip * note')).toBe(true);
    expect(lyricLineHasNoteSpacing('hold _ note')).toBe(true);
    expect(lyricLineHasNoteSpacing('two  spaces')).toBe(true);
    expect(lyricLineHasNoteSpacing('plain lyric line')).toBe(false);
  });

  test('counts lyric slots from an ABC note line', function() {
    expect(countLyricSlotsInNoteLine('C D E F |', { meter: '4/4', noteLength: '1/8', key: 'C' })).toBe(4);
    expect(countLyricSlotsInNoteLine('z z z z |', { meter: '4/4', noteLength: '1/8', key: 'C' })).toBe(4);
    expect(countLyricSlotsInNoteLine('"F"zzzzzz|"F"zzzzzz|', { meter: '6/8', noteLength: '1/8', key: 'F' })).toBe(12);
  });

  test('splits multi-syllable words to match note count', function() {
    const fitted = fitLyricLineToNoteCount('Amazing grace', 4);
    expect(fitted.split(/\s+/).length).toBe(4);
    expect(fitted).toMatch(/-/);
    expect(fitted.toLowerCase()).toContain('grace');
  });

  test('leaves lines that already have spacing unchanged', function() {
    const existing = 'hel- lo world';
    expect(fitLyricLineToNoteCount(existing, 4)).toBe(existing);
  });

  test('fits a four-word line onto four notes without changing plain words', function() {
    const fitted = fitLyricLineToNoteCount('Amazing grace how sweet', 4);
    expect(fitted).toBe('Amazing grace how sweet');
  });

  test('skips section headers when applying to lyric lists', function() {
    const noteLine = 'C D E F G A B c |';
    const result = applyNoteSpacingToLyrics(
      ['[Verse]', 'Amazing grace how sweet'],
      ['C D E F |', noteLine],
      { meter: '4/4', noteLength: '1/8', key: 'C' }
    );
    expect(result[0]).toBe('[Verse]');
    expect(result[1]).not.toBe('Amazing grace how sweet');
    expect(lyricLineHasNoteSpacing(result[1])).toBe(true);
  });

  test('pads with skipped-note markers when lyrics are shorter than melody', function() {
    const result = fitLyricLineToNoteCount('hi', 4);
    expect(result.split(/\s+/).length).toBe(4);
    expect(result).toContain('*');
  });

  test('buildAbcWithNoteSpacing injects spaced w lines into notation abc', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'spacing-test',
      name: 'Spacing',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      words: ['Amazing grace'],
    };
    const abc = buildAbcWithNoteSpacing(tune, abcTools);
    expect(abc).toContain('w:');
    expect(abc).toMatch(/-/);
    expect(abc).not.toMatch(/^W:/m);
  });

  test('buildNotationWLines prefers chord-sheet boundaries over generic plain lyrics', function() {
    const tune = {
      id: 'boundary-test',
      name: 'Boundary',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { 1: { meta: '', notes: ['C D E F |', 'G A B c |'] } },
      words: ['wrong words here'],
      meta: {
        chordSheetAlignment: [
          {
            header: '[Verse 1]',
            linePairs: [
              { lyricLine: 'First boundary line' },
              { lyricLine: 'Second boundary line' },
            ],
          },
        ],
      },
    };
    const lines = buildAbcWithNoteSpacing(tune, useAbcTools());
    expect(lines).toContain('First~bound');
    expect(lines).toContain('Sec- ond');
    expect(lines).not.toContain('wrong words here');
  });

  test('resolveNoteAlignedWLines uses raw wLines without per-letter fitting', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C2 D2 E2 F2 |'] } },
      words: ['ignored block lyrics'],
      wLines: ['hello world'],
    };
    expect(resolveNoteAlignedWLines(tune)).toEqual(['hello world']);
  });

  test('buildAbcWithNoteSpacing prefers stored note-aligned lyrics', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'spacing-test',
      name: 'Spacing',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      words: ['Amazing grace'],
      wLines: ['A- maz- ing grace'],
    };
    const abc = buildAbcWithNoteSpacing(tune, abcTools);
    expect(abc).toContain('A- maz- ing grace');
    expect(abc).not.toMatch(/^W:/m);
  });

  test('buildAbcWithNoteSpacing omits lyrics when includeLyrics is false', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'spacing-test',
      name: 'Spacing',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      wLines: ['A- maz- ing grace'],
      words: ['Amazing grace'],
    };
    const abc = buildAbcWithNoteSpacing(tune, abcTools, { includeLyrics: false });
    expect(abc).not.toMatch(/^w:/m);
    expect(abc).not.toMatch(/^W:/m);
    expect(abc).toContain('C D E F');
  });

  test('stripEmbeddedChordsFromAbc removes quoted chord symbols from note lines', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:C',
      '"Am"CDEF|"G"ABcd|',
    ].join('\n');
    const stripped = stripEmbeddedChordsFromAbc(abc, abcTools);
    expect(stripped).toContain('CDEF|ABcd|');
    expect(stripped).not.toContain('"Am"');
    expect(stripped).not.toContain('"G"');
    expect(stripped).toContain('K:C');
  });

  test('stripLyricLinesFromAbc removes w: and W: lyric lines', function() {
    const abc = [
      'X:1',
      'T:Test',
      'K:C',
      'CDEF|',
      'w: one two',
      'GABc|',
      'W: After the tune',
    ].join('\n');
    const stripped = stripLyricLinesFromAbc(abc);
    expect(stripped).toContain('CDEF|');
    expect(stripped).toContain('GABc|');
    expect(stripped).not.toMatch(/^w:/im);
    expect(stripped).not.toMatch(/^W:/im);
  });

  test('flattenAbcNoteLineBreaks joins note lines into one continuous flow', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:C',
      'CDEF|',
      'w: one two',
      'GABc|',
      'w: three four',
    ].join('\n');
    const flat = flattenAbcNoteLineBreaks(abc, abcTools);
    expect(flat).toContain('CDEF| GABc|');
    expect(flat).toContain('w: one two three four');
    expect(flat).toContain('K:C');
    expect(flat.split('\n').filter(function(line) {
      return line.trim() && abcTools.isNoteLine(line);
    })).toHaveLength(1);
  });

  test('flattenTuneNoteLineBreaks joins each voice notes array into one line', function() {
    const tune = {
      voices: {
        '1': { meta: '', notes: ['CDEF|', 'GABc|', 'defg|'] },
        '2': { meta: '', notes: ['C2', 'E2'] },
      },
    };
    const flat = flattenTuneNoteLineBreaks(tune);
    expect(flat.voices['1'].notes).toEqual(['CDEF| GABc| defg|']);
    expect(flat.voices['2'].notes).toEqual(['C2 E2']);
    expect(tune.voices['1'].notes).toEqual(['CDEF|', 'GABc|', 'defg|']);
  });
});
