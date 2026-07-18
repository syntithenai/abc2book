/**
 * Page bridge: DOM marker + CustomEvent + window.postMessage ↔ background.
 * Dual channels make discovery reliable across Chromium builds.
 */

const PAGE_SOURCE = 'tunebook-page'
const EXT_SOURCE = 'tunebook-extension'
const EXT_VERSION = '0.1.3'
const ATTR = 'data-tunebook-yt-helper'

function announcePresence() {
  try {
    if (document.documentElement) {
      document.documentElement.setAttribute(ATTR, EXT_VERSION)
    }
  } catch (e) {
    // ignore
  }
  try {
    document.documentElement.dispatchEvent(
      new CustomEvent('tunebook-yt-helper-ready', {
        bubbles: true,
        detail: { version: EXT_VERSION, source: EXT_SOURCE },
      })
    )
  } catch (e) {
    // ignore
  }
  postToPage({ type: 'tunebook.ready', version: EXT_VERSION })
}

function isAllowedPageOrigin(origin) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    const host = url.hostname
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
      return true
    }
    if (host === 'tunebook.net' || host === 'www.tunebook.net') return true
    if (host === 'peppertrees.syntithenai.com') return true
    if (host.endsWith('.syntithenai.com')) return true
    // LAN / link-local during dev (content script only injects where matched)
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return true
  } catch (e) {
    return false
  }
  return false
}

function postToPage(payload) {
  const body = Object.assign({ source: EXT_SOURCE }, payload)
  try {
    window.postMessage(body, '*')
  } catch (e) {
    // ignore
  }
  try {
    document.documentElement.dispatchEvent(
      new CustomEvent('tunebook-yt-helper-message', {
        bubbles: true,
        detail: body,
      })
    )
  } catch (e) {
    // ignore
  }
}

function handlePageRequest(data) {
  if (!data || typeof data.type !== 'string') return

  if (data.type === 'tunebook.ping') {
    chrome.runtime.sendMessage({ type: 'tunebook.ping' }, function (response) {
      const err = chrome.runtime.lastError
      if (err) {
        postToPage({
          type: 'tunebook.pong',
          requestId: data.requestId,
          ok: false,
          error: err.message || 'Extension service worker unavailable',
        })
        return
      }
      postToPage(
        Object.assign({}, response || {}, {
          type: 'tunebook.pong',
          requestId: data.requestId,
          ok: true,
        })
      )
    })
    return
  }

  if (data.type === 'tunebook.fetchYoutubeAudio') {
    const requestId = data.requestId
    const videoId = data.videoId
    let port
    try {
      port = chrome.runtime.connect({ name: 'tunebook-yt' })
    } catch (err) {
      postToPage({
        type: 'tunebook.audioError',
        requestId: requestId,
        code: 'connect_failed',
        message: err && err.message ? String(err.message) : 'Could not connect to extension',
      })
      return
    }

    port.onMessage.addListener(function (msg) {
      if (!msg || typeof msg !== 'object') return
      postToPage(Object.assign({}, msg, { requestId: msg.requestId || requestId }))
    })
    port.onDisconnect.addListener(function () {
      const err = chrome.runtime.lastError
      if (err) {
        postToPage({
          type: 'tunebook.audioError',
          requestId: requestId,
          code: 'disconnect',
          message: err.message || 'Extension disconnected',
        })
      }
    })
    port.postMessage({
      type: 'tunebook.fetchYoutubeAudio',
      videoId: videoId,
      requestId: requestId,
    })
  }
}

window.addEventListener('message', function (event) {
  if (event.source !== window) return
  // Accept same-window messages; origin check is best-effort (some embeds use "null")
  if (event.origin && event.origin !== 'null' && !isAllowedPageOrigin(event.origin)) return
  const data = event.data
  if (!data || data.source !== PAGE_SOURCE) return
  handlePageRequest(data)
})

document.addEventListener(
  'tunebook-yt-helper-request',
  function (event) {
    const data = event && event.detail
    if (!data || data.source !== PAGE_SOURCE) return
    handlePageRequest(data)
  },
  true
)

announcePresence()
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', announcePresence, { once: true })
}
