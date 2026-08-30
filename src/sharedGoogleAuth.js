/**
 * Same-origin shared Google session between Tune Book (`/`) and YogApp (`/yoga/`).
 */

export var TUNEBOOK_GOOGLE_AUTH_KEY = 'tunebook_google_auth_v1'

export function readSharedGoogleAuth() {
  try {
    var raw = localStorage.getItem(TUNEBOOK_GOOGLE_AUTH_KEY)
    if (!raw) return null
    var parsed = JSON.parse(raw)
    if (!parsed || !parsed.accessToken || !parsed.expiresAt || !parsed.user || !parsed.user.email) {
      return null
    }
    if (Date.now() >= parsed.expiresAt - 30000) return null
    return parsed
  } catch (e) {
    return null
  }
}

export function writeSharedGoogleAuth(auth) {
  try {
    localStorage.setItem(
      TUNEBOOK_GOOGLE_AUTH_KEY,
      JSON.stringify(Object.assign({}, auth, { updatedAt: Date.now() })),
    )
  } catch (e) {
    /* quota / private mode */
  }
}

export function clearSharedGoogleAuth() {
  try {
    localStorage.removeItem(TUNEBOOK_GOOGLE_AUTH_KEY)
  } catch (e) {
    /* ignore */
  }
}

export function sharedAuthHasScopes(auth, required) {
  if (!auth || !auth.scopes || !auth.scopes.length) return false
  var have = auth.scopes.map(function(s) {
    return String(s).toLowerCase()
  })
  return required.every(function(need) {
    var n = String(need).toLowerCase()
    return have.some(function(h) {
      return h === n || h.indexOf(n) !== -1 || n.indexOf(h) !== -1
    })
  })
}

/** Build shared payload from Tune Book token object + profile. */
export function sharedAuthFromTokenResponse(tokenResponse, profile, fallbackScopes) {
  if (!tokenResponse || !tokenResponse.access_token) return null
  var expiresAt = Number(tokenResponse.expires_at)
  if (!isFinite(expiresAt) || expiresAt <= 0) {
    var expiresIn = Number(tokenResponse.expires_in) || 3600
    expiresAt = Date.now() + expiresIn * 1000
  }
  var scopeStr = typeof tokenResponse.scope === 'string' ? tokenResponse.scope : ''
  var scopes = scopeStr
    ? scopeStr.split(/\s+/).filter(Boolean)
    : Array.isArray(fallbackScopes)
      ? fallbackScopes.slice()
      : []
  var user = {
    name: (profile && (profile.name || profile.email)) || 'Google user',
    email: (profile && profile.email) || '',
    picture: profile && profile.picture ? profile.picture : undefined,
  }
  if (!user.email) return null
  return {
    accessToken: tokenResponse.access_token,
    expiresAt: expiresAt,
    user: user,
    scopes: scopes,
    updatedAt: Date.now(),
  }
}
