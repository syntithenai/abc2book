import {
  tuneRowsFromTunes,
  mediaRowsFromCandidates,
  mergeSearchListRows,
  getSearchRowKey,
  isMediaSearchRow,
  isTuneSearchRow,
  isSearchSectionHeaderRow,
} from './searchListRows';

describe('searchListRows', function() {
  test('mergeSearchListRows appends media after tunes', function() {
    const tuneRows = tuneRowsFromTunes([{ id: 'a', name: 'Alpha' }], 'alp');
    const mediaRows = mediaRowsFromCandidates([
      { id: '1', title: 'Beta', source: 'device-file', uri: 'content://1' },
    ]);
    const merged = mergeSearchListRows(tuneRows, mediaRows.map(function(row) { return row.candidate; }));
    expect(merged).toHaveLength(3);
    expect(isTuneSearchRow(merged[0])).toBe(true);
    expect(isSearchSectionHeaderRow(merged[1])).toBe(true);
    expect(isMediaSearchRow(merged[2])).toBe(true);
  });

  test('mergeSearchListRows dedupes duplicate media candidates', function() {
    const tuneRows = tuneRowsFromTunes([], '');
    const merged = mergeSearchListRows(tuneRows, [
      {
        source: 'music-collection',
        id: '1',
        title: 'Enter Sandman',
        artist: 'Metallica',
        path: 'Metallica/enter.mp3',
        link: '/music-collection/Metallica/enter.mp3',
      },
      {
        source: 'music-collection',
        id: '2',
        title: 'Enter Sandman (Live)',
        artist: 'Metallica',
        path: 'Metallica/enter-live.mp3',
        link: '/music-collection/Metallica/enter-live.mp3',
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(isSearchSectionHeaderRow(merged[0])).toBe(true);
    expect(isMediaSearchRow(merged[1])).toBe(true);
  });

  test('mergeSearchListRows skips media that matches an existing tune row', function() {
    const tuneRows = tuneRowsFromTunes([
      {
        id: 't1',
        name: 'Enter Sandman',
        composer: 'Metallica',
        links: [{ link: '/music-collection/Metallica/enter.mp3', collectionPath: 'Metallica/enter.mp3' }],
      },
    ], 'enter');
    const merged = mergeSearchListRows(tuneRows, [
      {
        source: 'music-collection',
        id: '2',
        title: 'Enter Sandman',
        artist: 'Metallica',
        path: 'Metallica/enter.mp3',
        link: '/music-collection/Metallica/enter.mp3',
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(isTuneSearchRow(merged[0])).toBe(true);
  });

  test('mergeSearchListRows dedupes diacritic and capitalization variants', function() {
    const merged = mergeSearchListRows([], [
      {
        source: 'music-collection',
        id: '1',
        title: 'Après un rêve',
        artist: 'Fauré',
        path: 'faure/apres.mp3',
      },
      {
        source: 'music-collection',
        id: '2',
        title: 'APRES UN REVE',
        artist: 'faure',
        path: 'faure/apres-alt.mp3',
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(isSearchSectionHeaderRow(merged[0])).toBe(true);
    expect(isMediaSearchRow(merged[1])).toBe(true);
  });

  test('mergeSearchListRows keeps all tunebook rows with diacritic variants', function() {
    const merged = mergeSearchListRows([
      { kind: 'tune', tune: { id: 't1', name: 'Día luna... Día pena', composer: 'Manu Chao' } },
      { kind: 'tune', tune: { id: 't2', name: 'Dia Luna... Dia Pena', composer: 'Manu Chao' } },
      { kind: 'tune', tune: { id: 't3', name: 'La vie à 2', composer: 'Manu Chao' } },
      { kind: 'tune', tune: { id: 't4', name: 'La Vie a 2', composer: 'Manu Chao' } },
    ], []);
    expect(merged).toHaveLength(4);
    expect(isTuneSearchRow(merged[0])).toBe(true);
    expect(isTuneSearchRow(merged[1])).toBe(true);
    expect(isTuneSearchRow(merged[2])).toBe(true);
    expect(isTuneSearchRow(merged[3])).toBe(true);
  });

  test('mergeSearchListRows can omit media when includeMedia is false', function() {
    const tuneRows = tuneRowsFromTunes([{ id: 'a', name: 'Alpha' }], 'alp');
    const merged = mergeSearchListRows(tuneRows, [
      { id: '1', title: 'Beta', source: 'device-file', uri: 'content://1' },
    ], { includeMedia: false });
    expect(merged).toHaveLength(1);
    expect(isTuneSearchRow(merged[0])).toBe(true);
  });

  test('media-only merge produces a single Media Sources section', function() {
    const merged = mergeSearchListRows([], [
      { id: '1', title: 'Beta', source: 'device-file', uri: 'content://1' },
      { id: '2', title: 'Gamma', source: 'youtube', link: 'https://youtu.be/x' },
    ], { includeMedia: true });
    const headers = merged.filter(isSearchSectionHeaderRow);
    expect(headers).toHaveLength(1);
    expect(headers[0].label).toBe('Media Sources');
    expect(merged.filter(isMediaSearchRow)).toHaveLength(2);
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
