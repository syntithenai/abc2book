/**
 * Tunebook page ↔ TuneBook Helper extension bridge.
 * Discovery: DOM attribute, CustomEvent, then postMessage ping (with retry).
 */

import { isYoutubeHelperDisabled } from './youtubeHelperSettings'

const PAGE_SOURCE = 'tunebook-page'
const DISABLED_ERROR = 'TuneBook Helper disabled in settings'
const EXT_SOURCE = 'tunebook-extension'
const ATTR = 'data-tunebook-yt-helper'

const PING_TIMEOUT_MS = 4000
const FETCH_TIMEOUT_MS = 180000
const PING_CACHE_MS = 10000

let nextRequestId = 1
let cachedPing = null
let cachedPingAt = 0
/** @type {Map<string, { abort: function(): void }>} */
const activeFetches = new Map()

function abortAllYoutubeExtensionFetches() {
  activeFetches.forEach(function (entry) {
    entry.abort()
  })
  activeFetches.clear()
}

function disabledPingResult() {
  return { ok: false, error: DISABLED_ERROR, disabled: true }
}

function makeRequestId() {
  nextRequestId += 1
  return 'yt-ext-' + Date.now() + '-' + nextRequestId
}

function readDomMarker() {
  try {
    if (typeof document === 'undefined' || !document.documentElement) return null
    const version = document.documentElement.getAttribute(ATTR)
    if (!version) return null
    return { ok: true, version: version, via: 'dom' }
  } catch (e) {
    return null
  }
}

function postToExtension(payload) {
  const body = Object.assign({ source: PAGE_SOURCE }, payload)
  try {
    window.postMessage(body, '*')
  } catch (e) {
    // ignore
  }
  try {
    document.documentElement.dispatchEvent(
      new CustomEvent('tunebook-yt-helper-request', {
        bubbles: true,
        detail: body,
      })
    )
  } catch (e) {
    // ignore
  }
}

function waitForExtensionMessage(predicate, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      cleanup()
      reject(new Error('TuneBook Helper extension timed out'))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener('message', onWindowMessage)
      document.removeEventListener('tunebook-yt-helper-message', onDomMessage, true)
      document.removeEventListener('tunebook-yt-helper-ready', onReady, true)
    }

    function consider(data) {
      if (!data || data.source !== EXT_SOURCE) return
      if (!predicate(data)) return
      cleanup()
      resolve(data)
    }

    function onWindowMessage(event) {
      if (event.source !== window) return
      consider(event.data)
    }

    function onDomMessage(event) {
      consider(event && event.detail)
    }

    function onReady(event) {
      const detail = (event && event.detail) || {}
      consider(
        Object.assign({ type: 'tunebook.ready', source: EXT_SOURCE }, detail)
      )
    }

    window.addEventListener('message', onWindowMessage)
    document.addEventListener('tunebook-yt-helper-message', onDomMessage, true)
    document.addEventListener('tunebook-yt-helper-ready', onReady, true)
  })
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function pingRoundTrip(timeoutMs) {
  const requestId = makeRequestId()
  const wait = waitForExtensionMessage(function (data) {
    return data.type === 'tunebook.pong' && data.requestId === requestId
  }, timeoutMs || PING_TIMEOUT_MS)

  postToExtension({ type: 'tunebook.ping', requestId: requestId })

  const response = await wait
  if (response.ok === false) {
    return { ok: false, error: response.error || 'Extension unavailable' }
  }
  return {
    ok: true,
    version: response.version || null,
    extensionId: response.extensionId || null,
    via: 'ping',
  }
}

/**
 * @returns {Promise<{ ok: boolean, version?: string, extensionId?: string, error?: string, via?: string }>}
 */
export async function pingYoutubeExtension(options) {
  const force = options && options.force
  const timeoutMs = (options && options.timeoutMs) || PING_TIMEOUT_MS
  const now = Date.now()
  if (isYoutubeHelperDisabled()) {
    cachedPing = disabledPingResult()
    cachedPingAt = now
    return cachedPing
  }
  if (!force && cachedPing && now - cachedPingAt < PING_CACHE_MS) {
    return cachedPing
  }

  if (typeof window === 'undefined') {
    cachedPing = { ok: false, error: 'No window' }
    cachedPingAt = now
    return cachedPing
  }

  const dom = readDomMarker()
  if (dom) {
    try {
      const live = await pingRoundTrip(timeoutMs)
      cachedPing = live.ok ? live : Object.assign({}, dom, { swError: live.error })
      cachedPingAt = Date.now()
      return cachedPing
    } catch (err) {
      cachedPing = Object.assign({}, dom, {
        swError: err && err.message ? String(err.message) : 'ping failed',
      })
      cachedPingAt = Date.now()
      return cachedPing
    }
  }

  try {
    cachedPing = await pingRoundTrip(timeoutMs)
  } catch (err) {
    await new Promise(function (resolve) {
      setTimeout(resolve, 250)
    })
    const domRetry = readDomMarker()
    if (domRetry) {
      cachedPing = domRetry
    } else {
      try {
        cachedPing = await pingRoundTrip(timeoutMs)
      } catch (err2) {
        cachedPing = {
          ok: false,
          error:
            (err2 && err2.message ? String(err2.message) : null) ||
            'Extension not connected — load unpacked browser-extension/ and reload this tab',
        }
      }
    }
  }
  cachedPingAt = Date.now()
  return cachedPing
}

export async function isYoutubeExtensionConnected() {
  const result = await pingYoutubeExtension()
  return !!result.ok
}

/**
 * Cheap sync connectivity check: DOM marker set by the content script, or a
 * recent successful ping. May miss the extension right after page load
 * (before the content script runs); the async check is authoritative.
 */
export function isYoutubeExtensionConnectedSync() {
  if (isYoutubeHelperDisabled()) return false
  if (cachedPing && cachedPing.ok) {
    return true
  }
  return !!readDomMarker()
}

/**
 * @param {string} videoId
 * @returns {Promise<{ arrayBuffer: ArrayBuffer, mime: string, title: string|null, client: string|null, via: 'extension' }>}
 */
export async function fetchYoutubeAudioViaExtension(videoId) {
  const id = String(videoId || '').trim()
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new Error('Invalid YouTube video id')
  }
  if (isYoutubeHelperDisabled()) {
    throw new Error(DISABLED_ERROR)
  }

  const connected = await pingYoutubeExtension({ force: true })
  if (!connected.ok) {
    throw new Error(
      connected.error ||
        'TuneBook Helper extension is not connected. Install it from browser-extension/ and reload this tab.'
    )
  }

  const requestId = makeRequestId()
  const chunks = []
  let meta = null

  const done = new Promise(function (resolve, reject) {
    let settled = false
    const timer = setTimeout(function () {
      cleanup()
      reject(new Error('TuneBook Helper extension fetch timed out'))
    }, FETCH_TIMEOUT_MS)

    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener('message', onWindowMessage)
      document.removeEventListener('tunebook-yt-helper-message', onDomMessage, true)
      activeFetches.delete(requestId)
    }

    function finish(fn) {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    function abort() {
      finish(function () {
        reject(new Error(DISABLED_ERROR))
      })
    }

    activeFetches.set(requestId, { abort: abort })

    function handle(data) {
      if (settled) return
      if (!data || data.source !== EXT_SOURCE) return
      if (data.requestId !== requestId) return

      if (data.type === 'tunebook.audioMeta') {
        meta = data
        return
      }
      if (data.type === 'tunebook.audioChunk') {
        chunks[data.index] = data.base64 || ''
        return
      }
      if (data.type === 'tunebook.audioDone') {
        finish(function () {
          resolve(true)
        })
        return
      }
      if (data.type === 'tunebook.audioError') {
        finish(function () {
          reject(
            new Error(data.message || data.code || 'TuneBook Helper extension fetch failed')
          )
        })
      }
    }

    function onWindowMessage(event) {
      if (event.source !== window) return
      handle(event.data)
    }

    function onDomMessage(event) {
      handle(event && event.detail)
    }

    window.addEventListener('message', onWindowMessage)
    document.addEventListener('tunebook-yt-helper-message', onDomMessage, true)
  })

  postToExtension({
    type: 'tunebook.fetchYoutubeAudio',
    videoId: id,
    requestId: requestId,
  })

  await done

  const base64 = chunks.join('')
  if (!base64) {
    throw new Error('TuneBook Helper extension returned empty audio')
  }

  return {
    arrayBuffer: base64ToArrayBuffer(base64),
    mime: (meta && meta.mime) || 'audio/mp4',
    title: (meta && meta.title) || null,
    client: (meta && meta.client) || null,
    via: 'extension',
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('youtubeHelperSettingsChanged', function () {
    __resetYoutubeExtensionPingCache()
    abortAllYoutubeExtensionFetches()
  })
}

/** Test helpers */
export function __resetYoutubeExtensionPingCache() {
  cachedPing = null
  cachedPingAt = 0
}

export function __abortAllYoutubeExtensionFetchesForTests() {
  abortAllYoutubeExtensionFetches()
}

export function __base64ToArrayBufferForTests(base64) {
  return base64ToArrayBuffer(base64)
}

export function __arrayBufferPartsToBase64ForTests(parts) {
  return parts.join('')
}

export function __readDomMarkerForTests() {
  return readDomMarker()
}
