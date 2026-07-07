jest.mock('./nativeFilteredMedia', function() {
  return {
    loadStemBuffersForSource: jest.fn(function() {
      return Promise.resolve({
        stemBuffers: { vocals: {} },
        fromCache: false,
      })
    }),
  }
})

jest.mock('./audioStemCache', function() {
  return {
    getStemSourceCacheKey: jest.fn(function(tuneId, linkIndex, src, model) {
      return 'stems:' + tuneId + ':' + linkIndex + ':' + src + ':' + (model || '')
    }),
    getCachedStemSet: jest.fn(function() {
      return Promise.resolve(null)
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

import { loadStemBuffersForSource } from './nativeFilteredMedia'
import { getCachedStemSet } from './audioStemCache'
import * as stemCreateQueue from './stemCreateQueue'

function makeTune(overrides) {
  return Object.assign({
    id: 't1',
    name: 'Test Tune',
    links: [{ link: 'https://example.com/a.mp3', title: 'Track' }],
  }, overrides || {})
}

describe('stemCreateQueue', function() {
  beforeEach(function() {
    stemCreateQueue.__resetForTests()
    Object.keys(localforageData).forEach(function(key) {
      delete localforageData[key]
    })
    loadStemBuffersForSource.mockReset()
    loadStemBuffersForSource.mockResolvedValue({
      stemBuffers: { vocals: {} },
      fromCache: false,
    })
    getCachedStemSet.mockReset()
    getCachedStemSet.mockResolvedValue(null)
  })

  test('deduplicates pending stem create jobs', function() {
    const options = {
      tuneId: 't1',
      linkIndex: 0,
      src: 'https://example.com/a.mp3',
      srcType: 'audio',
      tuneName: 'Tune',
      demucsModel: 'htdemucs',
    }
    const first = stemCreateQueue.enqueueStemCreateJob(options)
    const second = stemCreateQueue.enqueueStemCreateJob(options)
    expect(first).toBe(second)
    expect(stemCreateQueue.getState().jobs.length).toBe(1)
  })

  test('skips tunes without cacheable media links', function() {
    stemCreateQueue.enqueueTunesStemCreateJobs([
      makeTune({ id: 't2', links: [] }),
    ], { accessToken: 'token', demucsModel: 'htdemucs' })
    const state = stemCreateQueue.getState()
    expect(state.jobs.length).toBe(1)
    expect(state.jobs[0].status).toBe('skipped')
    expect(state.jobs[0].skipReason).toBe('no-link')
  })

  test('cancel marks pending job cancelled', function() {
    const id = stemCreateQueue.enqueueStemCreateJob({
      tuneId: 't2',
      linkIndex: 0,
      src: 'https://example.com/b.mp3',
      srcType: 'audio',
      tuneName: 'Tune 2',
    })
    stemCreateQueue.cancelJob(id)
    const job = stemCreateQueue.getState().jobs.find(function(item) { return item.id === id })
    expect(job.status).toBe('cancelled')
  })

  test('creates stems for enqueued tunes', async function() {
    const ids = stemCreateQueue.enqueueTunesStemCreateJobs([makeTune()], {
      accessToken: 'token',
      demucsModel: 'htdemucs',
      utils: {
        isYoutubeLink: function() { return false },
      },
    })
    expect(ids.length).toBe(1)
    stemCreateQueue.start()

    let job = null
    let attempts = 0
    while (attempts < 50) {
      job = stemCreateQueue.getState().jobs[0]
      if (job && (job.status === 'done' || job.status === 'error')) break
      await new Promise(function(resolve) { setTimeout(resolve, 20) })
      attempts += 1
    }

    expect(loadStemBuffersForSource).toHaveBeenCalled()
    expect(job).toBeTruthy()
    if (job.status === 'error') {
      throw new Error(job.error || 'job failed')
    }
    expect(job.status).toBe('done')
  })

  test('resumes pending jobs loaded from saved state', async function() {
    stemCreateQueue.__loadSavedStateForTests({
      jobCounter: 2,
      running: true,
      paused: false,
      jobs: [{
        id: 'stem-create-job-1',
        tuneId: 't1',
        linkIndex: 0,
        src: 'https://example.com/a.mp3',
        srcType: 'audio',
        tuneName: 'Test Tune',
        linkTitle: 'Track',
        demucsModel: 'htdemucs',
        status: 'pending',
        progress: 0,
        message: '',
        error: null,
        skipReason: null,
        accessToken: 'token',
        cancelled: false,
      }],
    })
    stemCreateQueue.start()

    let job = null
    let attempts = 0
    while (attempts < 50) {
      job = stemCreateQueue.getState().jobs[0]
      if (job && (job.status === 'done' || job.status === 'error')) break
      await new Promise(function(resolve) { setTimeout(resolve, 20) })
      attempts += 1
    }

    expect(job.status).toBe('done')
    expect(loadStemBuffersForSource).toHaveBeenCalled()
  })

  test('marks already-cached stems done without network separation', async function() {
    getCachedStemSet.mockResolvedValue({ stemBuffers: { vocals: {} } })
    stemCreateQueue.enqueueTunesStemCreateJobs([makeTune()], {
      accessToken: 'token',
      demucsModel: 'htdemucs',
      utils: {
        isYoutubeLink: function() { return false },
      },
    })
    stemCreateQueue.start()
    await new Promise(function(resolve) { setTimeout(resolve, 0) })

    expect(stemCreateQueue.getState().jobs[0].status).toBe('done')
    expect(stemCreateQueue.getState().jobs[0].message).toBe('Already cached')
    expect(loadStemBuffersForSource).not.toHaveBeenCalled()
  })
})
