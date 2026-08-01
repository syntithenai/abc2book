/**
 * Page bridge: DOM marker + CustomEvent + window.postMessage ↔ background.
 * Uses runtime.connect only — never runtime.sendMessage (breaks in some contexts).
 */
;(function () {
  'use strict'

  const PAGE_SOURCE = 'tunebook-page'
  const EXT_SOURCE = 'tunebook-extension'
  const EXT_VERSION = '0.1.7'
  const ATTR = 'data-tunebook-yt-helper'
  const PING_PORT = 'tunebook-ping'
  const AUDIO_PORT = 'tunebook-yt'
  const PING_TIMEOUT_MS = 4000

  let extApi = null
  try {
    const root =
      typeof chrome !== 'undefined'
        ? chrome
        : (typeof browser !== 'undefined' ? browser : null)
    if (root && root.runtime && root.runtime.id) {
      extApi = root
    }
  } catch (e) {
    extApi = null
  }

  if (!extApi) return

  function getExtensionRuntime() {
    try {
      if (!extApi || !extApi.runtime) return null
      const runtime = extApi.runtime
      if (!runtime.id) return null
      return runtime
    } catch (e) {
      return null
    }
  }

  function isRuntimeAvailable() {
    return !!getExtensionRuntime()
  }

  function clearPresenceMarker() {
    try {
      if (document.documentElement) {
        document.documentElement.removeAttribute(ATTR)
      }
    } catch (e) {
      // ignore
    }
  }

  function runtimeUnavailableMessage() {
    return 'Extension runtime unavailable — reload this tab after enabling TuneBook Helper'
  }

  function safeCallback(callback, response, err) {
    if (!callback) return
    try {
      callback(response, err)
    } catch (e) {
      // ignore page handler errors
    }
  }

  function getRuntimeLastError(runtime) {
    try {
      return runtime && runtime.lastError ? runtime.lastError : null
    } catch (e) {
      return e
    }
  }

  function openRuntimePort(name) {
    const runtime = getExtensionRuntime()
    if (!runtime) return null
    try {
      const connect = runtime.connect
      if (typeof connect !== 'function') return null
      return connect.call(runtime, { name: name })
    } catch (e) {
      return null
    }
  }

  function pingExtension(callback) {
    const runtime = getExtensionRuntime()
    if (!runtime) {
      safeCallback(callback, null, { message: runtimeUnavailableMessage() })
      return false
    }

    const port = openRuntimePort(PING_PORT)
    if (!port) {
      safeCallback(callback, null, { message: runtimeUnavailableMessage() })
      return false
    }

    let settled = false
    const timer = setTimeout(function () {
      if (settled) return
      settled = true
      try {
        port.disconnect()
      } catch (e) {
        // ignore
      }
      safeCallback(callback, null, { message: 'Extension ping timed out' })
    }, PING_TIMEOUT_MS)

    function finish(response, err) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        port.disconnect()
      } catch (e) {
        // ignore
      }
      safeCallback(callback, response, err)
    }

    port.onMessage.addListener(function (msg) {
      if (settled) return
      finish(msg, null)
    })
    port.onDisconnect.addListener(function () {
      if (settled) return
      const err = getRuntimeLastError(runtime)
      finish(null, err || { message: runtimeUnavailableMessage() })
    })
    try {
      port.postMessage({ type: 'tunebook.ping' })
    } catch (e) {
      finish(null, e)
      return false
    }
    return true
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

  function markPresence() {
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

  function announcePresence() {
    pingExtension(function (response, err) {
      if (err || !response) {
        clearPresenceMarker()
        return
      }
      markPresence()
    })
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
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return true
    } catch (e) {
      return false
    }
    return false
  }

  function handlePageRequest(data) {
    if (!data || typeof data.type !== 'string') return

    if (data.type === 'tunebook.ping') {
      pingExtension(function (response, err) {
        if (err) {
          clearPresenceMarker()
          const message =
            err && err.message
              ? String(err.message)
              : runtimeUnavailableMessage()
          postToPage({
            type: 'tunebook.pong',
            requestId: data.requestId,
            ok: false,
            error: message || 'Extension service worker unavailable',
          })
          return
        }
        if (!response) {
          clearPresenceMarker()
          postToPage({
            type: 'tunebook.pong',
            requestId: data.requestId,
            ok: false,
            error: runtimeUnavailableMessage(),
          })
          return
        }
        markPresence()
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
      const port = openRuntimePort(AUDIO_PORT)
      if (!port) {
        clearPresenceMarker()
        postToPage({
          type: 'tunebook.audioError',
          requestId: requestId,
          code: 'connect_failed',
          message: runtimeUnavailableMessage(),
        })
        return
      }

      port.onMessage.addListener(function (msg) {
        if (!msg || typeof msg !== 'object') return
        postToPage(Object.assign({}, msg, { requestId: msg.requestId || requestId }))
      })
      port.onDisconnect.addListener(function () {
        try {
          const runtime = getExtensionRuntime()
          const err = runtime && getRuntimeLastError(runtime)
          if (err) {
            postToPage({
              type: 'tunebook.audioError',
              requestId: requestId,
              code: 'disconnect',
              message: err.message || 'Extension disconnected',
            })
          }
        } catch (e) {
          clearPresenceMarker()
        }
      })
      try {
        port.postMessage({
          type: 'tunebook.fetchYoutubeAudio',
          videoId: videoId,
          requestId: requestId,
        })
      } catch (err) {
        postToPage({
          type: 'tunebook.audioError',
          requestId: requestId,
          code: 'connect_failed',
          message: err && err.message ? String(err.message) : 'Could not connect to extension',
        })
      }
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return
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

  setInterval(function () {
    if (!isRuntimeAvailable()) {
      clearPresenceMarker()
    }
  }, 3000)
})()
