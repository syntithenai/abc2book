import {
  __base64ToArrayBufferForTests,
  __readDomMarkerForTests,
  __resetYoutubeExtensionPingCache,
  fetchYoutubeAudioViaExtension,
  isYoutubeExtensionConnected,
  pingYoutubeExtension,
} from './youtubeExtensionClient'
import { youtubeAudioBytesAvailable } from './youtubeUnlock'

function encodeBase64(str) {
  return Buffer.from(str, 'binary').toString('base64')
}

describe('youtubeExtensionClient', function () {
  let postMessageSpy
  let listeners

  beforeEach(function () {
    __resetYoutubeExtensionPingCache()
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
    listeners = []
    postMessageSpy = jest.fn()
    Object.defineProperty(window, 'postMessage', {
      configurable: true,
      writable: true,
      value: postMessageSpy,
    })
    jest.spyOn(window, 'addEventListener').mockImplementation(function (type, fn) {
      if (type === 'message') listeners.push(fn)
    })
    jest.spyOn(window, 'removeEventListener').mockImplementation(function (type, fn) {
      if (type === 'message') {
        listeners = listeners.filter(function (l) {
          return l !== fn
        })
      }
    })
    jest.spyOn(document, 'addEventListener').mockImplementation(function (type, fn) {
      if (
        type === 'tunebook-yt-helper-message' ||
        type === 'tunebook-yt-helper-ready' ||
        type === 'tunebook-yt-helper-request'
      ) {
        listeners.push(fn)
      }
    })
    jest.spyOn(document, 'removeEventListener').mockImplementation(function (type, fn) {
      listeners = listeners.filter(function (l) {
        return l !== fn
      })
    })
  })

  afterEach(function () {
    jest.restoreAllMocks()
  })

  function emitFromExtension(payload) {
    listeners.slice().forEach(function (fn) {
      try {
        fn({
          source: window,
          data: Object.assign({ source: 'tunebook-extension' }, payload),
          detail: Object.assign({ source: 'tunebook-extension' }, payload),
        })
      } catch (e) {
        // ignore
      }
    })
  }

  test('pingYoutubeExtension resolves pong', async function () {
    const pending = pingYoutubeExtension({ force: true, timeoutMs: 500 })
    const sent = postMessageSpy.mock.calls[0][0]
    emitFromExtension({
      type: 'tunebook.pong',
      requestId: sent.requestId,
      version: '0.1.1',
      extensionId: 'abc',
      ok: true,
    })
    const result = await pending
    expect(result.ok).toBe(true)
    expect(result.version).toBe('0.1.1')
    await expect(isYoutubeExtensionConnected()).resolves.toBe(true)
  })

  test('pingYoutubeExtension uses DOM marker when present', async function () {
    document.documentElement.setAttribute('data-tunebook-yt-helper', '0.1.1')
    expect(__readDomMarkerForTests()).toEqual({
      ok: true,
      version: '0.1.1',
      via: 'dom',
    })
    const pending = pingYoutubeExtension({ force: true, timeoutMs: 50 })
    // no pong — should still succeed via DOM after short timeout
    const result = await pending
    expect(result.ok).toBe(true)
    expect(result.version).toBe('0.1.1')
  })

  test('pingYoutubeExtension times out as not connected', async function () {
    const result = await pingYoutubeExtension({ force: true, timeoutMs: 40 })
    expect(result.ok).toBe(false)
    expect(String(result.error || '')).toMatch(/not connected|timed out/i)
  })

  test('youtubeAudioBytesAvailable true for BYOR fat proxy features', async function () {
    __resetYoutubeExtensionPingCache()
    await expect(
      youtubeAudioBytesAvailable({
        resolverFeatures: { proxy: true, lightMode: false },
      })
    ).resolves.toBe(true)
  })

  test('fetchYoutubeAudioViaExtension reassembles chunks', async function () {
    const payload = 'hello-audio'
    const b64 = encodeBase64(payload)
    const mid = Math.ceil(b64.length / 2)

    const pending = fetchYoutubeAudioViaExtension('dQw4w9WgXcQ')

    await Promise.resolve()
    const pingCall = postMessageSpy.mock.calls.find(function (c) {
      return c[0].type === 'tunebook.ping'
    })
    expect(pingCall).toBeTruthy()
    emitFromExtension({
      type: 'tunebook.pong',
      requestId: pingCall[0].requestId,
      version: '0.1.1',
      ok: true,
    })

    let fetchCall
    for (let i = 0; i < 20 && !fetchCall; i++) {
      await Promise.resolve()
      fetchCall = postMessageSpy.mock.calls.find(function (c) {
        return c[0].type === 'tunebook.fetchYoutubeAudio'
      })
    }
    expect(fetchCall).toBeTruthy()
    const requestId = fetchCall[0].requestId

    emitFromExtension({
      type: 'tunebook.audioMeta',
      requestId: requestId,
      mime: 'audio/mp4',
      byteLength: payload.length,
      totalChunks: 2,
      client: 'ANDROID',
      title: 'Test',
    })
    emitFromExtension({
      type: 'tunebook.audioChunk',
      requestId: requestId,
      index: 0,
      total: 2,
      base64: b64.slice(0, mid),
    })
    emitFromExtension({
      type: 'tunebook.audioChunk',
      requestId: requestId,
      index: 1,
      total: 2,
      base64: b64.slice(mid),
    })
    emitFromExtension({
      type: 'tunebook.audioDone',
      requestId: requestId,
    })

    const result = await pending
    expect(result.via).toBe('extension')
    expect(Buffer.from(result.arrayBuffer).toString('binary')).toBe(payload)
  })

  test('base64 helper round-trips', function () {
    const buf = __base64ToArrayBufferForTests(encodeBase64('xyz'))
    expect(Buffer.from(buf).toString('binary')).toBe('xyz')
  })
})
