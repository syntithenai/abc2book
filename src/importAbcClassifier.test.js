import {
  classifyImportAbcResults,
  buildBatchSummaryFromClassifier,
  annotateInsertsWithLibraryMatches,
  shouldShowAbcBatchSummary,
  classifyAbcTextForReview,
} from './importAbcClassifier';

jest.mock('./tuneCollectionMatch', function() {
  return {
    __esModule: true,
    findCollectionMatches: function(options) {
      const title = options && options.title;
      if (title === 'Matched Song') {
        return [{
          tune: { id: 'lib-1', name: 'Matched Song' },
          score: 20,
          confidence: 'Exact',
        }];
      }
      return [];
    },
    matchConfidenceLabel: function() { return ''; },
  };
});

describe('importAbcClassifier', function() {
  test('maps buckets to merge metadata', function() {
    const results = {
      updates: [{ id: 'u1', name: 'Updated', lastUpdated: 2 }],
      localUpdates: [{ id: 'l1', name: 'Local', lastUpdated: 1 }],
      inserts: [{ name: 'New' }],
      duplicates: [{ name: 'Dup' }],
      skippedUpdates: [{ id: 's1', name: 'Same' }],
      deletes: { d1: { id: 'd1', name: 'Gone' } },
    };
    const classified = classifyImportAbcResults(results);
    expect(classified.summary.updates).toBe(1);
    expect(classified.summary.inserts).toBe(1);
    expect(classified.summary.localUpdates).toBe(1);
    expect(classified.summary.duplicates).toBe(1);
    expect(classified.summary.deletes).toBe(1);

    const update = classified.candidates.find(function(c) { return c.tune.id === 'u1'; });
    expect(update.mergeStatus).toBe('exactId');
    expect(update.mergeMode).toBe('direct');
    expect(update.mergeTargetId).toBe('u1');

    const local = classified.candidates.find(function(c) { return c.tune.id === 'l1'; });
    expect(local.mergeMode).toBe('suggestOnly');
    expect(local.warningReason).toBe('localNewer');

    const dup = classified.candidates.find(function(c) { return c.tune.name === 'Dup'; });
    expect(dup.contentHashDuplicate).toBe(true);
    expect(dup.warningReason).toBe('contentHashDuplicate');

    expect(classified.deletes[0].tune.id).toBe('d1');
  });

  test('buildBatchSummaryFromClassifier preserves lists and raw', function() {
    const classified = classifyImportAbcResults({
      inserts: [{ name: 'A' }],
      updates: [],
      localUpdates: [],
      duplicates: [],
      skippedUpdates: [],
      deletes: {},
    });
    const summary = buildBatchSummaryFromClassifier(classified);
    expect(summary.inserts).toHaveLength(1);
    expect(summary.counts.inserts).toBe(1);
    expect(summary.raw).toBe(classified.raw);
  });

  test('annotateInsertsWithLibraryMatches sets titleMatch for Exact hits', function() {
    const classified = classifyImportAbcResults({
      inserts: [{ name: 'Matched Song' }, { name: 'Brand New' }],
      updates: [],
      localUpdates: [],
      duplicates: [],
      skippedUpdates: [],
      deletes: {},
    });
    const annotated = annotateInsertsWithLibraryMatches(classified, {
      'lib-1': { id: 'lib-1', name: 'Matched Song' },
    });
    const matched = annotated.candidates.find(function(c) { return c.tune.name === 'Matched Song'; });
    expect(matched.mergeStatus).toBe('titleMatch');
    expect(matched.mergeTargetId).toBe('lib-1');
    expect(matched.warningReason).toBe('libraryMatch');
    const brandNew = annotated.candidates.find(function(c) { return c.tune.name === 'Brand New'; });
    expect(brandNew.mergeStatus).toBe('new');
    expect(brandNew.mergeTargetId).toBe(null);
    expect(annotated.summary.libraryMatches).toBe(1);
  });

  test('shouldShowAbcBatchSummary is true for multi-tune', function() {
    expect(shouldShowAbcBatchSummary({
      candidates: [{}, {}],
      summary: { inserts: 2 },
    })).toBe(true);
    expect(shouldShowAbcBatchSummary({
      candidates: [{ mergeStatus: 'new' }],
      summary: { inserts: 1 },
    })).toBe(false);
  });

  test('classifyAbcTextForReview uses classifyOnly importAbc', function() {
    let seenOptions = null;
    const tunebook = {
      importAbc: function(abc, forceBook, a, b, c, d, options) {
        seenOptions = options;
        return {
          inserts: [{ name: 'Solo' }],
          updates: [],
          localUpdates: [],
          duplicates: [],
          skippedUpdates: [],
          deletes: {},
        };
      },
    };
    const classified = classifyAbcTextForReview(tunebook, 'X:1\nT:Solo\nK:C\nC');
    expect(seenOptions).toEqual({ classifyOnly: true });
    expect(classified.candidates).toHaveLength(1);
  });
});
