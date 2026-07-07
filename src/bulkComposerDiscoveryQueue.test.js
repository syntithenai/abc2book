jest.mock('./composerSearchClient', function() {
  return {
    discoverComposers: jest.fn(function() {
      return Promise.resolve({
        multiple: false,
        artist: 'Discovered Artist',
        source: 'MusicBrainz',
        preview: 'Discovered Artist',
      })
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

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
    },
  }
})

import { discoverComposers } from './composerSearchClient'
import * as bulkComposerDiscoveryQueue from './bulkComposerDiscoveryQueue'

function makeTune(overrides) {
  return Object.assign({
    id: 't1',
    name: 'Wonderwall',
    composer: '',
  }, overrides || {})
}

describe('bulkComposerDiscoveryQueue', function() {
  beforeEach(function() {
    bulkComposerDiscoveryQueue.__resetForTests()
    Object.keys(localforageData).forEach(function(key) {
      delete localforageData[key]
    })
    discoverComposers.mockReset()
    discoverComposers.mockResolvedValue({
      multiple: true,
      candidates: [
        { artist: 'Discovered Artist', source: 'MusicBrainz', preview: 'Discovered Artist' },
        { artist: 'Other Artist', source: 'MusicBrainz', preview: 'Other Artist' },
      ],
    })
  })

  test('previewEnqueueTunes skips tunes with composer', function() {
    const preview = bulkComposerDiscoveryQueue.previewEnqueueTunes([
      makeTune({ composer: 'Oasis' }),
      makeTune({ composer: '' }),
    ])
    expect(preview.willDiscover).toBe(1)
    expect(preview.reasons['has-composer']).toBe(1)
  })

  test('run job waits for review before saving composer', async function() {
    const saved = []
    bulkComposerDiscoveryQueue.setBulkComposerDiscoveryQueueContext({
      getTune: function(tuneId) {
        return makeTune({ id: tuneId })
      },
      saveTune: function(tune) {
        saved.push(tune)
      },
      forceRefresh: jest.fn(),
    })

    bulkComposerDiscoveryQueue.enqueueTunes([makeTune()], { accessToken: 'token' })
    bulkComposerDiscoveryQueue.start()

    let job = null
    let attempts = 0
    while (attempts < 50) {
      job = bulkComposerDiscoveryQueue.getState().jobs[0]
      if (job && (job.status === 'awaiting' || job.status === 'error')) break
      await new Promise(function(resolve) { setTimeout(resolve, 20) })
      attempts += 1
    }

    expect(discoverComposers).toHaveBeenCalled()
    expect(job).toBeTruthy()
    expect(job.status).toBe('awaiting')
    expect(job.composerCandidates.length).toBeGreaterThan(0)
    expect(saved).toHaveLength(0)

    bulkComposerDiscoveryQueue.applyComposerDiscoveryChoice(job.id, 'Discovered Artist')
    expect(saved).toHaveLength(1)
    expect(saved[0].composer).toBe('Discovered Artist')
    expect(bulkComposerDiscoveryQueue.getState().jobs[0].status).toBe('done')
  })
})
