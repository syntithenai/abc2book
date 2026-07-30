import {
  tuneRowsFromTunes,
  mediaRowsFromCandidates,
  mergeSearchListRows,
  getSearchRowKey,
  isMediaSearchRow,
  isTuneSearchRow,
} from './searchListRows';

describe('searchListRows', function() {
  test('mergeSearchListRows appends media after tunes', function() {
    const tuneRows = tuneRowsFromTunes([{ id: 'a', name: 'Alpha' }], 'alp');
    const mediaRows = mediaRowsFromCandidates([
      { id: '1', title: 'Beta', source: 'device-file', uri: 'content://1' },
    ]);
    const merged = mergeSearchListRows(tuneRows, mediaRows.map(function(row) { return row.candidate; }));
    expect(merged).toHaveLength(2);
    expect(isTuneSearchRow(merged[0])).toBe(true);
    expect(isMediaSearchRow(merged[1])).toBe(true);
  });

  test('getSearchRowKey distinguishes media and tune rows', function() {
    const tuneKey = getSearchRowKey({ kind: 'tune', tune: { id: 't1' } }, 0);
    const mediaKey = getSearchRowKey({
      kind: 'media',
      candidate: { source: 'device-file', uri: 'content://1', title: 'Song' },
    }, 1);
    expect(tuneKey).toContain('tune:t1');
    expect(mediaKey).toContain('media:device-file');
  });
});
