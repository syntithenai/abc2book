import {
  countVoiceNoteLines,
  ensurePlainWordsFromNoteAlignedLyrics,
  getBlockLyricLines,
  getInterleavedLyricLines,
  getPlainLyricLines,
  getNoteAlignedLyricLines,
  hasExplicitNoteAlignedStorage,
  hasStoredNoteAlignedLyrics,
  wLinesEditorText,
  setPlainLyricLines,
  setNoteAlignedLyricLines,
  stripNoteSpacingFromLine,
  wordsMatchWLines,
  renderBlockLyricsAbc,
} from './wLinesUtils';

describe('wLinesUtils lyric export helpers', function() {
  test('keeps note-aligned wLines separate from block W: lyrics', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['|:"G"B2 B>A|', '|"G"B2 B>A|'] } },
      words: ['Rare bog', 'A rattlin bog'],
      wLines: ['Rare bog', 'A rattlin bog'],
    };
    expect(wordsMatchWLines(tune)).toBe(true);
    expect(getInterleavedLyricLines(tune)).toEqual([]);
    expect(getBlockLyricLines(tune)).toEqual(['Rare bog', 'A rattlin bog']);
    expect(renderBlockLyricsAbc(tune)).toBe('W: Rare bog\nW: A rattlin bog\n');
  });

  test('exports timing scaffold lyrics as interleaved w: lines', function() {
    const tune = {
      timingScaffold: true,
      voices: { 1: { meta: '', notes: ['z z z z |'] } },
      wLines: ['hel- lo world'],
    };
    expect(getInterleavedLyricLines(tune)).toEqual(['hel- lo world']);
    expect(getBlockLyricLines(tune)).toEqual([]);
  });

  test('treats syllable-marked wLines as note-aligned', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      words: ['Amazing grace'],
      wLines: ['A- maz- ing grace'],
    };
    expect(getNoteAlignedLyricLines(tune)).toEqual(['A- maz- ing grace']);
    expect(getInterleavedLyricLines(tune)).toEqual(['A- maz- ing grace']);
    expect(getPlainLyricLines(tune)).toEqual(['Amazing grace']);
  });

  test('treats matching plain wLines as under-staff lyrics', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['CDEFGFED|'] } },
      words: [],
      wLines: ['ooh ahh lah pah poo caw cah coo'],
    };
    expect(getNoteAlignedLyricLines(tune)).toEqual(['ooh ahh lah pah poo caw cah coo']);
    expect(getInterleavedLyricLines(tune)).toEqual(['ooh ahh lah pah poo caw cah coo']);
    expect(getBlockLyricLines(tune)).toEqual([]);
  });

  test('strips syllable markers when recovering plain lyrics from wLines', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      wLines: ['Am- az- ing~grace how sweet'],
    };
    expect(getPlainLyricLines(tune)).toEqual(['Amazing grace how sweet']);
    expect(getNoteAlignedLyricLines(tune)).toEqual(['Am- az- ing~grace how sweet']);
  });

  test('setPlainLyricLines writes words without clearing note-aligned wLines', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      words: [],
      wLines: ['A- maz- ing grace'],
    };
    setPlainLyricLines(tune, ['Amazing grace']);
    expect(tune.words).toEqual(['Amazing grace']);
    expect(tune.wLines).toEqual(['A- maz- ing grace']);
    expect(getPlainLyricLines(tune)).toEqual(['Amazing grace']);
    expect(getNoteAlignedLyricLines(tune)).toEqual(['A- maz- ing grace']);
  });

  test('wLinesEditorText returns raw stored wLines for the editor', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |', 'G A B c |'] } },
      words: ['Amazing grace how sweet'],
      wLines: ['hello world'],
    };
    expect(getNoteAlignedLyricLines(tune)).toEqual([]);
    expect(wLinesEditorText(tune)).toBe('hello world');
  });

  test('setNoteAlignedLyricLines stores per-note-line alignment', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |', 'G A B c |'] } },
      words: ['Amazing grace how sweet'],
      wLines: [],
    };
    setNoteAlignedLyricLines(tune, ['A- maz- ing grace', 'how sweet * *']);
    expect(getNoteAlignedLyricLines(tune)).toEqual(['A- maz- ing grace', 'how sweet * *']);
    expect(getPlainLyricLines(tune)).toEqual(['Amazing grace how sweet']);
  });

  test('cleared note-aligned wLines count as explicit empty storage', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |', 'G A B c |'] } },
      words: ['Amazing grace how sweet'],
      wLines: [],
    };
    setNoteAlignedLyricLines(tune, ['', '']);
    expect(hasExplicitNoteAlignedStorage(tune)).toBe(true);
    expect(hasStoredNoteAlignedLyrics(tune)).toBe(false);
    expect(getNoteAlignedLyricLines(tune)).toEqual(['', '']);
  });

  test('stripNoteSpacingFromLine joins syllables and drops markers', function() {
    expect(stripNoteSpacingFromLine('Am- az- ing grace')).toBe('Amazing grace');
    expect(stripNoteSpacingFromLine('word~next')).toBe('word next');
    expect(stripNoteSpacingFromLine('hi * * *')).toBe('hi');
  });

  test('countVoiceNoteLines sums note lines across voices', function() {
    expect(countVoiceNoteLines({
      voices: {
        1: { notes: ['C D |', 'E F |'] },
        2: { notes: ['G A |'] },
      },
    })).toBe(3);
  });

  test('ensurePlainWordsFromNoteAlignedLyrics fills words from wLines when empty', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E |'] } },
      words: [],
      wLines: ['Hel- lo world'],
    };
    expect(ensurePlainWordsFromNoteAlignedLyrics(tune)).toBe(true);
    expect(tune.words).toEqual(['Hello world']);
    expect(tune.wLines).toEqual(['Hel- lo world']);
  });

  test('ensurePlainWordsFromNoteAlignedLyrics does not overwrite existing words', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E |'] } },
      words: ['Autofilled lyrics'],
      wLines: ['Hel- lo world'],
    };
    expect(ensurePlainWordsFromNoteAlignedLyrics(tune)).toBe(false);
    expect(tune.words).toEqual(['Autofilled lyrics']);
    expect(tune.wLines).toEqual(['Hel- lo world']);
  });
});
