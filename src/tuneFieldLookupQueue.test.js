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

jest.mock('./commitChordSearchResultToTune', function() {
  return {
    commitChordSearchResultToTune: jest.fn(function() {
      return { ok: true, lyricLines: ['[C]hello'] }
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
    toast: Object.assign(jest.fn(), {
      info: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    }),
  }
})

import { searchLyrics } from './lyricsSearchClient'
import { searchChords } from './chordsSearchClient'
import { discoverComposers } from './composerSearchClient'
import { searchNotation } from './notationSearchClient'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
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
    searchChords.mockReset()
    searchChords.mockResolvedValue({
      multiple: false,
      chordText: 'C G Am F',
      lyricLines: ['hello'],
      lyricText: 'hello',
      source: 'web',
    })
    discoverComposers.mockReset()
    discoverComposers.mockResolvedValue({
      multiple: true,
      candidates: [
        { artist: 'Artist One', source: 'MusicBrainz', preview: 'Artist One' },
        { artist: 'Artist Two', source: 'MusicBrainz', preview: 'Artist Two' },
      ],
    })
    searchNotation.mockReset()
    searchNotation.mockResolvedValue({
      multiple: true,
      candidates: [
        { title: 'Tune', abc: 'X:1\nK:G\nG', source: 'session' },
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

  test('preferChords lyrics job adopts chords when a chord sheet is found', async function() {
    const id = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
      options: { preferChords: true },
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'awaiting' || item.status === 'done' || item.status === 'error')
    })
    expect(searchChords).toHaveBeenCalled()
    expect(searchLyrics).not.toHaveBeenCalled()
    expect(job.id).toBe(id)
    expect(job.kind).toBe('chords')
    expect(job.options && job.options.updateLyrics).toBe(true)
    expect(job.status).toBe('awaiting')
    expect(job.candidates.length).toBeGreaterThan(0)
  })

  test('preferChords lyrics job falls back to plain lyrics when chords miss', async function() {
    searchChords.mockRejectedValueOnce(new Error('No chords found for this song'))
    const id = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
      options: { preferChords: true },
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'awaiting' || item.status === 'error')
    })
    expect(searchChords).toHaveBeenCalled()
    expect(searchLyrics).toHaveBeenCalled()
    expect(job.id).toBe(id)
    expect(job.kind).toBe('lyrics')
    expect(job.status).toBe('awaiting')
    expect(job.candidates.length).toBe(2)
  })

  test('preferChords lyrics job falls back when chords are accompaniment-only', async function() {
    searchChords.mockResolvedValueOnce({
      multiple: false,
      chordText: 'D G Bm A|',
      sheetLines: ['D G Bm A', 'G D D A G'],
      lyricLines: ['D G Bm A', 'G D D A G'],
      lyricText: 'D G Bm A\nG D D A G',
      source: 'FolkTuneFinder',
    })
    const id = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Gumboots',
      artist: 'Paul Simon',
      accessToken: 'token',
      options: { preferChords: true },
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'awaiting' || item.status === 'error')
    })
    expect(searchChords).toHaveBeenCalled()
    expect(searchLyrics).toHaveBeenCalled()
    expect(job.id).toBe(id)
    expect(job.kind).toBe('lyrics')
    expect(job.status).toBe('awaiting')
  })

  test('applyFieldLookupChoice finishes job as done (one-shot)', async function() {
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) { return item && item.status === 'awaiting' })
    const chosen = await tuneFieldLookupQueue.applyFieldLookupChoice(job.id, job.candidates[0])
    expect(chosen.text).toBe('line one')
    expect(tuneFieldLookupQueue.findJobById(job.id).status).toBe('done')
    expect(tuneFieldLookupQueue.findJobById(job.id).candidates.length).toBe(0)
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
      confidence: 'high',
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

  test('empty lyrics field auto-applies first result when no live handler', async function() {
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
    expect(job.status).toBe('done')
    expect(saveTune).toHaveBeenCalled()
    expect(job.candidates).toEqual([])
  })

  test('empty lyrics field stays awaiting when a live handler is registered', async function() {
    const tune = { id: 't1', name: 'Song' }
    const saveTune = jest.fn()
    const onAwaiting = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    tuneFieldLookupQueue.registerLiveHandler('tune:t1', 'lyrics', { onAwaiting: onAwaiting })
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
    expect(saveTune).not.toHaveBeenCalled()
    expect(job.candidates.length).toBeGreaterThan(0)
    expect(onAwaiting).toHaveBeenCalled()
  })

  test('preferChords enhance auto-applies chords when lyrics are empty', async function() {
    const tune = { id: 't1', name: 'Song' }
    const saveTune = jest.fn()
    commitChordSearchResultToTune.mockClear()
    commitChordSearchResultToTune.mockReturnValue({
      ok: true,
      lyricLines: ['[C]hello'],
    })
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
      getTunebook: function() { return { abcTools: {} } },
      getAbcjsParser: function() { return null },
    })
    searchChords.mockResolvedValueOnce({
      multiple: false,
      chordText: '| C |',
      sheetLines: ['[C]hello'],
      lyricLines: ['[C]hello'],
      source: 'ultimate-guitar.com',
    })
    const id = tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'lyrics',
      title: 'Song',
      accessToken: 'token',
      options: { preferChords: true },
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'awaiting' || item.status === 'error')
    })
    expect(job.id).toBe(id)
    expect(job.kind).toBe('chords')
    expect(job.status).toBe('done')
    expect(saveTune).toHaveBeenCalled()
    expect(commitChordSearchResultToTune).toHaveBeenCalled()
  })

  test('empty composer auto-applies single result without awaiting', async function() {
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
      confidence: 'high',
    })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      accessToken: 'token',
      options: tuneFieldLookupQueue.buildSearchModeOptions('auto'),
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
    expect(tuneFieldLookupQueue.findJobById(id).status).toBe('done')
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

  test('notation search ignores MIDI-only results', async function() {
    const { toast } = require('react-toastify')
    toast.info.mockClear()
    searchNotation.mockResolvedValueOnce({
      multiple: true,
      candidates: [{
        title: 'Moonlight Sonata',
        artist: 'Beethoven',
        abc: '',
        importFormat: 'midi',
        source: 'midi-resources',
        sourceUrl: '/midi-resources/Moonlight.mid',
        preview: '',
      }],
    })
    const onAwaiting = jest.fn()
    tuneFieldLookupQueue.registerLiveHandler('tune:t1', 'notation', { onAwaiting: onAwaiting })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'notation',
      title: 'Moonlight Sonata',
      options: { searchMode: 'review', alwaysPick: true },
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'awaiting' || item.status === 'done' || item.status === 'error')
    })
    expect(job.status).toBe('done')
    expect(job.candidates.length).toBe(0)
    expect(onAwaiting).toHaveBeenCalled()
  })

  test('empty notation search does not toast when a live handler is registered', async function() {
    const { toast } = require('react-toastify')
    toast.info.mockClear()
    searchNotation.mockResolvedValueOnce({
      multiple: false,
      empty: true,
      found: false,
      candidates: [],
    })
    const onAwaiting = jest.fn()
    tuneFieldLookupQueue.registerLiveHandler('tune:t1', 'notation', { onAwaiting: onAwaiting })
    tuneFieldLookupQueue.enqueueLookup({
      tuneId: 't1',
      kind: 'notation',
      title: 'Unknown Tune',
      options: { searchMode: 'review', alwaysPick: true },
      accessToken: 'token',
    })
    tuneFieldLookupQueue.start()
    const job = await waitForJob(function(item) {
      return item && (item.status === 'done' || item.status === 'error')
    })
    expect(job.status).toBe('done')
    expect(onAwaiting).toHaveBeenCalled()
    expect(toast.info.mock.calls.some(function(args) {
      return String(args[0] || '').toLowerCase().indexOf('no notation') >= 0
    })).toBe(false)
  })

  test('does not start network lookup jobs while offline', async function() {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      tuneFieldLookupQueue.enqueueLookup({
        tuneId: 't1',
        kind: 'lyrics',
        title: 'Song',
        accessToken: 'token',
      })
      tuneFieldLookupQueue.start()
      await Promise.resolve()
      await Promise.resolve()
      expect(searchLyrics).not.toHaveBeenCalled()
      const pending = tuneFieldLookupQueue.getState().jobs.filter(function(job) {
        return job.status === 'pending'
      })
      expect(pending.length).toBe(1)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })
})
