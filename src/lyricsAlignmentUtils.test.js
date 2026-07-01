import { alignLyricLineLists, buildAlignedLyricRows } from './lyricsAlignmentUtils';

describe('lyricsAlignmentUtils', function() {
  test('builds aligned rows from existing and transcribed lines', function() {
    const rows = buildAlignedLyricRows(['old line'], ['new line']);
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe('changed');
  });

  test('matches similar lines that are not contiguous', function() {
    const rows = buildAlignedLyricRows(
      ['verse one', 'chorus line', 'verse two'],
      ['intro', 'verse one', 'verse two']
    );
    const matched = rows.filter(function(row) {
      return row.type === 'same' || row.type === 'changed';
    });
    expect(matched.some(function(row) {
      return row.existing === 'verse one' && row.imported === 'verse one';
    })).toBe(true);
    expect(matched.some(function(row) {
      return row.existing === 'verse two' && row.imported === 'verse two';
    })).toBe(true);
  });

  test('alignLyricLineLists delegates to lyrics diff', function() {
    const diff = alignLyricLineLists(['a'], ['a', 'b']);
    expect(diff.some(function(row) { return row.type === 'added'; })).toBe(true);
  });
});
