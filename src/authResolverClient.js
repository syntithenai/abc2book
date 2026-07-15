export const AUTH_SESSION_HEADER = 'X-Abc-Auth-Session'
export const AUTH_SESSION_ID_KEY = 'abc_auth_session_id'
export const AUTH_BASE_KEY = 'abc_auth_base'
export const AUTH_MODE_PROBE_WAIT_MS = 3000

export function candidateOffersOauthBff(candidate) {
  if (!candidate || !candidate.reachable) return false
  if (candidate.oauthBff === true) return true
  if (candidate.features && candidate.features.oauthBff === true) return true
  return false
}

/** First reachable candidate advertising oauthBff, preserving probe priority order. */
export function pickAuthResolverBase(candidates) {
  if (!Array.isArray(candidates)) return ''
  for (var i = 0; i < candidates.length; i++) {
    if (candidateOffersOauthBff(candidates[i])) {
      return candidates[i].base || ''
    }
  }
  return ''
}

export function readStoredAuthSessionId() {
  try {
    return localStorage.getItem(AUTH_SESSION_ID_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function storeAuthSessionId(sessionId) {
  try {
    if (sessionId) localStorage.setItem(AUTH_SESSION_ID_KEY, sessionId)
    else localStorage.removeItem(AUTH_SESSION_ID_KEY)
  } catch (e) {}
}

export function readStoredAuthBase() {
  try {
    return localStorage.getItem(AUTH_BASE_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function storeAuthBase(base) {
  try {
    if (base) localStorage.setItem(AUTH_BASE_KEY, base)
    else localStorage.removeItem(AUTH_BASE_KEY)
  } catch (e) {}
}

export function clearAuthSessionStorage() {
  storeAuthSessionId('')
  storeAuthBase('')
}

/**
 * Resolve sticky auth base: keep previous sticky base if still offering oauthBff;
 * otherwise pick preferred; clear sticky storage when sticky is gone from candidates.
 */
export function resolveStickyAuthBase(candidates, previousSticky) {
  var preferred = pickAuthResolverBase(candidates)
  var sticky = previousSticky || readStoredAuthBase()
  if (sticky) {
    var stillOk = false
    for (var i = 0; i < (candidates || []).length; i++) {
      if (candidates[i].base === sticky && candidateOffersOauthBff(candidates[i])) {
        stillOk = true
        break
      }
    }
    if (stillOk) {
      storeAuthBase(sticky)
      return sticky
    }
    // Sticky unreachable or no longer oauthBff — clear sticky session keys only.
    storeAuthBase('')
    storeAuthSessionId('')
  }
  if (preferred) storeAuthBase(preferred)
  return preferred || ''
}

function authHeaders(sessionId) {
  var headers = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (sessionId) headers[AUTH_SESSION_HEADER] = sessionId
  return headers
}

export async function exchangeAuthCode(authBase, payload) {
  var response = await fetch(authBase + '/auth/google/exchange', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload || {}),
  })
  var body = null
  try {
    body = await response.json()
  } catch (e) {
    body = null
  }
  if (!response.ok) {
    var err = new Error((body && (body.hint || body.detail || body.error)) || 'OAuth exchange failed')
    err.status = response.status
    err.body = body
    throw err
  }
  return body
}

export async function refreshAuthSession(authBase, sessionId) {
  var response = await fetch(authBase + '/auth/google/refresh', {
    method: 'POST',
    headers: authHeaders(sessionId),
  })
  var body = null
  try {
    body = await response.json()
  } catch (e) {
    body = null
  }
  if (!response.ok) {
    var err = new Error((body && (body.detail || body.error)) || 'OAuth refresh failed')
    err.status = response.status
    err.body = body
    throw err
  }
  return body
}

export async function loadAuthSession(authBase, sessionId) {
  var response = await fetch(authBase + '/auth/google/session', {
    method: 'GET',
    headers: authHeaders(sessionId),
  })
  var body = null
  try {
    body = await response.json()
  } catch (e) {
    body = null
  }
  if (!response.ok) {
    var err = new Error((body && (body.detail || body.error)) || 'OAuth session failed')
    err.status = response.status
    err.body = body
    throw err
  }
  return body
}

export async function logoutAuthSession(authBase, sessionId) {
  if (!authBase || !sessionId) return { ok: true }
  try {
    await fetch(authBase + '/auth/google/logout', {
      method: 'POST',
      headers: authHeaders(sessionId),
    })
  } catch (e) {}
  return { ok: true }
}
