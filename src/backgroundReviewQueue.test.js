import {
  getBackgroundReviewSummary,
  markMediaAnalysisReviewed,
  __resetBackgroundReviewQueueForTests,
} from './backgroundReviewQueue'
import {
  setImportReviewSession,
  clearImportReviewSession,
  getImportReviewSession,
  __resetImportReviewSessionStoreForTests,
} from './importReviewSessionStore'
import { patchMediaAnalysisJob } from './mediaAnalysisJobs'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'

describe('backgroundReviewQueue', function() {
  afterEach(function() {
    clearImportReviewSession()
    __resetImportReviewSessionStoreForTests()
    __resetBackgroundReviewQueueForTests()
    tuneFieldLookupQueue.__resetForTests()
    patchMediaAnalysisJob('t1', { isAnalyzing: false, analysis: null })
  })

  test('counts import enrichment jobs ready for review', function() {
    setImportReviewSession({
      candidates: [{ id: 'c1' }, { id: 'c2' }],
      enrichmentJobs: [
        { id: 'j1', candidateId: 'c1', status: 'done', enrichedTune: { name: 'A' } },
        { id: 'j2', candidateId: 'c2', status: 'running' },
      ],
      importedCandidateIds: {},
      step: 'enrichmentQueue',
      phase: 'enrichment',
    })

    const summary = getBackgroundReviewSummary()
    expect(summary.importReady).toBe(1)
    expect(summary.importProcessing).toBe(1)
    expect(summary.ready).toBe(1)
  })

  test('counts identify-phase import candidates ready for review', function() {
    setImportReviewSession({
      candidates: [{ id: 'c1' }, { id: 'c2' }],
      enrichmentJobs: [],
      importedCandidateIds: {},
      step: 'review',
      phase: 'identify',
    })

    const summary = getBackgroundReviewSummary()
    expect(summary.importReady).toBe(2)
    expect(summary.importProcessing).toBe(0)
    expect(summary.ready).toBe(2)
  })

  test('completed media analysis is not Import Review ready', function() {
    patchMediaAnalysisJob('t1', {
      isAnalyzing: false,
      analysis: {
        formatted: { lyricsText: 'Hello world' },
      },
    })

    const summary = getBackgroundReviewSummary()
    expect(summary.mediaReady).toEqual([])
    expect(summary.ready).toBe(0)
  })

  test('does not count Add-form candidate draft searches as Review queue items', function() {
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      candidateId: 'add-cand-1',
      kind: 'chords',
      title: 'Summer of 69',
      candidates: [{ chordText: 'D A Bm G', lyricText: 'I got my first real six-string', source: 'web' }],
      options: { searchMode: 'review', alwaysPick: true },
    })
    expect(id).toBeTruthy()
    const summary = getBackgroundReviewSummary()
    expect(summary.fieldLookupAwaiting).toEqual([])
    expect(summary.fieldLookupAwaitingJobs.length).toBe(0)
    expect(summary.ready).toBe(0)
  })

  test('awaiting field lookup jobs are not Import Review ready', function() {
    tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Wonderwall',
      candidates: [
        { artist: 'Oasis', source: 'web' },
        { artist: 'Other', source: 'web' },
      ],
    })
    const summary = getBackgroundReviewSummary()
    expect(summary.fieldLookupAwaiting).toEqual([])
    expect(summary.fieldLookupAwaitingJobs.length).toBe(0)
    expect(summary.ready).toBe(0)
  })

  test('excludes field lookup jobs already linked into import review', function() {
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Wonderwall',
      candidates: [
        { artist: 'Oasis', source: 'web' },
      ],
    })
    tuneFieldLookupQueue.linkFieldLookupToReviewCandidate(id, 'candidate-1')
    const summary = getBackgroundReviewSummary()
    expect(summary.fieldLookupAwaiting).toEqual([])
    expect(summary.fieldLookupAwaitingJobs.length).toBe(0)
  })

  test('does not count blank Add-tunes drafts as ready for review', function() {
    setImportReviewSession({
      candidates: [{ id: 'c1', addDraft: true, sourceKind: 'manual', tune: { name: '' } }],
      enrichmentJobs: [],
      importedCandidateIds: {},
      step: 'review',
      phase: 'identify',
      entryMode: 'add',
    })
    const summary = getBackgroundReviewSummary()
    expect(summary.importReady).toBe(0)
    expect(summary.ready).toBe(0)
  })

  test('counts parked review candidates while an Add draft is open', function() {
    setImportReviewSession({
      candidates: [
        { id: 'add-1', addDraft: true, sourceKind: 'manual', tune: { name: '' } },
        { id: 'review-1', sourceKind: 'manual', tune: { name: 'Prior' } },
      ],
      enrichmentJobs: [
        { id: 'j1', candidateId: 'review-1', status: 'pending' },
      ],
      importedCandidateIds: {},
      step: 'review',
      phase: 'enrichment',
      entryMode: 'add',
      index: 0,
    })
    const summary = getBackgroundReviewSummary()
    expect(summary.importTotal).toBe(1)
    expect(summary.importProcessing).toBe(1)
    expect(summary.importReady).toBe(0)
  })

  test('does not count finished import sessions as ready', function() {
    setImportReviewSession({
      candidates: [{ id: 'c1' }],
      enrichmentJobs: [],
      importedCandidateIds: {},
      step: 'done',
      phase: 'identify',
    })
    expect(getImportReviewSession()).toBe(null)
    const summary = getBackgroundReviewSummary()
    expect(summary.importReady).toBe(0)
    expect(summary.ready).toBe(0)
  })

  test('orphan review links clear without becoming Import Review ready', function() {
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Wonderwall',
      candidates: [{ artist: 'Oasis', source: 'web' }],
      options: { searchMode: 'review', alwaysPick: true },
    })
    tuneFieldLookupQueue.linkFieldLookupToReviewCandidate(id, 'missing-candidate')
    expect(getBackgroundReviewSummary().ready).toBe(0)

    const cleared = tuneFieldLookupQueue.clearOrphanFieldLookupReviewLinks(null)
    expect(cleared).toBe(1)
    expect(getBackgroundReviewSummary().ready).toBe(0)
    expect(getBackgroundReviewSummary().fieldLookupAwaiting).toEqual([])
  })
})
