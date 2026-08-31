/**
 * Detect failed HTTP / axios / MusicBrainz errors that should not crash the UI.
 */
export function isUnhandledNetworkFailure(reason) {
  if (!reason) return false
  if (reason.name === 'AbortError') return false
  const code = reason.code
  if (
    code === 'MUSICBRAINZ_BUSY'
    || code === 'HTTP_ERROR'
    || code === 'NETWORK_ERROR'
    || code === 'ERR_NETWORK'
    || code === 'ECONNABORTED'
  ) {
    return true
  }
  if (reason.isAxiosError) return true
  if (reason.response && typeof reason.response.status === 'number') return true
  const message = String(reason.message || reason || '')
  if (/Request failed with status code \d+/i.test(message)) return true
  if (/^Network Error$/i.test(message)) return true
  if (/MusicBrainz is busy/i.test(message)) return true
  return false
}

export function networkFailureToastMessage(reason) {
  const message = reason && reason.message ? String(reason.message).trim() : ''
  if (message && !/^Request failed with status code \d+$/i.test(message)) {
    return message
  }
  return 'A network request failed. Try again.'
}

/**
 * webpack-dev-server runtime overlay ignores preventDefault on unhandledrejection
 * and paints a full-screen black iframe. Remove it after we handle network failures.
 */
export function dismissWebpackDevServerOverlay() {
  if (typeof document === 'undefined') return
  function remove() {
    try {
      const el = document.getElementById('webpack-dev-server-client-overlay')
      if (el && el.parentNode) el.parentNode.removeChild(el)
    } catch (e) {
      // ignore DOM failures
    }
  }
  remove()
  // Overlay iframe is often created asynchronously after the rejection listener runs.
  if (typeof setTimeout === 'function') {
    setTimeout(remove, 0)
    setTimeout(remove, 50)
  }
}

let networkHandlersInstalled = false

/**
 * Swallow unhandled network rejections and surface a toast instead of blanking the UI.
 * @param {function(string): void} toastError
 */
export function installUnhandledNetworkErrorHandlers(toastError) {
  if (networkHandlersInstalled || typeof window === 'undefined') return
  networkHandlersInstalled = true

  window.addEventListener('unhandledrejection', function(event) {
    if (!isUnhandledNetworkFailure(event.reason)) return
    event.preventDefault()
    dismissWebpackDevServerOverlay()
    if (typeof toastError === 'function') {
      try {
        toastError(networkFailureToastMessage(event.reason))
      } catch (e) {
        // ignore toast failures
      }
    }
  }, true)
}

export function resetUnhandledNetworkErrorHandlersForTests() {
  networkHandlersInstalled = false
}
