import {
  clearStemAnalysisJob,
  getStemAnalysisJobRevision,
  getStemAnalysisJobSnapshot,
  subscribeStemAnalysisJob,
  updateStemAnalysisJob,
  __resetStemAnalysisJobStoreForTests,
} from './stemAnalysisJobStore'

describe('stemAnalysisJobStore', function() {
  afterEach(function() {
    __resetStemAnalysisJobStoreForTests()
  })

  test('notifies subscribers when job progress updates', function() {
    const seen = []
    const unsub = subscribeStemAnalysisJob(function() {
      seen.push(getStemAnalysisJobRevision())
    })
    updateStemAnalysisJob({
      active: true,
      progress: 42,
      message: 'Separating stems...',
      tuneId: 't1',
      linkIndex: 0,
      tuneName: 'Test Tune',
    })
    unsub()
    expect(seen.length).toBeGreaterThan(0)
    expect(getStemAnalysisJobSnapshot()).toEqual(expect.objectContaining({
      active: true,
      progress: 42,
      tuneId: 't1',
      tuneName: 'Test Tune',
    }))
  })

  test('clearStemAnalysisJob resets snapshot', function() {
    updateStemAnalysisJob({ active: true, progress: 10, message: 'Working' })
    clearStemAnalysisJob()
    expect(getStemAnalysisJobSnapshot()).toEqual(expect.objectContaining({
      active: false,
      progress: 0,
      message: '',
      error: '',
    }))
  })
})
