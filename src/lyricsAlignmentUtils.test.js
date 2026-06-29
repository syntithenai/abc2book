import { alignLyricLineLists, buildAlignedLyricRows } from './lyricsAlignmentUtils';

describe('lyricsAlignmentUtils', function() {
  test('builds aligned rows from existing and transcribed lines', function() {
    const rows = buildAlignedLyricRows(['old line'], ['new line']);
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe('changed');
  });

  test('alignLyricLineLists delegates to lyrics diff', function() {
    const diff = alignLyricLineLists(['a'], ['a', 'b']);
    expect(diff.some(function(row) { return row.type === 'added'; })).toBe(true);
  });
});
