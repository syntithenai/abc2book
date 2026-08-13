jest.mock('./externalMediaAudioCache', function() {
  return {
    downloadAndCacheExternalMedia: jest.fn(function() {
      return Promise.resolve({ cached: false, duration: 10 })
    }),
    isExternalMediaCached: jest.fn(function() {
      return Promise.resolve(false)
    }),
    getExternalMediaCacheKey: jest.fn(function(tuneId, linkIndex, src) {
      return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src
    }),
  }
})

jest.mock('./mediaProxyClient', function() {
  return {
    requiresResolverProxiedPlayback: jest.fn(function(src) {
      return String(src || '').indexOf('/music-collection/') >= 0
    }),
    getResolverLoginWarning: jest.fn(function() { return null }),
    getResolverProxiedPlaybackBlock: jest.fn(function() { return null }),
  }
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: true, available: true, status: { available: true } }
    }),
    getActiveResolverAccessToken: jest.fn(function() { return 'token' }),
    subscribeMediaResolverHealth: jest.fn(function() {
      return function() {}
    }),
  }
})

jest.mock('./offlinePlayback', function() {
  return {
    isNavigatorOffline: jest.fn(function() { return false }),
  }
})

import * as mediaCacheQueue from './mediaCacheQueue'
import {
  downloadAndCacheExternalMedia,
  isExternalMediaCached,
} from './externalMediaAudioCache'
import {
  getResolverLoginWarning,
  requiresResolverProxiedPlayback,
} from './mediaProxyClient'
import { isNavigatorOffline } from './offlinePlayback'
import {
  getActiveResolverAccessToken,
  getMediaResolverHealthState,
} from './mediaResolverHealthStore'

function flushAsync() {
  return Promise.resolve().then(function() { return Promise.resolve() })
}

describe('mediaCacheQueue', function() {
  beforeEach(function() {
    mediaCacheQueue.__resetMediaCacheQueueForTests()
    downloadAndCacheExternalMedia.mockReset()
    downloadAndCacheExternalMedia.mockResolvedValue({ cached: false, duration: 10 })
    isExternalMediaCached.mockReset()
    isExternalMediaCached.mockResolvedValue(false)
    requiresResolverProxiedPlayback.mockReset()
    requiresResolverProxiedPlayback.mockImplementation(function(src) {
      return String(src || '').indexOf('/music-collection/') >= 0
    })
    getResolverLoginWarning.mockReset()
    getResolverLoginWarning.mockReturnValue(null)
    isNavigatorOffline.mockReset()
    isNavigatorOffline.mockReturnValue(false)
    getActiveResolverAccessToken.mockReset()
    getActiveResolverAccessToken.mockReturnValue('token')
    getMediaResolverHealthState.mockReset()
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      available: true,
      status: { available: true },
    })
    jest.useRealTimers()
  })

  test('deduplicates pending cache jobs', function() {
    const options = {
      tuneId: 't1',
      linkIndex: 0,
      src: 'https://example.com/a.mp3',
      srcType: 'audio',
      tuneName: 'Tune',
    }
    const first = mediaCacheQueue.enqueueCacheJob(options)
    const second = mediaCacheQueue.enqueueCacheJob(options)
    expect(first).toBe(second)
    expect(mediaCacheQueue.getState().jobs.length).toBe(1)
  })

  test('cancel marks pending job cancelled', function() {
    const id = mediaCacheQueue.enqueueCacheJob({
      tuneId: 't2',
      linkIndex: 0,
      src: 'https://example.com/b.mp3',
      srcType: 'audio',
      tuneName: 'Tune 2',
    })
    mediaCacheQueue.cancelJob(id)
    const job = mediaCacheQueue.getState().jobs.find(function(item) { return item.id === id })
    expect(job.status).toBe('cancelled')
  })

  test('removeJobsForTuneIds cancels pending jobs for those tunes only', function() {
    const keepId = mediaCacheQueue.enqueueCacheJob({
      tuneId: 'keep',
      linkIndex: 0,
      src: 'https://example.com/keep.mp3',
      srcType: 'audio',
      tuneName: 'Keep',
    })
    const dropId = mediaCacheQueue.enqueueCacheJob({
      tuneId: 'drop',
      linkIndex: 0,
      src: 'https://example.com/drop.mp3',
      srcType: 'audio',
      tuneName: 'Drop',
    })
    expect(mediaCacheQueue.removeJobsForTuneIds(['drop'])).toBe(1)
    const state = mediaCacheQueue.getState()
    const keep = state.jobs.find(function(item) { return item.id === keepId })
    const drop = state.jobs.find(function(item) { return item.id === dropId })
    expect(keep.status).toBe('pending')
    expect(drop.status).toBe('cancelled')
  })

  test('allows separate mp3 and wav download jobs for the same link', function() {
    const options = {
      tuneId: 't3',
      linkIndex: 0,
      src: 'https://example.com/c.mp3',
      srcType: 'audio',
      tuneName: 'Tune 3',
      tune: { id: 't3', name: 'Tune 3', links: [{ link: 'https://example.com/c.mp3' }] },
      filename: 'Tune_3-link-1.mp3',
      audioFormat: 'mp3',
    }
    const mp3Job = mediaCacheQueue.enqueueDownloadJob(options)
    const wavJob = mediaCacheQueue.enqueueDownloadJob({
      ...options,
      filename: 'Tune_3-link-1.wav',
      audioFormat: 'wav',
    })
    expect(mp3Job).not.toBe(wavJob)
    expect(mediaCacheQueue.getState().jobs.filter(function(item) {
      return item.tuneId === 't3' && item.type === 'download'
    }).length).toBe(2)
  })

  test('canAttemptCacheJob waits when logged out for library links', function() {
    getResolverLoginWarning.mockReturnValue({
      message: 'need login',
      showLoginButton: true,
    })
    expect(mediaCacheQueue.canAttemptCacheJob({
      type: 'cache',
      src: 'https://resolver.example/music-collection/a.mp3',
      accessToken: null,
    }, {
      accessToken: null,
      resolverStatus: { available: false },
      resolverHealth: { checked: true, available: false, status: { available: false } },
    })).toBe(false)
  })

  test('canAttemptCacheJob waits when offline', function() {
    expect(mediaCacheQueue.canAttemptCacheJob({
      type: 'cache',
      src: 'https://example.com/a.mp3',
    }, { offline: true })).toBe(false)
  })

  test('retries failed cache jobs then removes after max attempts', async function() {
    mediaCacheQueue.__setCacheRetryDelayForTests(0)
    downloadAndCacheExternalMedia.mockImplementation(function() {
      return Promise.reject(new Error('logged out'))
    })
    const id = mediaCacheQueue.enqueueCacheJob({
      tuneId: 't4',
      linkIndex: 0,
      src: 'https://example.com/d.mp3',
      srcType: 'audio',
      tuneName: 'Tune 4',
    })

    function waitUntil(predicate) {
      return new Promise(function(resolve, reject) {
        function check() {
          if (predicate()) {
            unsub()
            resolve(mediaCacheQueue.getState())
          }
        }
        const unsub = mediaCacheQueue.subscribe(check)
        check()
        setTimeout(function() {
          unsub()
          reject(new Error('timed out'))
        }, 2000)
      })
    }

    mediaCacheQueue.start()
    await waitUntil(function() {
      return downloadAndCacheExternalMedia.mock.calls.length >= 3
        && !mediaCacheQueue.getState().jobs.find(function(item) { return item.id === id })
    })
    expect(downloadAndCacheExternalMedia).toHaveBeenCalledTimes(3)
    expect(mediaCacheQueue.getState().jobs.find(function(item) { return item.id === id })).toBeFalsy()
  })

  test('does not burn attempts while waiting for login', async function() {
    getResolverLoginWarning.mockReturnValue({
      message: 'need login',
      showLoginButton: true,
    })
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      available: false,
      status: { available: false },
    })
    mediaCacheQueue.enqueueCacheJob({
      tuneId: 't5',
      linkIndex: 0,
      src: 'https://resolver.example/music-collection/e.mp3',
      srcType: 'audio',
      tuneName: 'Tune 5',
    })
    mediaCacheQueue.start()
    await flushAsync()
    const job = mediaCacheQueue.getState().jobs[0]
    expect(job.status).toBe('pending')
    expect(job.attempts).toBe(0)
    expect(job.message).toMatch(/login/i)
    expect(downloadAndCacheExternalMedia).not.toHaveBeenCalled()
  })
})
