/**
 * Module-level registry so Drive / media proxy can request a silent token
 * refresh without prop-drilling through every caller.
 */
var tryRefreshFn = null
var tokenUpdateListeners = new Set()

export function setTryRefreshAccessTokenHandler(fn) {
  tryRefreshFn = typeof fn === 'function' ? fn : null
}

export function tryRefreshAccessToken() {
  if (!tryRefreshFn) return Promise.resolve(null)
  return Promise.resolve()
    .then(function() { return tryRefreshFn() })
    .catch(function() { return null })
}

export function subscribeAccessTokenUpdates(listener) {
  tokenUpdateListeners.add(listener)
  return function unsubscribe() {
    tokenUpdateListeners.delete(listener)
  }
}

export function notifyAccessTokenUpdated(tokenResponse) {
  tokenUpdateListeners.forEach(function(listener) {
    try {
      listener(tokenResponse)
    } catch (e) {}
  })
}
