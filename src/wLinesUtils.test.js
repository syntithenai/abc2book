import {
  countVoiceNoteLines,
  getBlockLyricLines,
  getInterleavedLyricLines,
  renderBlockLyricsAbc,
  wordsMatchWLines,
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

  test('exports standalone wLines when they fit note lines', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      wLines: ['one two three four'],
    };
    expect(countVoiceNoteLines(tune)).toBe(1);
    expect(getInterleavedLyricLines(tune)).toEqual(['one two three four']);
    expect(getBlockLyricLines(tune)).toEqual([]);
  });

  test('treats oversized wLines-only tunes as block lyrics', function() {
    const tune = {
      voices: { 1: { meta: '', notes: ['|:"G"B2 B>A|'] } },
      wLines: ['line one', 'line two', 'line three'],
    };
    expect(getInterleavedLyricLines(tune)).toEqual([]);
    expect(getBlockLyricLines(tune)).toEqual(['line one', 'line two', 'line three']);
  });
});
