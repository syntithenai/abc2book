/**
 * Normalize GSI Token Client callbacks and OAuth BFF JSON into one shape
 * consumed by Drive sync, Photos, and media proxy:
 * { access_token, expires_in, expires_at, scope }.
 */
export function normalizeToTokenResponse(payload) {
  if (!payload || typeof payload !== 'object') return null
  var accessToken = payload.access_token
  if (!accessToken || typeof accessToken !== 'string') return null
  var expiresIn = payload.expires_in
  if (expiresIn === undefined || expiresIn === null || expiresIn === '') {
    expiresIn = 3600
  } else {
    expiresIn = Number(expiresIn)
    if (!isFinite(expiresIn) || expiresIn <= 0) expiresIn = 3600
  }
  var scope = typeof payload.scope === 'string' ? payload.scope : ''
  var issuedAt = Number(payload.issued_at)
  if (!isFinite(issuedAt) || issuedAt <= 0) {
    issuedAt = Date.now()
  }
  var expiresAt = Number(payload.expires_at)
  if (!isFinite(expiresAt) || expiresAt <= 0) {
    expiresAt = issuedAt + expiresIn * 1000
  }
  var out = {
    access_token: accessToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    issued_at: issuedAt,
    scope: scope,
  }
  if (payload.token_type) out.token_type = payload.token_type
  if (payload.authuser !== undefined) out.authuser = payload.authuser
  if (payload.prompt) out.prompt = payload.prompt
  return out
}

/** Absolute expiry ms for a normalized token, or 0 when unknown. */
export function tokenExpiresAtMs(token) {
  if (!token || typeof token !== 'object') return 0
  var expiresAt = Number(token.expires_at)
  if (isFinite(expiresAt) && expiresAt > 0) return expiresAt
  var expiresIn = Number(token.expires_in)
  var issuedAt = Number(token.issued_at)
  if (isFinite(expiresIn) && expiresIn > 0 && isFinite(issuedAt) && issuedAt > 0) {
    return issuedAt + expiresIn * 1000
  }
  return 0
}

/** True when the bearer can still be reused without a silent refresh. */
export function tokenHasFreshAccess(token, skewMs) {
  if (!token || !token.access_token) return false
  var skew = typeof skewMs === 'number' ? skewMs : 120000
  var expiresAt = tokenExpiresAtMs(token)
  // Missing expiry: prefer reuse over refresh storms (legacy in-memory tokens).
  if (!expiresAt) return true
  return expiresAt > Date.now() + skew
}

export function mergeScopeStrings(existing, extraList) {
  var set = {}
  String(existing || '').split(/\s+/).forEach(function(s) {
    if (s) set[s] = true
  })
  if (Array.isArray(extraList)) {
    extraList.forEach(function(s) {
      if (s) set[s] = true
    })
  }
  return Object.keys(set).join(' ')
}
