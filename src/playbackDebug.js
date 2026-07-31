/**
 * Optional playback routing diagnostics (localStorage tunebook_playback_debug=1).
 */
const AGENT_DEBUG_ENDPOINT = 'http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120'
const AGENT_DEBUG_SESSION = 'eea50f'

export function isPlaybackDebugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    if (window.__tunebookPlaybackDebug) return true
    if (window.__tunebookAgentDebug) return true
    return localStorage.getItem('tunebook_playback_debug') === '1'
  } catch (e) {
    return false
  }
}

export function agentDebugLog(location, message, data, hypothesisId) {
  const payload = {
    sessionId: AGENT_DEBUG_SESSION,
    location: location,
    message: message,
    data: data || {},
    hypothesisId: hypothesisId || '',
    timestamp: Date.now(),
    runId: 'midi-debug',
  }
  // #region agent log
  if (typeof console !== 'undefined' && console.log) {
    console.log('[DBG-' + AGENT_DEBUG_SESSION + ']', location, message, payload.data)
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
