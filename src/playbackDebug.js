/**
 * Optional playback routing diagnostics (localStorage tunebook_playback_debug=1).
 */
const AGENT_DEBUG_ENDPOINT = 'http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120'
const AGENT_DEBUG_SESSION = '4a62b2'
const ROUTE_LOG_MAX = 50
// #region agent log
const AGENT_DEBUG_FORCE = true
// #endregion

export function isPlaybackDebugEnabled() {
  if (typeof window === 'undefined') return false
  // #region agent log
  if (AGENT_DEBUG_FORCE) return true
  // #endregion
  try {
    if (window.__tunebookPlaybackDebug) return true
    if (window.__tunebookAgentDebug) return true
    return localStorage.getItem('tunebook_playback_debug') === '1'
  } catch (e) {
    return false
  }
}

export function isPlaybackRouteLogEnabled() {
  if (typeof window === 'undefined') return false
  if (window.__tunebookPlaybackRouteLogEnabled) return true
  return isPlaybackDebugEnabled()
}

/** Ensure ring buffer exists when route logging is on (devtools / E2E). */
export function ensurePlaybackRouteLogBuffer() {
  if (typeof window === 'undefined') return
  if (!isPlaybackRouteLogEnabled()) return
  if (!window.__tunebookPlaybackRouteLog) {
    window.__tunebookPlaybackRouteLog = []
  }
}

if (typeof window !== 'undefined') {
  ensurePlaybackRouteLogBuffer()
}

function redactUrl(src) {
  if (!src) return ''
  try {
    const url = new URL(String(src), typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return url.hostname + url.pathname
  } catch (e) {
    const trimmed = String(src).trim()
    if (trimmed.length > 80) return trimmed.slice(0, 80) + '…'
    return trimmed
  }
}

export function redactPlaybackRouteLogEntry(entry) {
  const e = entry || {}
  const context = e.context ? Object.assign({}, e.context) : null
  if (context && context.src) {
    context.src = redactUrl(context.src)
  }
  return {
    phase: e.phase,
    branch: e.branch,
    context: context,
    expected: e.expected,
    actual: e.actual,
    match: e.match,
    severity: e.severity,
    reason: e.reason,
    snapcastAttempted: e.snapcastAttempted,
    timestamp: e.timestamp,
  }
}

function pushRouteLogEntry(entry) {
  if (typeof window === 'undefined') return
  if (!window.__tunebookPlaybackRouteLog) {
    window.__tunebookPlaybackRouteLog = []
  }
  const log = window.__tunebookPlaybackRouteLog
  log.push(entry)
  while (log.length > ROUTE_LOG_MAX) {
    log.shift()
  }
}

export function logPlaybackRouteDecision(entry) {
  if (!isPlaybackRouteLogEnabled()) return
  ensurePlaybackRouteLogBuffer()
  const redacted = redactPlaybackRouteLogEntry(entry)
  pushRouteLogEntry(redacted)
  if (typeof console !== 'undefined' && console.log) {
    console.log('[tunebook-playback-route]', redacted)
  }
}

export function getPlaybackRouteLog() {
  if (typeof window === 'undefined') return []
  ensurePlaybackRouteLogBuffer()
  if (!window.__tunebookPlaybackRouteLog) return []
  return window.__tunebookPlaybackRouteLog.slice()
}

export function clearPlaybackRouteLog() {
  if (typeof window !== 'undefined') {
    window.__tunebookPlaybackRouteLog = []
  }
}

export function agentDebugLog(location, message, data, hypothesisId) {
  if (!isPlaybackDebugEnabled()) return
  const payload = {
    sessionId: AGENT_DEBUG_SESSION,
    location: location,
    message: message,
    data: data || {},
    hypothesisId: hypothesisId || '',
    timestamp: Date.now(),
    runId: 'android-playback',
  }
  // #region agent log
  // Single-string console so Capacitor/logcat keeps the full JSON (not [object Object]).
  if (typeof console !== 'undefined' && console.log) {
    try {
      console.log('[DBG-' + AGENT_DEBUG_SESSION + '] ' + JSON.stringify(payload))
    } catch (e) {
      console.log('[DBG-' + AGENT_DEBUG_SESSION + ']', location, message)
    }
  }
  fetch(AGENT_DEBUG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': AGENT_DEBUG_SESSION,
    },
    body: JSON.stringify(payload),
  }).catch(function() {})
  // #endregion
}

export function logPlaybackDebug(route, detail) {
  if (!isPlaybackDebugEnabled()) return
  agentDebugLog('playbackDebug.js', route, detail, 'route')
  if (detail !== undefined) {
    console.log('[tunebook-playback]', route, detail)
  } else {
    console.log('[tunebook-playback]', route)
  }
}

export function toastPlaybackDebug(message) {
  if (!isPlaybackDebugEnabled()) return
  if (typeof console !== 'undefined' && console.info) {
    console.info('[tunebook-playback]', message)
  }
}
