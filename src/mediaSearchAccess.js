import {
  getResolverLoginWarning,
  isMediaProxyConfigured,
  normalizeAccessToken,
} from './mediaProxyClient';

function mediaSearchLoginMessage(baseWarning) {
  if (!baseWarning) return '';

  if (baseWarning.showLoginButton) {
    return 'Sign in for access to more media sources.';
  }

  return baseWarning.message;
}

function authBlockedCandidates(resolverStatus) {
  const candidates = (resolverStatus && resolverStatus.candidates) || [];
  return candidates.filter(function(candidate) {
    return candidate.reachable && candidate.requireAuth && !candidate.available;
  });
}

function onlyLoginRequiredBlocked(resolverStatus) {
  const blocked = authBlockedCandidates(resolverStatus);
  if (blocked.length === 0) return false;
  return blocked.every(function(candidate) {
    const reason = candidate.authReason || '';
    return reason === 'login_required' || reason === '';
  });
}

/**
 * Resolver-gated access for the media search dialog.
 * Warn when a reachable resolver needs login so users know YouTube is not the only source.
 */
export function getMediaSearchAccess(context) {
  const opts = context || {};
  if (!isMediaProxyConfigured()) {
    return {
      loginWarning: null,
      needsLogin: false,
    };
  }

  if (opts.resolverAvailable) {
    return {
      loginWarning: null,
      needsLogin: false,
    };
  }

  const token = normalizeAccessToken(opts.accessToken);
  const baseWarning = getResolverLoginWarning(
    opts.resolverStatus,
    token
  );
  if (!baseWarning || !baseWarning.showLoginButton) {
    return {
      loginWarning: null,
      needsLogin: false,
    };
  }

  // Signed in but health still reflects an unauthenticated probe — don't nag.
  if (token && onlyLoginRequiredBlocked(opts.resolverStatus)) {
    return {
      loginWarning: null,
      needsLogin: false,
    };
  }

  return {
    loginWarning: {
      message: mediaSearchLoginMessage(baseWarning),
      showLoginButton: true,
    },
    needsLogin: true,
  };
}
