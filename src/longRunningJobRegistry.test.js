import {
  hasActiveLongRunningJobs,
  registerLongRunningJob,
  __resetForTests,
} from './longRunningJobRegistry'
import * as bulkCheckRunner from './bulkCheckRunner'
import * as bulkBackgroundResearchQueue from './bulkBackgroundResearchQueue'
import { patchMediaAnalysisJob } from './mediaAnalysisJobs'
import { patchPlaybackRegionScanJob } from './playbackRegionScanJobs'

describe('longRunningJobRegistry', function() {
  afterEach(function() {
    __resetForTests()
    patchMediaAnalysisJob('t1', { isAnalyzing: false })
    patchPlaybackRegionScanJob('t1', 0, { isScanning: false })
    bulkCheckRunner.cancelBulkCheckRun()
    bulkBackgroundResearchQueue.__resetForTests()
  })

  test('hasActiveLongRunningJobs tracks manual search jobs', function() {
    expect(hasActiveLongRunningJobs()).toBe(false)
    const unregister = registerLongRunningJob()
    expect(hasActiveLongRunningJobs()).toBe(true)
    unregister()
    expect(hasActiveLongRunningJobs()).toBe(false)
  })

  test('hasActiveLongRunningJobs ignores background bulk check and research queues', function() {
    bulkBackgroundResearchQueue.enqueueTunes([{
      id: 't1',
      name: 'Test Tune',
      composer: 'Artist',
      backgroundInfo: '',
    }], { accessToken: 'token' })
    bulkBackgroundResearchQueue.start()
    patchPlaybackRegionScanJob('t1', 0, { isScanning: true })
    expect(bulkBackgroundResearchQueue.isBulkBackgroundResearchQueueActive()).toBe(true)
    expect(hasActiveLongRunningJobs()).toBe(false)
  })

  test('hasActiveLongRunningJobs ignores active media analysis jobs', function() {
    patchMediaAnalysisJob('t1', { isAnalyzing: true })
    expect(hasActiveLongRunningJobs()).toBe(false)
  })
})
