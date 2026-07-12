import {
  getBackgroundReviewSummary,
  markMediaAnalysisReviewed,
  __resetBackgroundReviewQueueForTests,
} from './backgroundReviewQueue'
import {
  setImportReviewSession,
  clearImportReviewSession,
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

  test('tracks media analysis ready for review', function() {
    patchMediaAnalysisJob('t1', {
      isAnalyzing: false,
      analysis: {
        formatted: { lyricsText: 'Hello world' },
      },
    })

    let summary = getBackgroundReviewSummary()
    expect(summary.mediaReady).toEqual(['t1'])
    expect(summary.ready).toBe(1)

    markMediaAnalysisReviewed('t1')
    summary = getBackgroundReviewSummary()
    expect(summary.mediaReady).toEqual([])
    expect(summary.ready).toBe(0)
  })

  test('counts awaiting field lookup jobs ready for review', function() {
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Wonderwall',
      candidates: [
        { artist: 'Oasis', source: 'web' },
        { artist: 'Other', source: 'web' },
      ],
    })
    const summary = getBackgroundReviewSummary()
    expect(summary.fieldLookupAwaiting).toEqual([id])
    expect(summary.fieldLookupAwaitingJobs.length).toBe(1)
    expect(summary.fieldLookupAwaitingJobs[0].kind).toBe('composer')
    expect(summary.ready).toBe(1)
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
})
