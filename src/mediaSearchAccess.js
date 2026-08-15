import {
  getResolverLoginWarning,
  isMediaProxyConfigured,
  normalizeAccessToken,
} from './mediaProxyClient';
import { getOfflineBlock } from './offlineNetwork';

function mediaSearchLoginMessage(baseWarning) {
  if (!baseWarning) return '';

  if (baseWarning.showBuyCreditButton) {
    return 'Buy resolver credit for access to more media sources.';
  }

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
  const offlineBlock = getOfflineBlock();
  if (offlineBlock) {
    return {
      loginWarning: offlineBlock,
      needsLogin: false,
      needsCredit: false,
      needsNetwork: true,
    };
  }
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
  if (!baseWarning || (!baseWarning.showLoginButton && !baseWarning.showBuyCreditButton)) {
    return {
      loginWarning: null,
      needsLogin: false,
      needsCredit: false,
    };
  }

  // Signed in but health still reflects an unauthenticated probe — don't nag.
  if (token && baseWarning.showLoginButton && onlyLoginRequiredBlocked(opts.resolverStatus)) {
    return {
      loginWarning: null,
      needsLogin: false,
      needsCredit: false,
    };
  }

  if (baseWarning.showBuyCreditButton) {
    return {
      loginWarning: {
        message: mediaSearchLoginMessage(baseWarning),
        showBuyCreditButton: true,
      },
      needsLogin: false,
      needsCredit: true,
    };
  }

  return {
    loginWarning: {
      message: mediaSearchLoginMessage(baseWarning),
      showLoginButton: true,
    },
    needsLogin: true,
    needsCredit: false,
  };
}
