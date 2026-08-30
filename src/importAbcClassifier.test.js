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
      const library = (options && options.tunes) || {};
      if (title === 'Matched Song' && library['lib-1']) {
        return [{
          tune: library['lib-1'],
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

  test('annotateInsertsWithLibraryMatches ignores title match when lyrics differ', function() {
    const classified = classifyImportAbcResults({
      inserts: [{
        name: 'Matched Song',
        words: [
          "I've been a wild rover for many a year",
          "And I've spent all my money on whiskey and beer",
          'And now I am returning with gold in great store',
          "And I never will play the wild rover no more",
        ],
      }],
      updates: [],
      localUpdates: [],
      duplicates: [],
      skippedUpdates: [],
      deletes: {},
    });
    const annotated = annotateInsertsWithLibraryMatches(classified, {
      'lib-1': {
        id: 'lib-1',
        name: 'Matched Song',
        words: [
          'As I was going over the far famed Kerry mountains',
          'I met with Captain Farrell and his money he was counting',
          'I first produced my pistol and I then produced my rapier',
          'I said stand and deliver or the devil he may take ya',
        ],
      },
    });
    const candidate = annotated.candidates[0];
    expect(candidate.mergeStatus).toBe('new');
    expect(candidate.mergeTargetId).toBe(null);
  });

  test('annotateInsertsWithLibraryMatches ignores high-score unrelated titles', function() {
    const classified = classifyImportAbcResults({
      inserts: [{ name: 'A Flag Of Our Own' }],
      updates: [],
      localUpdates: [],
      duplicates: [],
      skippedUpdates: [],
      deletes: {},
    });
    const annotated = annotateInsertsWithLibraryMatches(classified, {
      'lib-1': { id: 'lib-1', name: "Maggie Brown's Favourite" },
    });
    const candidate = annotated.candidates[0];
    expect(candidate.mergeStatus).toBe('new');
    expect(candidate.mergeTargetId).toBe(null);
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

  test('shouldShowAbcBatchSummary is true for single update (existing library)', function() {
    expect(shouldShowAbcBatchSummary({
      candidates: [{ mergeStatus: 'exactId', mergeMode: 'direct', mergeTargetId: 't1' }],
      summary: { updates: 1, inserts: 0 },
    })).toBe(true);
    expect(shouldShowAbcBatchSummary({
      candidates: [{ mergeStatus: 'exactId', warningReason: 'localNewer' }],
      summary: { localUpdates: 1 },
    })).toBe(true);
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
    expect(seenOptions).toEqual({ classifyOnly: true, personalFieldPolicy: 'preserveLocal' });
    expect(classified.candidates).toHaveLength(1);
  });
});
