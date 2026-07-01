import {
  lyricLineHasNoteSpacing,
  countLyricSlotsInNoteLine,
  fitLyricLineToNoteCount,
  applyNoteSpacingToLyrics,
  buildAbcWithNoteSpacing,
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
      wLines: ['Amazing grace'],
    };
    const abc = buildAbcWithNoteSpacing(tune, abcTools);
    expect(abc).toContain('w:');
    expect(abc).toMatch(/-/);
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
      wLines: ['Amazing grace'],
      words: ['Amazing grace'],
    };
    const abc = buildAbcWithNoteSpacing(tune, abcTools, { includeLyrics: false });
    expect(abc).not.toMatch(/^w:/m);
    expect(abc).not.toMatch(/^W:/m);
    expect(abc).toContain('C D E F');
  });
});
