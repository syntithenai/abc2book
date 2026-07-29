import { getDefaultPublicMediaProxyCandidates } from './mediaProxyConfig'
import { isCapacitorNative } from './platformUtils'

export const AUTH_SESSION_HEADER = 'X-Abc-Auth-Session'
export const AUTH_SESSION_ID_KEY = 'abc_auth_session_id'
export const AUTH_BASE_KEY = 'abc_auth_base'
export const AUTH_MODE_PROBE_WAIT_MS = 6500
/** Wait for deferred Android probe + concurrent /health checks before login. */
export const LOGIN_AUTH_WAIT_MS = 12000

let oauthLoginInFlight = false

export function setOAuthLoginInFlight(active) {
  oauthLoginInFlight = !!active
}

export function isOAuthLoginInFlight() {
  return oauthLoginInFlight
}

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

/** Next oauthBff candidate after a failed base, in probe priority order. */
export function pickNextAuthResolverBase(candidates, failedBase) {
  if (!Array.isArray(candidates) || !failedBase) return ''
  var seenFailed = false
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i]
    if (c.base === failedBase) {
      seenFailed = true
      continue
    }
    if (seenFailed && candidateOffersOauthBff(c)) {
      return c.base || ''
    }
  }
  return ''
}

/** Probed candidates plus native default oauthBff hosts when /health did not settle. */
export function oauthBffCandidatesForLogin(probedCandidates) {
  var list = Array.isArray(probedCandidates) ? probedCandidates.slice() : []
  var hasOauthBff = false
  for (var i = 0; i < list.length; i++) {
    if (candidateOffersOauthBff(list[i])) {
      hasOauthBff = true
      break
    }
  }
  if (!hasOauthBff && isCapacitorNative()) {
    getDefaultPublicMediaProxyCandidates().forEach(function(url) {
      var exists = false
      for (var j = 0; j < list.length; j++) {
        if (list[j].base === url) {
          exists = true
          if (!candidateOffersOauthBff(list[j])) {
            list[j] = Object.assign({}, list[j], { reachable: true, oauthBff: true })
          }
          break
        }
      }
      if (!exists) {
        list.push({ base: url, reachable: true, oauthBff: true })
      }
    })
  }
  return list
}

/** Auth base for login — probe results first, then native default resolver URLs. */
export function pickAuthResolverBaseForLogin(probedCandidates) {
  var candidates = oauthBffCandidatesForLogin(probedCandidates)
  return pickAuthResolverBase(candidates)
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
 * Resolve sticky auth base: keep previous sticky base if still offering oauthBff
 * and a BFF session exists to resume; otherwise pick first oauthBff by probe order.
 */
export function resolveStickyAuthBase(candidates, previousSticky) {
  var preferred = pickAuthResolverBase(candidates)
  var sessionId = readStoredAuthSessionId()
  var sticky = previousSticky || readStoredAuthBase()
  if (sticky && sessionId) {
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
  } else if (sticky && !sessionId) {
    // Signed out: do not keep an old OAuth host; let probe priority pick local first.
    storeAuthBase('')
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
  var url = authBase + '/auth/google/exchange'
  var response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload || {}),
    })
  } catch (err) {
    var hint = (err && err.message) ? String(err.message) : 'network error'
    var netErr = new Error('Could not reach OAuth resolver at ' + authBase + ' (' + hint + ')')
    netErr.cause = err
    throw netErr
  }
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
    if (body && body.retry_after != null) err.retryAfter = Number(body.retry_after)
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
    if (body && body.retry_after != null) err.retryAfter = Number(body.retry_after)
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
