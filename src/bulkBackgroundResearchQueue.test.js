jest.mock('./creditAffordabilityClient')

jest.mock('./tuneBackgroundResearchClient', function() {
  return {
    researchTuneBackground: jest.fn(function() {
      return Promise.resolve({ text: 'Researched background text.' })
    }),
  }
})

const localforageData = {}

jest.mock('localforage', function() {
  const api = {
    createInstance: jest.fn(function() {
      return {
        setItem: jest.fn(function(key, value) {
          localforageData[key] = value
          return Promise.resolve(value)
        }),
        getItem: jest.fn(function(key) {
          return Promise.resolve(localforageData[key] || null)
        }),
        removeItem: jest.fn(function(key) {
          delete localforageData[key]
          return Promise.resolve()
        }),
      }
    }),
  }
  return {
    __esModule: true,
    default: api,
  }
})

import { researchTuneBackground } from './tuneBackgroundResearchClient'
import { checkCanAfford } from './creditAffordabilityClient'
import * as bulkBackgroundResearchQueue from './bulkBackgroundResearchQueue'

function makeTune(overrides) {
  return Object.assign({
    id: 't1',
    name: 'Test Tune',
    composer: 'Test Artist',
    backgroundInfo: '',
    wLines: ['First line of lyrics here for context'],
  }, overrides || {})
}

describe('bulkBackgroundResearchQueue', function() {
  beforeEach(function() {
    bulkBackgroundResearchQueue.__resetForTests()
    Object.keys(localforageData).forEach(function(key) {
      delete localforageData[key]
    })
    checkCanAfford.mockResolvedValue({
      affordable: true,
      creditUnlimited: false,
      estimateCents: 0,
      availableCents: 100,
      shortfallCents: 0,
    })
    researchTuneBackground.mockReset()
    researchTuneBackground.mockResolvedValue({ text: 'Researched background text.' })
    bulkBackgroundResearchQueue.setBulkBackgroundResearchQueueContext({
      saveBackgroundInfo: jest.fn(),
    })
  })

  test('previewEnqueueTunes counts research and skip reasons', function() {
    const preview = bulkBackgroundResearchQueue.previewEnqueueTunes([
      makeTune(),
      makeTune({ id: 't2', backgroundInfo: 'Already has info' }),
      makeTune({ id: 't3', name: '' }),
    ])
    expect(preview.willResearch).toBe(1)
    expect(preview.willSkip).toBe(2)
    expect(preview.reasons['has-background']).toBe(1)
    expect(preview.reasons['no-title']).toBe(1)
  })

  test('enqueue skips tunes with existing background info', function() {
    bulkBackgroundResearchQueue.enqueueTunes([
      makeTune({ id: 't2', backgroundInfo: 'Existing' }),
    ], { accessToken: 'token' })
    const state = bulkBackgroundResearchQueue.getState()
    expect(state.jobs.length).toBe(1)
    expect(state.jobs[0].status).toBe('skipped')
    expect(state.jobs[0].skipReason).toBe('has-background')
  })

  test('enqueue force researches tunes that already have background info', function() {
    const ids = bulkBackgroundResearchQueue.enqueueTunes([
      makeTune({ id: 't2', backgroundInfo: 'Existing' }),
    ], { accessToken: 'token', force: true })
    const state = bulkBackgroundResearchQueue.getState()
    expect(ids.length).toBe(1)
    expect(state.jobs.length).toBe(1)
    expect(state.jobs[0].status).toBe('pending')
    expect(state.jobs[0].skipReason).toBe(null)
  })

  test('enqueue skips tunes without title', function() {
    bulkBackgroundResearchQueue.enqueueTunes([
      makeTune({ id: 't2', name: '  ' }),
    ], { accessToken: 'token' })
    const job = bulkBackgroundResearchQueue.getState().jobs[0]
    expect(job.status).toBe('skipped')
    expect(job.skipReason).toBe('no-title')
  })

  test('deduplicates pending jobs for same tune', function() {
    const tune = makeTune()
    const first = bulkBackgroundResearchQueue.enqueueTunes([tune], { accessToken: 'token' })
    const second = bulkBackgroundResearchQueue.enqueueTunes([tune], { accessToken: 'token' })
    expect(first[0]).toBe(second[0])
    expect(bulkBackgroundResearchQueue.getState().jobs.filter(function(job) {
      return job.status === 'pending'
    }).length).toBe(1)
  })

  test('cancel marks pending job cancelled', function() {
    const ids = bulkBackgroundResearchQueue.enqueueTunes([makeTune()], { accessToken: 'token' })
    bulkBackgroundResearchQueue.cancelJob(ids[0])
    const job = bulkBackgroundResearchQueue.getState().jobs.find(function(item) {
      return item.id === ids[0]
    })
    expect(job.status).toBe('cancelled')
  })

  test('overall progress reflects finished jobs', function() {
    bulkBackgroundResearchQueue.enqueueTunes([
      makeTune({ id: 't1' }),
      makeTune({ id: 't2', backgroundInfo: 'done' }),
    ], { accessToken: 'token' })
    const state = bulkBackgroundResearchQueue.getState()
    expect(state.totalCount).toBe(2)
    expect(state.finishedCount).toBe(1)
    expect(state.overallProgress).toBe(50)
  })

  test('processes job and saves background info', async function() {
    const saveTune = jest.fn()
    const tune = makeTune({ viewMode: 'music' })
    bulkBackgroundResearchQueue.setBulkBackgroundResearchQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    bulkBackgroundResearchQueue.enqueueTunes([tune], { accessToken: 'token' })
    bulkBackgroundResearchQueue.start()

    let job = null
    let attempts = 0
    while (attempts < 50) {
      job = bulkBackgroundResearchQueue.getState().jobs[0]
      if (job && (job.status === 'done' || job.status === 'error')) break
      await new Promise(function(resolve) { setTimeout(resolve, 20) })
      attempts += 1
    }

    expect(researchTuneBackground).toHaveBeenCalled()
    expect(job).toBeTruthy()
    if (job.status === 'error') {
      throw new Error(job.error || 'job failed')
    }
    expect(saveTune).toHaveBeenCalled()
    expect(tune.backgroundInfo).toBe('Researched background text.')
    expect(tune.viewMode).toBe('notation,info')
    expect(job.status).toBe('done')
  })

  test('restart after stop resumes pending jobs', async function() {
    let resolveFirst = null
    researchTuneBackground.mockImplementationOnce(function() {
      return new Promise(function(resolve) {
        resolveFirst = resolve
      })
    })
    researchTuneBackground.mockResolvedValue({ text: 'Researched background text.' })

    const saveBackgroundInfo = jest.fn()
    bulkBackgroundResearchQueue.setBulkBackgroundResearchQueueContext({ saveBackgroundInfo: saveBackgroundInfo })
    bulkBackgroundResearchQueue.enqueueTunes([
      makeTune({ id: 't1' }),
      makeTune({ id: 't2', name: 'Tune Two' }),
    ], { accessToken: 'token' })
    bulkBackgroundResearchQueue.start()
    await new Promise(function(resolve) { setTimeout(resolve, 20) })
    bulkBackgroundResearchQueue.stop()
    if (resolveFirst) resolveFirst({ text: 'First tune background' })
    await new Promise(function(resolve) { setTimeout(resolve, 20) })
    bulkBackgroundResearchQueue.start()

    let attempts = 0
    while (attempts < 50) {
      const done = bulkBackgroundResearchQueue.getState().jobs.filter(function(job) {
        return job.status === 'done'
      }).length
      if (done >= 2) break
      await new Promise(function(resolve) { setTimeout(resolve, 20) })
      attempts += 1
    }

    expect(saveBackgroundInfo.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(bulkBackgroundResearchQueue.getState().running).toBe(false)
  })

  test('stop pauses the queue without leaving it marked active', async function() {
    const saveBackgroundInfo = jest.fn()
    researchTuneBackground.mockImplementation(function() {
      return new Promise(function() {})
    })
    bulkBackgroundResearchQueue.setBulkBackgroundResearchQueueContext({ saveBackgroundInfo: saveBackgroundInfo })
    bulkBackgroundResearchQueue.enqueueTunes([
      makeTune({ id: 't1' }),
      makeTune({ id: 't2', name: 'Second Tune' }),
    ], { accessToken: 'token' })
    bulkBackgroundResearchQueue.start()
    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    bulkBackgroundResearchQueue.stop()
    expect(bulkBackgroundResearchQueue.getState().running).toBe(true)
    expect(bulkBackgroundResearchQueue.getState().paused).toBe(true)
    expect(bulkBackgroundResearchQueue.isBulkBackgroundResearchQueueActive()).toBe(false)
  })

  test('saved running jobs restore as pending', function() {
    bulkBackgroundResearchQueue.__loadSavedStateForTests({
      jobCounter: 1,
      running: false,
      paused: true,
      jobs: [{
        id: 'bg-research-job-1',
        tuneId: 't1',
        tuneName: 'Test Tune',
        title: 'Test Tune',
        artist: 'Test Artist',
        lyrics: '',
        status: 'running',
        progress: 40,
        message: 'Searching...',
        error: null,
        skipReason: null,
        accessToken: 'token',
        cancelled: false,
      }],
    })
    const job = bulkBackgroundResearchQueue.getState().jobs[0]
    expect(job).toBeTruthy()
    expect(job.status).toBe('pending')
  })
})
