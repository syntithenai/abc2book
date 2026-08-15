jest.mock('./mediaCacheStorage', function() {
  return {
    clearAudioCacheForTuneIds: jest.fn(function() {
      return Promise.resolve({ removed: 2 })
    }),
    clearStemCacheForTuneIds: jest.fn(function() {
      return Promise.resolve({ removed: 1 })
    }),
    clearMidiCacheForTuneIds: jest.fn(function() {
      return Promise.resolve({ removed: 3 })
    }),
    clearExternalMediaCacheForTuneIdAndSrcs: jest.fn(function() {
      return Promise.resolve({ removed: 1 })
    }),
  }
})

jest.mock('./timedMediaCache', function() {
  return {
    clearTimedMediaDraft: jest.fn(function() {
      return Promise.resolve()
    }),
  }
})

jest.mock('./mediaCacheQueue', function() {
  return {
    removeJobsForTuneIds: jest.fn(function() { return 1 }),
    removeJobsForTuneIdAndSrcs: jest.fn(function() { return 1 }),
  }
})

jest.mock('./mediaCacheDriveBackup', function() {
  return {
    enqueueCachedMediaDriveDeletesForTuneIds: jest.fn(function() {
      return Promise.resolve([])
    }),
    enqueueCachedMediaDriveDeletesForSrcs: jest.fn(function() {
      return Promise.resolve([])
    }),
  }
})

const {
  clearAudioCacheForTuneIds,
  clearStemCacheForTuneIds,
  clearMidiCacheForTuneIds,
  clearExternalMediaCacheForTuneIdAndSrcs,
} = require('./mediaCacheStorage')
const { clearTimedMediaDraft } = require('./timedMediaCache')
const { removeJobsForTuneIds, removeJobsForTuneIdAndSrcs } = require('./mediaCacheQueue')
const { enqueueCachedMediaDriveDeletesForTuneIds, enqueueCachedMediaDriveDeletesForSrcs } = require('./mediaCacheDriveBackup')
const { clearCachedMediaForDeletedTuneIds, clearCachedMediaForRemovedLinkSrcs } = require('./deletedTuneMediaCleanup')

describe('clearCachedMediaForDeletedTuneIds', function() {
  beforeEach(function() {
    clearAudioCacheForTuneIds.mockClear()
    clearStemCacheForTuneIds.mockClear()
    clearMidiCacheForTuneIds.mockClear()
    clearTimedMediaDraft.mockClear()
    removeJobsForTuneIds.mockClear()
    removeJobsForTuneIdAndSrcs.mockClear()
    enqueueCachedMediaDriveDeletesForTuneIds.mockClear()
    enqueueCachedMediaDriveDeletesForSrcs.mockClear()
    clearExternalMediaCacheForTuneIdAndSrcs.mockClear()
    clearExternalMediaCacheForTuneIdAndSrcs.mockResolvedValue({ removed: 1 })
  })

  test('no-ops for empty tune id lists', async function() {
    const result = await clearCachedMediaForDeletedTuneIds([])
    expect(result).toEqual({
      audio: { removed: 0 },
      stems: { removed: 0 },
      midi: { removed: 0 },
    })
    expect(removeJobsForTuneIds).not.toHaveBeenCalled()
    expect(clearAudioCacheForTuneIds).not.toHaveBeenCalled()
    expect(clearStemCacheForTuneIds).not.toHaveBeenCalled()
    expect(clearMidiCacheForTuneIds).not.toHaveBeenCalled()
  })

  test('clears audio, stems, midi, timed drafts, and cancels queue jobs', async function() {
    await clearCachedMediaForDeletedTuneIds(['t1', 't1', '', null, 't2'])

    expect(removeJobsForTuneIds).toHaveBeenCalledWith(['t1', 't2'])
    expect(clearAudioCacheForTuneIds).toHaveBeenCalledWith(['t1', 't2'])
    expect(clearStemCacheForTuneIds).toHaveBeenCalledWith(['t1', 't2'])
    expect(clearMidiCacheForTuneIds).toHaveBeenCalledWith(['t1', 't2'])
    expect(clearTimedMediaDraft).toHaveBeenCalledWith('t1')
    expect(clearTimedMediaDraft).toHaveBeenCalledWith('t2')
    expect(enqueueCachedMediaDriveDeletesForTuneIds).toHaveBeenCalledWith(['t1', 't2'])
  })

  test('does not pass respectLock options (force-clear on delete)', async function() {
    await clearCachedMediaForDeletedTuneIds(['locked-tune'])
    expect(clearAudioCacheForTuneIds.mock.calls[0].length).toBe(1)
    expect(clearStemCacheForTuneIds.mock.calls[0].length).toBe(1)
    expect(clearMidiCacheForTuneIds.mock.calls[0].length).toBe(1)
  })

  test('clears matching cache keys and Drive copies for removed link srcs', async function() {
    const result = await clearCachedMediaForRemovedLinkSrcs('t1', ['https://a.example/x.mp3', 'https://a.example/x.mp3'])
    expect(removeJobsForTuneIdAndSrcs).toHaveBeenCalledWith('t1', ['https://a.example/x.mp3'])
    expect(enqueueCachedMediaDriveDeletesForSrcs).toHaveBeenCalledWith('t1', ['https://a.example/x.mp3'])
    expect(clearExternalMediaCacheForTuneIdAndSrcs).toHaveBeenCalledWith('t1', ['https://a.example/x.mp3'])
    expect(result).toEqual({ removed: 1 })
  })
})
