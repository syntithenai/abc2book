import { scanDuplicateGroups, scanExactContentDuplicates, scanSimilarTitleDuplicates, filterDuplicateGroupsByName } from './tuneDuplicateScan';
import {
  dismissDuplicateGroup,
  isDuplicatePairDismissed,
} from './tuneDuplicateDismissals';

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

  test('does not group unrelated all-prefix titles', function() {
    const tunes = {
      a: { id: 'a', name: 'All Through The Night', books: ['christmas songs'] },
      b: { id: 'b', name: 'All or nothing at all', books: ['songs'] },
      c: { id: 'c', name: 'All the World is Green', books: ['songs'] },
      d: { id: 'd', name: 'All The Good Times', books: ['canberra pickers and fiddlers', 'songs'] },
    };
    tunes.a._hash = 'hash-a';
    tunes.b._hash = 'hash-b';
    tunes.c._hash = 'hash-c';
    tunes.d._hash = 'hash-d';
    const result = scanDuplicateGroups({ tunes, tunesHash: {}, getTuneImportHash });
    const groupedIds = {};
    result.groups.forEach(function(group) {
      (group.tuneIds || []).forEach(function(id) {
        groupedIds[id] = true;
      });
    });
    expect(groupedIds.a).toBeFalsy();
    expect(groupedIds.b).toBeFalsy();
    expect(groupedIds.c).toBeFalsy();
    expect(groupedIds.d).toBeFalsy();
  });

  test('filterDuplicateGroupsByName matches group label and tune titles', function() {
    const groups = [
      {
        id: 'g1',
        label: 'Wild Rover',
        tunes: [{ id: 'a', tune: { id: 'a', name: 'Wild Rover' } }],
      },
      {
        id: 'g2',
        label: 'Two variants',
        tunes: [
          { id: 'b', tune: { id: 'b', name: 'After the Battle of Aughrim' } },
          { id: 'c', tune: { id: 'c', name: 'Another Tune' } },
        ],
      },
    ];
    expect(filterDuplicateGroupsByName(groups, 'aughrim')).toHaveLength(1);
    expect(filterDuplicateGroupsByName(groups, 'aughrim')[0].id).toBe('g2');
    expect(filterDuplicateGroupsByName(groups, 'wild')).toHaveLength(1);
    expect(filterDuplicateGroupsByName(groups, '')).toHaveLength(2);
  });
});

describe('tuneDuplicateScan dismissals', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  const getTuneImportHash = function(tune) {
    return tune && tune._hash ? tune._hash : 'default-hash';
  };

  test('similar title group disappears after keep separate', function() {
    const tunes = {
      a: { id: 'a', name: 'The Sally Gardens', _hash: 'hash-a' },
      b: { id: 'b', name: 'Sally Gardens', _hash: 'hash-b' },
    };
    let groups = scanSimilarTitleDuplicates({ tunes, getTuneImportHash, exactGroupTuneIds: {} });
    expect(groups.length).toBeGreaterThanOrEqual(1);
    dismissDuplicateGroup(['a', 'b'], getTuneImportHash, tunes);
    expect(isDuplicatePairDismissed('a', 'b', 'hash-a', 'hash-b')).toBe(true);
    groups = scanSimilarTitleDuplicates({ tunes, getTuneImportHash, exactGroupTuneIds: {} });
    expect(groups).toHaveLength(0);
  });

  test('exact content group disappears after keep separate', function() {
    const tunes = {
      a: { id: 'a', name: 'Same Song', _hash: 'shared' },
      b: { id: 'b', name: 'Same Song', _hash: 'shared' },
    };
    const tunesHash = { importhashes: { shared: ['a', 'b'] } };
    let groups = scanExactContentDuplicates({ tunes, tunesHash, getTuneImportHash });
    expect(groups).toHaveLength(1);
    dismissDuplicateGroup(['a', 'b'], getTuneImportHash, tunes);
    groups = scanExactContentDuplicates({ tunes, tunesHash, getTuneImportHash });
    expect(groups).toHaveLength(0);
  });

  test('empty fingerprint dismissal still hides group on rescan', function() {
    const tunes = {
      a: { id: 'a', name: 'The Sally Gardens', _hash: 'hash-a' },
      b: { id: 'b', name: 'Sally Gardens', _hash: 'hash-b' },
    };
    dismissDuplicateGroup(['a', 'b'], function() { return ''; }, tunes);
    const groups = scanSimilarTitleDuplicates({ tunes, getTuneImportHash, exactGroupTuneIds: {} });
    expect(groups).toHaveLength(0);
  });
});
