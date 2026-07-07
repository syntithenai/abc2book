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

describe('backgroundReviewQueue', function() {
  afterEach(function() {
    clearImportReviewSession()
    __resetImportReviewSessionStoreForTests()
    __resetBackgroundReviewQueueForTests()
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
})
