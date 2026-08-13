import {
  getResolverLoginWarning,
  isMediaProxyConfigured,
  normalizeAccessToken,
} from './mediaProxyClient'

function authBlockedCandidates(resolverStatus) {
  const candidates = (resolverStatus && resolverStatus.candidates) || []
  return candidates.filter(function(candidate) {
    return candidate.reachable && candidate.requireAuth && !candidate.available
  })
}

function onlyLoginRequiredBlocked(resolverStatus) {
  const blocked = authBlockedCandidates(resolverStatus)
  if (blocked.length === 0) return false
  return blocked.every(function(candidate) {
    const reason = candidate.authReason || ''
    return reason === 'login_required' || reason === ''
  })
}

function resolverRequiresAuth(resolverStatus) {
  const candidates = (resolverStatus && resolverStatus.candidates) || []
  return candidates.some(function(candidate) {
    return !!(candidate && candidate.requireAuth)
  })
}

/** True while a stored Google session exists but the access token is not ready yet. */
export function isLyricsToolsAuthWarming(accessToken) {
  if (normalizeAccessToken(accessToken)) return false
  if (typeof localStorage === 'undefined') return false
  return !!localStorage.getItem('google_login_user')
}

/**
 * Resolver/auth gate for Lyrics Tools (lookup hub).
 * Distinguishes session warmup from a real logged-out state so auto-search
 * does not fire a 401 "not logged in" error while Google restore is in flight.
 */
export function getLyricsToolsAccess(context) {
  const opts = context || {}
  const token = normalizeAccessToken(opts.accessToken)
  const warming = isLyricsToolsAuthWarming(token)

  if (!isMediaProxyConfigured()) {
    return {
      warming: false,
      ready: false,
      needsLogin: false,
      needsCredit: false,
      loginWarning: null,
      unreachable: true,
      unreachableMessage: 'Lyrics tools are available only when the media resolver is configured and reachable.',
    }
  }

  if (!opts.resolverChecked || warming) {
    return {
      warming: true,
      ready: false,
      needsLogin: false,
      needsCredit: false,
      loginWarning: null,
      unreachable: false,
      unreachableMessage: '',
    }
  }

  if (opts.resolverAvailable) {
    const needsAuth = resolverRequiresAuth(opts.resolverStatus)
    if (needsAuth && !token) {
      return {
        warming: false,
        ready: false,
        needsLogin: true,
        needsCredit: false,
        loginWarning: {
          message: 'Sign in with Google to use lyrics tools.',
          showLoginButton: true,
        },
        unreachable: false,
        unreachableMessage: '',
      }
    }
    return {
      warming: false,
      ready: true,
      needsLogin: false,
      needsCredit: false,
      loginWarning: null,
      unreachable: false,
      unreachableMessage: '',
    }
  }

  const baseWarning = getResolverLoginWarning(opts.resolverStatus, token)
  if (token && baseWarning && baseWarning.showLoginButton && onlyLoginRequiredBlocked(opts.resolverStatus)) {
    // Signed in but health still reflects an unauthenticated probe — keep warming.
    return {
      warming: true,
      ready: false,
      needsLogin: false,
      needsCredit: false,
      loginWarning: null,
      unreachable: false,
      unreachableMessage: '',
    }
  }

  if (baseWarning && baseWarning.showBuyCreditButton) {
    return {
      warming: false,
      ready: false,
      needsLogin: false,
      needsCredit: true,
      loginWarning: {
        message: 'Buy resolver credit to use lyrics tools.',
        showBuyCreditButton: true,
      },
      unreachable: false,
      unreachableMessage: '',
    }
  }

  if (baseWarning && baseWarning.showLoginButton) {
    return {
      warming: false,
      ready: false,
      needsLogin: true,
      needsCredit: false,
      loginWarning: {
        message: 'Sign in with Google to use lyrics tools.',
        showLoginButton: true,
      },
      unreachable: false,
      unreachableMessage: '',
    }
  }

  return {
    warming: false,
    ready: false,
    needsLogin: false,
    needsCredit: false,
    loginWarning: baseWarning,
    unreachable: true,
    unreachableMessage: 'Lyrics tools are available only when the media resolver is running and reachable.',
  }
}
