import {
  buildLyricsLineDiff,
  buildDefaultLyricsMergeChoices,
  countLyricsDiffRows,
  lyricsTextsEqual,
  mergeLyricsFromChoices,
} from './lyricsMergeUtils';

describe('lyricsMergeUtils', function() {
  test('detects changed, added, and removed lines', function() {
    const diff = buildLyricsLineDiff('line one\nline two', 'line one\nline 2\nline three');
    expect(countLyricsDiffRows(diff)).toBe(2);
    expect(diff.some(function(row) { return row.type === 'changed'; })).toBe(true);
    expect(diff.some(function(row) { return row.type === 'added'; })).toBe(true);
  });

  test('merges lyrics from per-line choices', function() {
    const diff = buildLyricsLineDiff('old line', 'new line');
    const choices = buildDefaultLyricsMergeChoices(diff);
    choices[diff[0].id] = 'transcribed';
    expect(mergeLyricsFromChoices(diff, choices)).toEqual(['new line']);
  });

  test('compares lyrics text ignoring trailing whitespace per line join', function() {
    expect(lyricsTextsEqual('a\nb', 'a\nb\n')).toBe(true);
    expect(lyricsTextsEqual('a\nb', 'a\nc')).toBe(false);
  });
});
