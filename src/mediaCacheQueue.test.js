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

import * as mediaCacheQueue from './mediaCacheQueue'

describe('mediaCacheQueue', function() {
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
})
