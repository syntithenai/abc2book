export function isYoutubeDetachedPlayerError(err) {
  const msg = err && err.message ? String(err.message) : String(err || '')
  return /not attached to the DOM/i.test(msg)
    || /Cannot read propert(y|ies) of null \(reading 'playVideo'\)/.test(msg)
}

let detachedPlayerHandlersInstalled = false

export function installYoutubeDetachedPlayerErrorHandlers() {
  if (detachedPlayerHandlersInstalled || typeof window === 'undefined') return
  detachedPlayerHandlersInstalled = true

  // Capture phase + stopImmediatePropagation so CRA's error overlay does not
  // treat teardown races as fatal app errors.
  window.addEventListener('unhandledrejection', function(event) {
    if (isYoutubeDetachedPlayerError(event.reason)) {
      event.preventDefault()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
    }
  }, true)

  window.addEventListener('error', function(event) {
    if (isYoutubeDetachedPlayerError(event.error || event.message)) {
      event.preventDefault()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
    }
  }, true)
}
