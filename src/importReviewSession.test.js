import {
  createImportReviewSession,
  advanceReviewStep,
  markCandidateImported,
  beginMergeForCandidateIndex,
  beginEnrichmentPhase,
  skipYoutubeAllRemaining,
  isReviewComplete,
  shouldSkipYoutubeStep,
  youtubeUrlFromCandidate,
  candidateNeedsEnrichmentOptIn,
  emptySessionSummary,
  navigateReviewCandidate,
  cancelCurrentCandidate,
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
