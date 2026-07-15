import {
  createImportReviewSession,
  createBlankAddCandidate,
  advanceReviewStep,
  markCandidateImported,
  beginMergeForCandidateIndex,
  beginEnrichmentPhase,
  deferCandidateForEnhancement,
  skipYoutubeAllRemaining,
  isReviewComplete,
  shouldSkipYoutubeStep,
  youtubeUrlFromCandidate,
  candidateNeedsEnrichmentOptIn,
  emptySessionSummary,
  navigateReviewCandidate,
  cancelCurrentCandidate,
  markAllCandidatesImported,
  isAddTunesChrome,
  asImportReviewChrome,
  ensureBlankAddSession,
  removeAddDraftFromSession,
  coalesceSessionCandidatesByMergeTarget,
  foldIncomingCandidate,
  removeImportReviewCandidatesByFieldLookupJobId,
  appendImportReviewCandidates,
} from './importReviewSession';
import {
  createEnrichmentJob,
  skipEnrichmentJob,
  startEnrichmentJob,
  enrichmentSummary,
} from './importReviewEnrichmentQueue';

describe('importReviewSession', function() {
  test('createImportReviewSession starts at unified review step', function() {
    const session = createImportReviewSession([{
      tune: { name: 'A' },
      mergeTargetId: 'existing-1',
      contentHashDuplicate: true,
    }]);
    expect(session.step).toBe('review');
    expect(session.phase).toBe('identify');
    expect(session.sessionSummary).toEqual(emptySessionSummary());
    expect(session.entryMode).toBe('import');
  });

  test('createBlankAddCandidate seeds empty manual draft', function() {
    const candidate = createBlankAddCandidate({ book: 'Session', tags: ['slow'] });
    expect(candidate.sourceKind).toBe('manual');
    expect(candidate.tune.books).toEqual(['session']);
    expect(candidate.tune.tags).toEqual(['slow']);
    expect(candidate.tune.voices['1'].notes).toEqual([]);
  });

  test('isAddTunesChrome follows entryMode', function() {
    const blank = createImportReviewSession([createBlankAddCandidate({ book: 'x' })], { entryMode: 'add' });
    expect(isAddTunesChrome(blank)).toBe(true);
    expect(blank.candidates[0].addDraft).toBe(true);
    const imported = createImportReviewSession([{ tune: { name: 'A' }, sourceKind: 'abc' }], { entryMode: 'add' });
    expect(isAddTunesChrome(imported)).toBe(true);
    const multi = createImportReviewSession([
      createBlankAddCandidate({}),
      { tune: { name: 'B' }, sourceKind: 'abc' },
    ], { entryMode: 'add' });
    expect(isAddTunesChrome(multi)).toBe(true);
    const reviewOnly = createImportReviewSession([{ tune: { name: 'A' }, sourceKind: 'abc' }]);
    expect(isAddTunesChrome(reviewOnly)).toBe(false);
  });

  test('ensureBlankAddSession parks review candidates beside a new Add draft', function() {
    const review = createImportReviewSession([{
      id: 'review-1',
      tune: { name: 'Prior' },
      sourceKind: 'manual',
    }]);
    review.enrichmentJobs = [{ id: 'job-1', candidateId: 'review-1', status: 'pending' }];
    const next = ensureBlankAddSession(review, { book: 'songs' });
    expect(next.entryMode).toBe('add');
    expect(isAddTunesChrome(next)).toBe(true);
    expect(next.candidates).toHaveLength(2);
    expect(next.candidates[0].addDraft).toBe(true);
    expect(next.candidates[1].id).toBe('review-1');
    expect(next.enrichmentJobs[0].status).toBe('pending');
    expect(next.index).toBe(0);
  });

  test('removeAddDraftFromSession keeps parked review items', function() {
    const session = ensureBlankAddSession(createImportReviewSession([{
      id: 'review-1',
      tune: { name: 'Prior' },
    }]), { book: 'songs' });
    const next = removeAddDraftFromSession(session);
    expect(next.entryMode).toBe('import');
    expect(next.candidates).toHaveLength(1);
    expect(next.candidates[0].id).toBe('review-1');
  });

  test('asImportReviewChrome switches add draft to import chrome', function() {
    const blank = createImportReviewSession([createBlankAddCandidate({ book: 'x' })], { entryMode: 'add' });
    const next = asImportReviewChrome(blank);
    expect(isAddTunesChrome(next)).toBe(false);
    expect(next.entryMode).toBe('import');
    expect(next.candidates).toHaveLength(1);
  });

  test('asImportReviewChrome focuses a parked review candidate', function() {
    const session = ensureBlankAddSession(createImportReviewSession([{
      id: 'review-1',
      tune: { name: 'Prior' },
    }]), { book: 'songs' });
    expect(session.index).toBe(0);
    const next = asImportReviewChrome(session);
    expect(next.entryMode).toBe('import');
    expect(next.index).toBe(1);
    expect(next.candidates[next.index].id).toBe('review-1');
  });

  test('advanceReviewStep keeps unified review page active', function() {
    const session = createImportReviewSession([{ tune: { name: 'A' } }]);
    expect(session.step).toBe('review');
    const next = advanceReviewStep(session);
    expect(next.step).toBe('review');
  });

  test('markCandidateImported advances to next review with summary counts', function() {
    const session = createImportReviewSession([
      { tune: { name: 'A' } },
      { tune: { name: 'B' } },
    ]);
    const merging = beginMergeForCandidateIndex(session, 0);
    const next = markCandidateImported(merging);
    expect(next.step).toBe('review');
    expect(next.index).toBe(1);
    expect(next.sessionSummary.reviewed).toBe(1);
    expect(next.sessionSummary.created).toBe(1);
  });

  test('markCandidateImported counts merged imports in summary', function() {
    const session = createImportReviewSession([{
      id: 'c1',
      tune: { name: 'A' },
      mergeTargetId: 'existing-1',
    }]);
    const merging = beginMergeForCandidateIndex(session, 0);
    const next = markCandidateImported(merging);
    expect(next.step).toBe('done');
    expect(next.sessionSummary.reviewed).toBe(1);
    expect(next.sessionSummary.merged).toBe(1);
    expect(next.sessionSummary.created).toBe(0);
  });

  test('skipYoutubeAllRemaining leaves review step unchanged', function() {
    const session = createImportReviewSession([{ tune: { name: 'A' } }]);
    const skipped = skipYoutubeAllRemaining(session);
    expect(skipped.skipYoutubeForRemaining).toBe(true);
    expect(skipped.step).toBe('review');
  });

  test('deferCandidateForEnhancement advances without marking imported', function() {
    const session = createImportReviewSession([
      { id: 'a', tune: { name: 'A' } },
      { id: 'b', tune: { name: 'B' } },
    ]);
    const job = createEnrichmentJob(session.candidates[0]);
    const jobs = startEnrichmentJob([job], job.id);
    const next = deferCandidateForEnhancement(session, jobs);
    expect(next.index).toBe(1);
    expect(next.step).toBe('review');
    expect(next.importedCandidateIds).toEqual({});
    expect(next.enrichmentJobs[0].status).toBe('pending');
  });

  test('deferCandidateForEnhancement keeps single-candidate in review queue for enrichment', function() {
    const session = createImportReviewSession([{ id: 'a', tune: { name: 'A' } }], { entryMode: 'add' });
    const job = createEnrichmentJob(session.candidates[0]);
    const jobs = startEnrichmentJob([job], job.id);
    const next = deferCandidateForEnhancement(session, jobs);
    expect(next.step).toBe('review');
    expect(next.phase).toBe('enrichment');
    expect(next.entryMode).toBe('import');
    expect(next.index).toBe(0);
    expect(next.enrichmentJobs[0].status).toBe('pending');
  });

  test('beginEnrichmentPhase opens queue step', function() {
    const session = createImportReviewSession([{ tune: { name: 'A' } }]);
    const next = beginEnrichmentPhase(session);
    expect(next.phase).toBe('enrichment');
    expect(next.step).toBe('enrichmentQueue');
  });

  test('isReviewComplete when all candidates imported', function() {
    const session = createImportReviewSession([{ id: 'c1', tune: { name: 'A' } }]);
    expect(isReviewComplete(session)).toBe(false);
    const done = Object.assign({}, session, {
      importedCandidateIds: { c1: true },
    });
    expect(isReviewComplete(done)).toBe(true);
  });

  test('youtubeUrlFromCandidate reads links', function() {
    expect(youtubeUrlFromCandidate({
      tune: { links: [{ link: 'https://www.youtube.com/watch?v=abc12345678' }] },
    })).toBe('https://www.youtube.com/watch?v=abc12345678');
  });

  test('shouldSkipYoutubeStep when link already present', function() {
    expect(shouldSkipYoutubeStep({
      tune: { links: [{ link: 'https://youtube.com/watch?v=abc12345678' }] },
    })).toBe(true);
  });

  test('sheetimage candidates skip enrichment opt-in', function() {
    expect(candidateNeedsEnrichmentOptIn({ sourceKind: 'sheetimage', skipEnrich: true })).toBe(false);
    expect(candidateNeedsEnrichmentOptIn({ sourceKind: 'musicxml' })).toBe(true);
  });

  test('navigateReviewCandidate loops through queue', function() {
    const session = createImportReviewSession([
      { id: 'a', tune: { name: 'A' } },
      { id: 'b', tune: { name: 'B' } },
      { id: 'c', tune: { name: 'C' } },
    ]);
    const prevLoop = navigateReviewCandidate(session, -1);
    expect(prevLoop.index).toBe(2);
    const next = navigateReviewCandidate(prevLoop, 1);
    expect(next.index).toBe(0);
  });

  test('cancelCurrentCandidate removes candidate and increments skipped summary', function() {
    const session = createImportReviewSession([
      { id: 'a', tune: { name: 'A' } },
      { id: 'b', tune: { name: 'B' } },
    ]);
    const next = cancelCurrentCandidate(session);
    expect(next.candidates.length).toBe(1);
    expect(next.candidates[0].id).toBe('b');
    expect(next.sessionSummary.skipped).toBe(1);
    expect(next.step).toBe('review');
  });

  test('cancelCurrentCandidate ends review when last candidate is removed', function() {
    const session = createImportReviewSession([{ id: 'a', tune: { name: 'A' } }]);
    const next = cancelCurrentCandidate(session);
    expect(next.step).toBe('done');
    expect(next.candidates.length).toBe(0);
    expect(next.sessionSummary.skipped).toBe(1);
  });

  test('markAllCandidatesImported marks every remaining candidate and completes', function() {
    const session = createImportReviewSession([
      { id: 'a', tune: { name: 'A' } },
      { id: 'b', mergeTargetId: 'existing', tune: { name: 'B' } },
      { id: 'c', tune: { name: 'C' }, imported: true },
    ]);
    session.importedCandidateIds = { c: true };
    session.sessionSummary = { reviewed: 1, created: 1, merged: 0, skipped: 0 };
    const next = markAllCandidatesImported(session);
    expect(next.step).toBe('done');
    expect(next.candidates.every(function(item) { return item.imported; })).toBe(true);
    expect(next.sessionSummary.reviewed).toBe(3);
    expect(next.sessionSummary.created).toBe(2);
    expect(next.sessionSummary.merged).toBe(1);
  });
});

describe('importReviewEnrichmentQueue', function() {
  test('skipEnrichmentJob marks pending jobs skipped', function() {
    const job = createEnrichmentJob({ id: 'c1', tune: { name: 'Song' } });
    const next = skipEnrichmentJob([job], job.id, 'user');
    expect(next[0].status).toBe('skipped');
    expect(enrichmentSummary(next).skipped).toBe(1);
  });

  test('createEnrichmentJob defaults to awaiting for all sources', function() {
    const scoreJob = createEnrichmentJob({
      id: 'c1',
      sourceKind: 'musicxml',
      tune: { name: 'Score' },
    });
    expect(scoreJob.status).toBe('awaiting');
    expect(enrichmentSummary([scoreJob]).awaiting).toBe(1);
    expect(enrichmentSummary([scoreJob]).pending).toBe(0);

    const abcJob = createEnrichmentJob({
      id: 'c2',
      sourceKind: 'abc',
      tune: { name: 'Tune' },
    });
    expect(abcJob.status).toBe('awaiting');
  });

  test('startEnrichmentJob queues awaiting jobs without auto-running others', function() {
    const job = createEnrichmentJob({
      id: 'c1',
      sourceKind: 'abc',
      tune: { name: 'Tune' },
    });
    expect(job.status).toBe('awaiting');
    const next = startEnrichmentJob([job], job.id);
    expect(next[0].status).toBe('pending');
    expect(enrichmentSummary(next).pending).toBe(1);
    expect(enrichmentSummary(next).awaiting).toBe(0);
  });
});

describe('import review coalesce by merge target', function() {
  test('foldIncomingCandidate merges into existing same mergeTargetId', function() {
    const session = createImportReviewSession([{
      id: 'c-abc',
      sourceKind: 'abc',
      mergeTargetId: 'tune-1',
      tune: { name: 'Song', composer: 'ABC Artist' },
    }]);
    const next = foldIncomingCandidate(session, {
      id: 'c-search',
      sourceKind: 'search-composer',
      mergeTargetId: 'tune-1',
      tune: { name: 'Song', composer: 'Search Artist' },
      fieldLookupJobId: 'job-1',
      fieldLookupKind: 'composer',
    });
    expect(next.candidates.length).toBe(1);
    expect(next.candidates[0].fieldChoices.artist.map(function(c) { return c.value; }))
      .toEqual(expect.arrayContaining(['ABC Artist', 'Search Artist']));
  });

  test('coalesceSessionCandidatesByMergeTarget collapses matching candidates', function() {
    const session = createImportReviewSession([
      {
        id: 'c1',
        sourceKind: 'abc',
        mergeTargetId: 'tune-1',
        tune: { name: 'Song', backgroundInfo: 'From ABC' },
      },
      {
        id: 'c2',
        sourceKind: 'ocr',
        mergeTargetId: 'tune-1',
        tune: { name: 'Song', backgroundInfo: 'From OCR' },
      },
      {
        id: 'c3',
        sourceKind: 'abc',
        mergeTargetId: 'tune-2',
        tune: { name: 'Other' },
      },
    ]);
    const result = coalesceSessionCandidatesByMergeTarget(session, 'tune-1', 'c2');
    expect(result.session.candidates.length).toBe(2);
    expect(result.survivorId).toBe('c2');
    expect(result.absorbedIds).toEqual(['c1']);
    const survivor = result.session.candidates.find(function(item) { return item.id === 'c2'; });
    expect(survivor.fieldChoices.backgroundInfo.map(function(c) { return c.value; }))
      .toEqual(expect.arrayContaining(['From OCR', 'From ABC']));
  });

  test('appendImportReviewCandidates folds by mergeTargetId', function() {
    const session = createImportReviewSession([{
      id: 'c1',
      sourceKind: 'abc',
      mergeTargetId: 'tune-9',
      tune: { name: 'A', genre: 'Folk' },
    }]);
    const next = appendImportReviewCandidates(session, [{
      id: 'c2',
      sourceKind: 'search-genre',
      mergeTargetId: 'tune-9',
      tune: { name: 'A', genre: 'Jazz' },
      fieldLookupJobId: 'job-g',
      fieldLookupKind: 'genre',
    }]);
    expect(next.candidates.length).toBe(1);
    expect(next.candidates[0].fieldLookupJobIds).toContain('job-g');
  });

  test('removeImportReviewCandidatesByFieldLookupJobId trims multi-job candidate', function() {
    const session = createImportReviewSession([{
      id: 'c1',
      sourceKind: 'search-multi',
      mergeTargetId: 'tune-1',
      tune: { name: 'Song' },
      fieldLookupJobIds: ['job-a', 'job-b'],
      fieldLookupKinds: ['composer', 'lyrics'],
      fieldLookupJobId: 'job-a',
      fieldLookupKind: 'composer',
    }]);
    const trimmed = removeImportReviewCandidatesByFieldLookupJobId(session, 'job-a');
    expect(trimmed.candidates.length).toBe(1);
    expect(trimmed.candidates[0].fieldLookupJobIds).toEqual(['job-b']);
    const gone = removeImportReviewCandidatesByFieldLookupJobId(trimmed, 'job-b');
    expect(gone.candidates.length).toBe(0);
    expect(gone.step).toBe('done');
  });
});
