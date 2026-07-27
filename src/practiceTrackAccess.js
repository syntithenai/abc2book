import { getResolverLoginWarning } from './mediaProxyClient';

function normalizeAccessToken(token) {
  if (!token) return null;
  if (typeof token === 'string') return token;
  return token.access_token || null;
}

function getPracticeTrackBackendFromStatus(status) {
  if (!status) return null;
  if (status.practiceTrackBackend && typeof status.practiceTrackBackend === 'object') {
    return status.practiceTrackBackend;
  }
  const candidates = (status.candidates) || [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.reachable && candidate.practiceTrackBackend) {
      return candidate.practiceTrackBackend;
    }
  }
  return null;
}

function practiceTrackBackendReady(backend) {
  if (!backend || typeof backend !== 'object') return true;
  if (backend.enabled === false) return false;
  if (backend.provider === 'audio_cpp') return backend.ok === true;
  return backend.ok !== false;
}

function resolverSupportsPracticeTrack(resolverStatus, features) {
  const backend = getPracticeTrackBackendFromStatus(resolverStatus);
  if (backend && !practiceTrackBackendReady(backend)) return false;
  if (features && features.practiceTrack) return true;
  const candidates = (resolverStatus && resolverStatus.candidates) || [];
  return candidates.some(function(candidate) {
    return candidate.reachable
      && candidate.features
      && candidate.features.practiceTrack;
  });
}

/**
 * Resolver-gated access for practice-track generation.
 * Hide when no reachable resolver offers practiceTrack; login label when auth blocks it.
 */
export function getPracticeTrackAccess(context) {
  const opts = context || {};
  const resolverChecked = !!opts.resolverChecked;
  const resolverAvailable = !!opts.resolverAvailable;
  const features = opts.features || {};
  const resolverStatus = opts.resolverStatus;
  const supportsPracticeTrack = resolverSupportsPracticeTrack(resolverStatus, features);
  const loginWarning = getResolverLoginWarning(resolverStatus, normalizeAccessToken(opts.accessToken));
  const needsLogin = !!(loginWarning && loginWarning.showLoginButton);
  const hasCapability = resolverAvailable && supportsPracticeTrack;
  const showButton = resolverChecked && supportsPracticeTrack && (hasCapability || needsLogin);

  return {
    showButton: showButton,
    needsLogin: needsLogin && showButton,
    canGenerate: hasCapability && !needsLogin,
    loginWarning: loginWarning,
  };
}

export function getPracticeTrackGenerateLabel(access, options) {
  const opts = options || {};
  if (opts.busy) return 'Generating…';
  if (access && access.needsLogin) return 'Login to generate';
  if (opts.regenerateBackingOnly) return 'Regenerate backing only';
  return 'Generate';
}
