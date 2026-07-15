/**
 * Normalize GSI Token Client callbacks and OAuth BFF JSON into one shape
 * consumed by Drive sync, Photos, and media proxy: { access_token, expires_in, scope }.
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
  var out = {
    access_token: accessToken,
    expires_in: expiresIn,
    scope: scope,
  }
  if (payload.token_type) out.token_type = payload.token_type
  if (payload.authuser !== undefined) out.authuser = payload.authuser
  if (payload.prompt) out.prompt = payload.prompt
  return out
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
