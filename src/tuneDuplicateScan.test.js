import { scanDuplicateGroups, scanExactContentDuplicates, scanSimilarTitleDuplicates } from './tuneDuplicateScan';

describe('tuneDuplicateScan', function() {
  const getTuneImportHash = function(tune) {
    return tune && tune._hash ? tune._hash : 'default-hash';
  };

  test('finds exact content groups from importhashes', function() {
    const tunes = {
      a: { id: 'a', name: 'Same Song', books: ['book1'] },
      b: { id: 'b', name: 'Same Song', books: ['book2'] },
    };
    tunes.a._hash = 'shared';
    tunes.b._hash = 'shared';
    const tunesHash = { importhashes: { shared: ['a', 'b'] } };
    const groups = scanExactContentDuplicates({ tunes, tunesHash, getTuneImportHash });
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('exactContent');
    expect(groups[0].confidence).toBe('Exact');
    expect(groups[0].tuneIds).toEqual(['a', 'b']);
  });

  test('excludes hash matches with different titles', function() {
    const tunes = {
      a: { id: 'a', name: 'Song A' },
      b: { id: 'b', name: 'Song B' },
    };
    tunes.a._hash = 'shared';
    tunes.b._hash = 'shared';
    const tunesHash = { importhashes: { shared: ['a', 'b'] } };
    const groups = scanExactContentDuplicates({ tunes, tunesHash, getTuneImportHash });
    expect(groups).toHaveLength(0);
  });

  test('finds similar title groups with different hashes', function() {
    const tunes = {
      a: { id: 'a', name: 'The Sally Gardens' },
      b: { id: 'b', name: 'Sally Gardens' },
    };
    tunes.a._hash = 'hash-a';
    tunes.b._hash = 'hash-b';
    const groups = scanSimilarTitleDuplicates({
      tunes,
      getTuneImportHash,
      exactGroupTuneIds: {},
    });
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].kind).toBe('similarTitle');
    expect(groups[0].tuneIds).toContain('a');
    expect(groups[0].tuneIds).toContain('b');
  });

  test('scanDuplicateGroups combines tiers and counts', function() {
    const tunes = {
      a: { id: 'a', name: 'Exact Dup' },
      b: { id: 'b', name: 'Exact Dup' },
      c: { id: 'c', name: 'Wild Rover' },
      d: { id: 'd', name: 'Wild Rover (version)' },
    };
    tunes.a._hash = 'exact';
    tunes.b._hash = 'exact';
    tunes.c._hash = 'c-hash';
    tunes.d._hash = 'd-hash';
    const tunesHash = { importhashes: { exact: ['a', 'b'] } };
    const result = scanDuplicateGroups({ tunes, tunesHash, getTuneImportHash });
    expect(result.exactCount).toBe(1);
    expect(result.similarCount).toBeGreaterThanOrEqual(0);
    expect(result.groups.some(function(g) { return g.kind === 'exactContent'; })).toBe(true);
  });
});
