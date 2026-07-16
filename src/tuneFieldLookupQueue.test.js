jest.mock('./lyricsSearchClient', function() {
  return {
    searchLyrics: jest.fn(function() {
      return Promise.resolve({
        multiple: true,
        candidates: [
          { title: 'Song', artist: 'A', text: 'line one', source: 'web' },
          { title: 'Song', artist: 'B', text: 'line two', source: 'web' },
        ],
      })
    }),
  }
})

jest.mock('./chordsSearchClient', function() {
  return {
    searchChords: jest.fn(function() {
      return Promise.resolve({
        multiple: false,
        abc: 'X:1\nK:C\nC',
        source: 'web',
      })
    }),
  }
})

jest.mock('./composerSearchClient', function() {
  return {
    discoverComposers: jest.fn(function() {
      return Promise.resolve({
        multiple: true,
        candidates: [
          { artist: 'Artist One', source: 'MusicBrainz', preview: 'Artist One' },
          { artist: 'Artist Two', source: 'MusicBrainz', preview: 'Artist Two' },
        ],
      })
    }),
  }
})

jest.mock('./notationSearchClient', function() {
  return {
    searchNotation: jest.fn(function() {
      return Promise.resolve({
        multiple: true,
        candidates: [
          { title: 'Tune', abc: 'X:1\nK:G\nG', source: 'session' },
        ],
      })
    }),
  }
})

jest.mock('./aliasesSearchClient', function() {
  return {
    searchAliases: jest.fn(function() {
      return Promise.resolve({
        multiple: true,
        candidates: [
          { alias: 'Other Name', source: 'The Session' },
        ],
      })
    }),
  }
})

jest.mock('./artistsSearchClient', function() {
  return {
    searchArtists: jest.fn(function() {
      return Promise.resolve({
        multiple: false,
        artist: 'Band',
        source: 'MusicBrainz',
      })
    }),
  }
})

jest.mock('./genreSearchClient', function() {
  return {
    searchGenre: jest.fn(function() {
      return Promise.resolve({
        multiple: false,
        genre: 'Folk',
        source: 'inference',
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

import { searchLyrics } from './lyricsSearchClient'
import { discoverComposers } from './composerSearchClient'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'

async function waitForJob(predicate, attempts) {
  let job = null
  let n = 0
  const max = typeof attempts === 'number' ? attempts : 50
  while (n < max) {
    job = tuneFieldLookupQueue.getState().jobs[0]
    if (job && predicate(job)) break
    await new Promise(function(resolve) { setTimeout(resolve, 20) })
    n += 1
  }
  return job
}

describe('tuneFieldLookupQueue', function() {
  beforeEach(function() {
    tuneFieldLookupQueue.__resetForTests()
    Object.keys(localforageData).forEach(function(key) {
      delete localforageData[key]
    })
    searchLyrics.mockReset()
    searchLyrics.mockResolvedValue({
      multiple: true,
      candidates: [
        { title: 'Song', artist: 'A', text: 'line one', source: 'web' },
        { title: 'Song', artist: 'B', text: 'line two', source: 'web' },
      ],
    })
    discoverComposers.mockReset()
    discoverComposers.mockResolvedValue({
      multiple: true,
      candidates: [
        { artist: 'Artist One', source: 'MusicBrainz', preview: 'Artist One' },
        { artist: 'Artist Two', source: 'MusicBrainz', preview: 'Artist Two' },
      ],
    })
  })

  test('enqueueLookup dedupes active jobs per target and kind', function() {
    const first = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
    })
    const second = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
    })
    expect(first).toBe(second)
    expect(tuneFieldLookupQueue.getState().jobs.filter(function(job) {
      return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
    }).length).toBe(1)
  })

  test('enqueueLookup clears awaiting suggestions and starts a new search', function() {
    const onAwaiting = jest.fn()
    tuneFieldLookupQueue.registerLiveHandler('tune:t1', 'notation', { onAwaiting: onAwaiting })
    const seeded = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'notation',
      title: 'Song',
      candidates: [{ title: 'Song', abc: 'X:1\nK:C\nC', source: 'test' }],
    })
    expect(seeded).toBeTruthy()
    onAwaiting.mockClear()
    const again = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'notation',
      title: 'Song',
      accessToken: 'token',
    })
    expect(again).not.toBe(seeded)
    expect(tuneFieldLookupQueue.findJobById(seeded).status).toBe('done')
    expect(tuneFieldLookupQueue.findJobById(again).status).toBe('pending')
  })

  test('lyrics search lands as awaiting with candidates', async function() {
    const id = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      artist: 'Artist',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'awaiting' || item.status === 'error')
    })
    expect(searchLyrics).toHaveBeenCalled()
    expect(job.id).toBe(id)
    expect(job.error).toBe(null)
    expect(job.status).toBe('awaiting')
    expect(job.candidates.length).toBe(2)
  })

  test('applyFieldLookupChoice keeps suggestions awaiting', async function() {
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) { return item && item.status === 'awaiting' })
    const chosen = tuneFieldLookupQueue.applyFieldLookupChoice(job.id, job.candidates[0])
    expect(chosen.text).toBe('line one')
    expect(tuneFieldLookupQueue.findJobById(job.id).status).toBe('awaiting')
    expect(tuneFieldLookupQueue.findJobById(job.id).candidates.length).toBe(2)
  })

  test('seedAwaitingLookup creates awaiting job for candidateId', function() {
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      candidateId: 'c1',
      kind: 'composer',
      title: 'Song',
      candidates: [
        { artist: 'One', source: 'x' },
        { artist: 'Two', source: 'y' },
      ],
    })
    const job = tuneFieldLookupQueue.findJobById(id)
    expect(job.status).toBe('awaiting')
    expect(job.targetKey).toBe('candidate:c1')
    expect(job.candidates.length).toBe(2)
  })

  test('dismissFieldLookup marks job done', function() {
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'chords',
      title: 'Song',
      candidates: [{ abc: 'C', source: 'web' }],
    })
    expect(tuneFieldLookupQueue.dismissFieldLookup(id)).toBe(true)
    expect(tuneFieldLookupQueue.findJobById(id).status).toBe('done')
  })

  test('clearFinishedJobs removes awaiting review jobs', function() {
    const awaitingId = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'genre',
      title: 'Song',
      candidates: [{ genre: 'Folk', source: 'inference' }],
    })
    const pendingId = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't2',
      kind: 'artists',
      title: 'Other',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.clearFinishedJobs()
    expect(tuneFieldLookupQueue.findJobById(awaitingId)).toBeFalsy()
    expect(tuneFieldLookupQueue.findJobById(pendingId).status).toBe('pending')
  })

  test('live handler receives awaiting notification', async function() {
    const seen = []
    tuneFieldLookupQueue.registerLiveHandler('tune:t1', 'composer', {
      onAwaiting: function(job) { seen.push(job) },
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    await waitForJob(function(item) { return item && item.status === 'awaiting' })
    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen[0].candidates.length).toBe(2)
  })

  test('cancelJob cancels pending job', function() {
    const id = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'notation',
      title: 'Song',
      accessToken: 'token',
    })
    expect(tuneFieldLookupQueue.cancelJob(id)).toBe(true)
    expect(tuneFieldLookupQueue.findJobById(id).status).toBe('cancelled')
  })

  test('saved running jobs restore as pending', function() {
    tuneFieldLookupQueue.__loadSavedStateForTests({
      jobCounter: 1,
      running: false,
      paused: true,
      jobs: [{
        id: 'field-lookup-job-1',
        tuneId: 't1',
        kind: 'lyrics',
        title: 'Song',
        status: 'running',
        progress: 40,
        message: 'Searching...',
        candidates: [],
        accessToken: 'token',
      }],
    })
    const job = tuneFieldLookupQueue.getState().jobs[0]
    expect(job.status).toBe('pending')
  })

  test('auto-applies single composer result when tune artist is empty without attaching suggestions', async function() {
    const tune = { id: 't1', name: 'Song', composer: '' }
    const saveTune = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    discoverComposers.mockResolvedValue({
      multiple: false,
      artist: 'Only Artist',
      source: 'web',
      preview: 'Only Artist',
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'awaiting' || item.status === 'error')
    })
    expect(job.status).toBe('done')
    expect(tune.composer).toBe('Only Artist')
    expect(job.candidates).toEqual([])
    expect(saveTune).toHaveBeenCalled()
  })

  test('leaves awaiting when single composer result differs from artist already set', async function() {
    const tune = { id: 't1', name: 'Song', composer: 'Existing Artist' }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    discoverComposers.mockResolvedValue({
      multiple: false,
      artist: 'New Artist',
      source: 'web',
      preview: 'New Artist',
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      artist: 'Existing Artist',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'awaiting' || item.status === 'error')
    })
    expect(job.status).toBe('awaiting')
    expect(tune.composer).toBe('Existing Artist')
    expect(job.candidates.length).toBeGreaterThanOrEqual(1)
  })

  test('finishes without suggestions when single composer result matches current value', async function() {
    const tune = { id: 't1', name: 'Song', composer: 'Same Artist' }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    discoverComposers.mockResolvedValue({
      multiple: false,
      artist: 'Same Artist',
      source: 'web',
      preview: 'Same Artist',
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      artist: 'Same Artist',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'awaiting' || item.status === 'error')
    })
    expect(job.status).toBe('done')
    expect(tune.composer).toBe('Same Artist')
    expect(job.candidates).toEqual([])
  })

  test('empty field applies first lyrics candidate but keeps suggestions awaiting when multiple', async function() {
    const tune = { id: 't1', name: 'Song' }
    const saveTune = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
      options: tuneFieldLookupQueue.buildSearchModeOptions('auto'),
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'awaiting' || item.status === 'error')
    })
    expect(job.status).toBe('awaiting')
    expect(saveTune).toHaveBeenCalled()
    expect(job.candidates.length).toBeGreaterThan(0)
  })

  test('review mode applies single empty-field result without attaching suggestions', async function() {
    const tune = { id: 't1', name: 'Song', composer: '' }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    discoverComposers.mockResolvedValue({
      multiple: false,
      artist: 'Only Artist',
      source: 'web',
      preview: 'Only Artist',
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      accessToken: 'token',
      options: tuneFieldLookupQueue.buildSearchModeOptions('review'),
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'awaiting' || item.status === 'error')
    })
    expect(job.status).toBe('done')
    expect(tune.composer).toBe('Only Artist')
    expect(job.candidates).toEqual([])
  })

  test('shouldDeferFieldLookupSave for review and linked jobs', function() {
    expect(tuneFieldLookupQueue.shouldDeferFieldLookupSave({
      options: { searchMode: 'review' },
    })).toBe(true)
    expect(tuneFieldLookupQueue.shouldDeferFieldLookupSave({
      reviewCandidateId: 'c1',
      options: { searchMode: 'auto' },
    })).toBe(true)
    expect(tuneFieldLookupQueue.shouldDeferFieldLookupSave({
      options: { searchMode: 'auto' },
    })).toBe(false)
  })

  test('applyFieldLookupChoice does not saveTune for review mode even with live handler', async function() {
    const tune = { id: 't1', name: 'Song', composer: 'Old' }
    const saveTune = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    tuneFieldLookupQueue.registerLiveHandler('tune:t1', 'composer', {
      onAwaiting: function() {},
    })
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      candidates: [
        { artist: 'New Artist', source: 'web' },
      ],
      options: { searchMode: 'review', alwaysPick: true },
    })
    const job = tuneFieldLookupQueue.findJobById(id)
    expect(job.status).toBe('awaiting')
    tuneFieldLookupQueue.applyFieldLookupChoice(id, job.candidates[0])
    expect(tuneFieldLookupQueue.findJobById(id).status).toBe('awaiting')
    expect(tune.composer).toBe('Old')
    expect(saveTune).not.toHaveBeenCalled()
  })

  test('applyFieldLookupChoice does not saveTune when linked to review candidate', function() {
    const tune = { id: 't1', name: 'Song', composer: 'Old' }
    const saveTune = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    const id = tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      candidates: [{ artist: 'New Artist', source: 'web' }],
    })
    tuneFieldLookupQueue.linkFieldLookupToReviewCandidate(id, 'review-cand-1')
    const job = tuneFieldLookupQueue.findJobById(id)
    tuneFieldLookupQueue.applyFieldLookupChoice(id, job.candidates[0])
    expect(tune.composer).toBe('Old')
    expect(saveTune).not.toHaveBeenCalled()
    expect(tuneFieldLookupQueue.findJobById(id).appliedCandidate.artist).toBe('New Artist')
  })
})
