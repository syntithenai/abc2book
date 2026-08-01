/**
 * Classify OAuth BFF errors so we only clear browser session keys on
 * definitive auth failures, not transient resolver/network issues.
 */

function authErrorParts(err) {
  return [
    err && err.message,
    err && err.body && err.body.detail,
    err && err.body && err.body.error,
    err && err.body && err.body.hint,
  ].filter(Boolean).join(' ').toLowerCase()
}

/** True when the BFF session is gone and retrying the same session_id will not help. */
export function isTerminalAuthError(err) {
  if (!err) return false

  if (err.body && err.body.error === 'refresh_token_missing') {
    return true
  }

  var status = Number(err.status)
  var text = authErrorParts(err)

  if (status === 401) {
    return /invalid_session|refresh_failed|session.*not found/.test(text)
      || err.body && (
        err.body.error === 'invalid_session'
        || err.body.error === 'refresh_failed'
      )
  }

  if (status === 404) {
    return /invalid_session|session.*not found|not found/.test(text)
  }

  return false
}

/** True for network failures and resolver outages where the session may still be valid. */
export function isTransientAuthError(err) {
  if (!err) return false
  if (isTerminalAuthError(err)) return false

  var status = Number(err.status)
  if (!status || status === 0) return true
  if (status === 429) return true
  if (status >= 500 && status <= 599) return true

  var text = authErrorParts(err)
  return /network|timeout|could not reach|failed to fetch|econnrefused|enotfound/.test(text)
}
