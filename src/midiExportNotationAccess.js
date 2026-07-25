import { getResolverLoginWarning } from './mediaProxyClient'

function normalizeAccessToken(token) {
  if (!token) return null
  if (typeof token === 'string') return token
  return token.access_token || null
}

function getResolverGatedActionAccess(context, options) {
  const opts = context || {}
  const gate = options || {}
  const requiresFeature = gate.requiresFeature || null
  const resolverAvailable = !!opts.resolverAvailable
  const resolverChecked = !!opts.resolverChecked
  const features = opts.features || {}
  const hasFeature = !requiresFeature || !!features[requiresFeature]
  const loginWarning = getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsLogin = !!(loginWarning && loginWarning.showLoginButton)
  const hasCapability = resolverAvailable && hasFeature
  const showButton = resolverChecked && (hasCapability || needsLogin)

  return {
    showButton: showButton,
    needsLogin: needsLogin && showButton,
    canUse: hasCapability && !needsLogin,
    loginWarning: loginWarning,
  }
}

/**
 * Whether MIDI links should offer export-to-scratchpad notation.
 * Hide when no converter resolver exists; show a login label when auth blocks it.
 */
export function getMidiExportNotationAccess(context) {
  const access = getResolverGatedActionAccess(context, { requiresFeature: null })
  return {
    showButton: access.showButton,
    needsLogin: access.needsLogin,
    canExport: access.canUse,
    loginWarning: access.loginWarning,
  }
}

/**
 * Whether audio/video links should offer play-range editing with scan support.
 * Requires Whisper on the resolver; hide when unavailable, login label when auth blocks it.
 */
export function getLinkPlayRangeAccess(context) {
  const access = getResolverGatedActionAccess(context, { requiresFeature: 'whisper' })
  return {
    showButton: access.showButton,
    needsLogin: access.needsLogin,
    canOpen: access.canUse,
    loginWarning: access.loginWarning,
  }
}
