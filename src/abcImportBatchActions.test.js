import {
  isUncertainAbcCandidate,
  filterCertainImportRaw,
  uncertainCandidatesForReview,
  reviewCandidatesFromBatch,
  certainApplyCounts,
  applyCertainFromAbcBatch,
} from './abcImportBatchActions';

describe('abcImportBatchActions', function() {
  test('isUncertainAbcCandidate flags local-newer and library matches', function() {
    expect(isUncertainAbcCandidate({
      mergeStatus: 'exactId',
      mergeMode: 'direct',
    })).toBe(false);
    expect(isUncertainAbcCandidate({
      mergeStatus: 'new',
      mergeTargetId: null,
    })).toBe(false);
    expect(isUncertainAbcCandidate({
      mergeStatus: 'exactId',
      mergeMode: 'suggestOnly',
      warningReason: 'localNewer',
    })).toBe(true);
    expect(isUncertainAbcCandidate({
      mergeStatus: 'titleMatch',
      mergeTargetId: 'x',
      warningReason: 'libraryMatch',
    })).toBe(true);
    expect(isUncertainAbcCandidate({
      contentHashDuplicate: true,
      warningReason: 'contentHashDuplicate',
    })).toBe(true);
  });

  test('filterCertainImportRaw drops localUpdates, duplicates, and library-matched inserts', function() {
    const raw = {
      updates: [{ id: 'u1', name: 'U' }],
      inserts: [
        { id: 'i1', name: 'New' },
        { name: 'Matched' },
      ],
      localUpdates: [{ id: 'l1', name: 'L' }],
      duplicates: [{ name: 'Dup' }],
      skippedUpdates: [{ id: 's1', name: 'S' }],
      deletes: {},
    };
    const candidates = [
      { mergeStatus: 'exactId', mergeMode: 'direct', tune: { id: 'u1', name: 'U' } },
      { mergeStatus: 'new', mergeTargetId: null, tune: { id: 'i1', name: 'New' } },
      {
        mergeStatus: 'titleMatch',
        mergeTargetId: 'lib1',
        warningReason: 'libraryMatch',
        tune: { name: 'Matched' },
      },
      {
        mergeStatus: 'exactId',
        mergeMode: 'suggestOnly',
        warningReason: 'localNewer',
        tune: { id: 'l1', name: 'L' },
      },
    ];
    const filtered = filterCertainImportRaw(raw, candidates);
    expect(filtered.updates).toHaveLength(1);
    expect(filtered.inserts).toHaveLength(1);
    expect(filtered.inserts[0].name).toBe('New');
    expect(filtered.localUpdates).toEqual([]);
    expect(filtered.duplicates).toEqual([]);
    expect(filtered.skippedUpdates).toEqual([]);
  });

  test('uncertainCandidatesForReview returns only uncertain rows', function() {
    const batch = {
      candidates: [
        { mergeStatus: 'exactId', mergeMode: 'direct', tune: { id: 'u1' } },
        { mergeStatus: 'new', tune: { name: 'N' } },
        {
          mergeStatus: 'titleMatch',
          mergeTargetId: 'x',
          warningReason: 'libraryMatch',
          tune: { name: 'M' },
        },
        {
          warningReason: 'upToDate',
          mergeStatus: 'exactId',
          tune: { id: 's1' },
        },
      ],
    };
    const uncertain = uncertainCandidatesForReview(batch);
    expect(uncertain).toHaveLength(1);
    expect(uncertain[0].warningReason).toBe('libraryMatch');
  });

  test('reviewCandidatesFromBatch can include certain when onlyUncertain false', function() {
    const batch = {
      candidates: [
        { mergeStatus: 'exactId', mergeMode: 'direct', tune: { id: 'u1' } },
        { mergeStatus: 'new', tune: { name: 'N' } },
      ],
    };
    expect(reviewCandidatesFromBatch(batch, { onlyUncertain: false })).toHaveLength(2);
  });

  test('applyCertainFromAbcBatch calls applyImportData with filtered raw', async function() {
    const applied = [];
    const tunebook = {
      applyImportData: function(data) {
        applied.push(data);
        return Promise.resolve({});
      },
    };
    const batchSummary = {
      raw: {
        updates: [{ id: 'u1', name: 'U' }],
        inserts: [{ name: 'New' }],
        localUpdates: [{ id: 'l1' }],
        duplicates: [],
        skippedUpdates: [],
        deletes: {},
      },
      candidates: [
        { mergeStatus: 'exactId', mergeMode: 'direct', tune: { id: 'u1', name: 'U' } },
        { mergeStatus: 'new', tune: { name: 'New' } },
        {
          mergeStatus: 'exactId',
          mergeMode: 'suggestOnly',
          warningReason: 'localNewer',
          mergeTargetId: 'l1',
          tune: { id: 'l1' },
        },
      ],
    };
    const outcome = await applyCertainFromAbcBatch(tunebook, batchSummary);
    expect(applied).toHaveLength(1);
    expect(applied[0].updates).toHaveLength(1);
    expect(applied[0].inserts).toHaveLength(1);
    expect(applied[0].localUpdates).toEqual([]);
    expect(outcome.applied.updates).toBe(1);
    expect(outcome.applied.inserts).toBe(1);
    expect(outcome.remaining).toHaveLength(1);
    expect(certainApplyCounts(applied[0]).updates).toBe(1);
  });
});
