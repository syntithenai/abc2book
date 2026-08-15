import {
  parsePerformanceSetsFromAbc,
  renderPerformanceSetsToAbc,
  parseDeletedSetsFromAbc,
  comparePerformanceSets,
  buildMergedPerformanceSets,
  createSetTombstone,
  stripPerformanceSetLines,
} from './performanceSetSync';

describe('performanceSetSync', function() {
  test('render and parse performance sets round trip', function() {
    const sets = {
      'set-1': {
        name: 'Friday gig',
        date: '2026-07-02',
        notes: 'Bring capo',
        items: [{ type: 'tune', tuneId: 'tune-a' }],
        updatedAt: 5000,
      },
    };
    const deleted = {
      'set-old': createSetTombstone('set-old', 'Old set', 4000),
    };
    const abc = renderPerformanceSetsToAbc(sets, deleted);
    const parsed = parsePerformanceSetsFromAbc(abc);

    expect(parsed.sets['set-1'].name).toBe('Friday gig');
    expect(parsed.sets['set-1'].updatedAt).toBe(5000);
    expect(parsed.sets['set-1'].items).toEqual([{ type: 'tune', tuneId: 'tune-a' }]);
    expect(parsed.deleted['set-old'].deletedAt).toBe(4000);
  });

  test('stripPerformanceSetLines removes set section from tune book text', function() {
    const abc = 'X:1\nT: Tune\nK:C\n|\n' + renderPerformanceSetsToAbc({
      'set-1': { name: 'Gig', date: '', notes: '', items: [], updatedAt: 1 },
    }, {});
    const stripped = stripPerformanceSetLines(abc);
    expect(stripped).toContain('X:1');
    expect(stripped).not.toContain('% abcbook-performance-sets-begin');
  });

  test('remote delete removes local set on merge', function() {
    const localSets = {
      'set-1': { id: 'set-1', name: 'Local set', updatedAt: 100, items: [] },
    };
    const remoteDeleted = {
      'set-1': createSetTombstone('set-1', 'Local set', 500),
    };
    const result = comparePerformanceSets({
      localSets: localSets,
      localDeleted: {},
      remoteSets: {},
      remoteDeleted: remoteDeleted,
    });
    expect(Object.keys(result.deletes)).toEqual(['set-1']);
  });

  test('buildMergedPerformanceSets applies newer remote update', function() {
    const merged = buildMergedPerformanceSets({
      localSets: {
        'set-1': { id: 'set-1', name: 'Old', updatedAt: 100, items: [] },
      },
      localDeleted: {},
      remoteSets: {
        'set-1': { id: 'set-1', name: 'New', updatedAt: 500, items: [{ type: 'note', text: 'Break' }] },
      },
      remoteDeleted: {},
    });

    expect(merged.changed).toBe(true);
    expect(merged.storageSets['set-1'].name).toBe('New');
    expect(merged.changedNames).toEqual(['New']);
  });

  test('parseDeletedSetsFromAbc reads tombstones outside set section', function() {
    const line = '% abcbook-deleted-set set-x 9000 Deleted set';
    const parsed = parseDeletedSetsFromAbc(line);
    expect(parsed['set-x'].deletedAt).toBe(9000);
    expect(parsed['set-x'].name).toBe('Deleted set');
  });

  test('own-upload echo with stale local updatedAt is not an incoming update', function() {
    const result = comparePerformanceSets({
      localSets: {
        'set-1': { id: 'set-1', name: 'Old', updatedAt: 100, items: [] },
      },
      localDeleted: {},
      remoteSets: {
        'set-1': { id: 'set-1', name: 'New', updatedAt: 500, items: [] },
      },
      remoteDeleted: {},
      lastUpdatedById: { 'set-1': 500 },
    });
    expect(Object.keys(result.updates)).toEqual([]);
    expect(Object.keys(result.inserts)).toEqual([]);
  });

  test('newer other-device set update still flags as incoming', function() {
    const result = comparePerformanceSets({
      localSets: {
        'set-1': { id: 'set-1', name: 'Mine', updatedAt: 500, items: [] },
      },
      localDeleted: {},
      remoteSets: {
        'set-1': { id: 'set-1', name: 'Theirs', updatedAt: 900, items: [] },
      },
      remoteDeleted: {},
      lastUpdatedById: { 'set-1': 500 },
    });
    expect(Object.keys(result.updates)).toEqual(['set-1']);
  });
});
