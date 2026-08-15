import {
  parsePracticeListsFromAbc,
  renderPracticeListsToAbc,
  comparePracticeLists,
  buildMergedPracticeLists,
  createPracticeListTombstone,
  stripPracticeListLines,
} from './practiceListSync';

describe('practiceListSync', function() {
  test('render and parse practice lists round trip', function() {
    const practiceLists = {
      'pl-1': {
        name: 'Morning practice',
        tuneIds: ['tune-a', 'tune-b'],
        updatedAt: 5000,
      },
    };
    const deleted = {
      'pl-old': createPracticeListTombstone('pl-old', 'Old list', 4000),
    };
    const abc = renderPracticeListsToAbc(practiceLists, deleted);
    const parsed = parsePracticeListsFromAbc(abc);

    expect(parsed.practiceLists['pl-1'].name).toBe('Morning practice');
    expect(parsed.practiceLists['pl-1'].updatedAt).toBe(5000);
    expect(parsed.practiceLists['pl-1'].tuneIds).toEqual(['tune-a', 'tune-b']);
    expect(parsed.deleted['pl-old'].deletedAt).toBe(4000);
  });

  test('stripPracticeListLines removes practice list section from tune book text', function() {
    const abc = 'X:1\nT: Tune\nK:C\n|\n' + renderPracticeListsToAbc({
      'pl-1': { name: 'List', tuneIds: [], updatedAt: 1 },
    }, {});
    const stripped = stripPracticeListLines(abc);
    expect(stripped).toContain('X:1');
    expect(stripped).not.toContain('% abcbook-practice-lists-begin');
  });

  test('buildMergedPracticeLists applies newer remote update', function() {
    const merged = buildMergedPracticeLists({
      localPracticeLists: {
        'pl-1': { id: 'pl-1', name: 'Old', updatedAt: 100, tuneIds: ['a'] },
      },
      localDeleted: {},
      remotePracticeLists: {
        'pl-1': { id: 'pl-1', name: 'New', updatedAt: 500, tuneIds: ['a', 'b'] },
      },
      remoteDeleted: {},
    });

    expect(merged.changed).toBe(true);
    expect(merged.storagePracticeLists['pl-1'].name).toBe('New');
    expect(merged.changedNames).toEqual(['New']);
  });

  test('remote delete removes local practice list on compare', function() {
    const localPracticeLists = {
      'pl-1': { id: 'pl-1', name: 'Local list', updatedAt: 100, tuneIds: ['a'] },
    };
    const remoteDeleted = {
      'pl-1': createPracticeListTombstone('pl-1', 'Local list', 500),
    };
    const result = comparePracticeLists({
      localPracticeLists: localPracticeLists,
      localDeleted: {},
      remotePracticeLists: {},
      remoteDeleted: remoteDeleted,
    });
    expect(Object.keys(result.deletes)).toEqual(['pl-1']);
  });

  test('own-upload echo with stale local updatedAt is not an incoming update', function() {
    const result = comparePracticeLists({
      localPracticeLists: {
        'pl-1': { id: 'pl-1', name: 'Old', updatedAt: 100, tuneIds: ['a'] },
      },
      localDeleted: {},
      remotePracticeLists: {
        'pl-1': { id: 'pl-1', name: 'New', updatedAt: 500, tuneIds: ['a'] },
      },
      remoteDeleted: {},
      lastUpdatedById: { 'pl-1': 500 },
    });
    expect(Object.keys(result.updates)).toEqual([]);
    expect(Object.keys(result.inserts)).toEqual([]);
  });

  test('newer other-device practice list update still flags as incoming', function() {
    const result = comparePracticeLists({
      localPracticeLists: {
        'pl-1': { id: 'pl-1', name: 'Mine', updatedAt: 500, tuneIds: ['a'] },
      },
      localDeleted: {},
      remotePracticeLists: {
        'pl-1': { id: 'pl-1', name: 'Theirs', updatedAt: 900, tuneIds: ['a'] },
      },
      remoteDeleted: {},
      lastUpdatedById: { 'pl-1': 500 },
    });
    expect(Object.keys(result.updates)).toEqual(['pl-1']);
  });
});
