import { getGatedActionLabel, normalizeAccessToken } from './resolverCreditAccess'
import { getResolverLoginWarning } from './mediaProxyClient'

function getPracticeTrackBackendFromStatus(status) {
  if (!status) return null
  if (status.practiceTrackBackend && typeof status.practiceTrackBackend === 'object') {
    return status.practiceTrackBackend
  }
  const candidates = (status.candidates) || []
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    if (candidate.reachable && candidate.practiceTrackBackend) {
      return candidate.practiceTrackBackend
    }
  }
  return null
}

function practiceTrackBackendReady(backend) {
  if (!backend || typeof backend !== 'object') return true
  if (backend.enabled === false) return false
  if (backend.provider === 'audio_cpp') return backend.ok === true
  return backend.ok !== false
}

function resolverSupportsPracticeTrack(resolverStatus, features) {
  if (features && features.practiceTrack) return true
  const candidates = (resolverStatus && resolverStatus.candidates) || []
  if (candidates.some(function(candidate) {
    return candidate.reachable
      && candidate.features
      && candidate.features.practiceTrack
  })) {
    return true
  }
  const backend = getPracticeTrackBackendFromStatus(resolverStatus)
  if (backend) return practiceTrackBackendReady(backend)
  return false
}

/**
 * Resolver-gated access for practice-track generation.
 * Hide when no reachable resolver offers practiceTrack; login label when auth blocks it.
 */
export function getPracticeTrackAccess(context) {
  const opts = context || {}
  const resolverChecked = !!opts.resolverChecked
  const resolverAvailable = !!opts.resolverAvailable
  const features = opts.features || {}
  const resolverStatus = opts.resolverStatus
  const supportsPracticeTrack = resolverSupportsPracticeTrack(resolverStatus, features)
  const loginWarning = getResolverLoginWarning(resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsLogin = !!(loginWarning && loginWarning.showLoginButton)
  const needsCredit = !!(loginWarning && loginWarning.showBuyCreditButton)
  const hasCapability = resolverAvailable && supportsPracticeTrack
  const showButton = resolverChecked && supportsPracticeTrack && (hasCapability || needsLogin || needsCredit)

  return {
    showButton: showButton,
    needsLogin: needsLogin && showButton,
    needsCredit: needsCredit && showButton,
    canGenerate: hasCapability && !needsLogin && !needsCredit,
    loginWarning: loginWarning,
  }
}

export function getPracticeTrackGenerateLabel(access, options) {
  const opts = options || {}
  if (opts.busy) return 'Generating…'
  return getGatedActionLabel(access, opts.regenerateBackingOnly ? 'Regenerate backing only' : 'Generate')
}
