import { toast } from 'react-toastify'
import { getResolverLoginWarning } from './mediaProxyClient'
import {
  getMediaResolverHealthState,
  subscribeMediaResolverHealth,
} from './mediaResolverHealthStore'

const TOAST_ID = 'resolver-login-required'

/** Dedupe key for the last warned resolver/auth state. */
let lastWarnedKey = ''

function warningKey(status, accessToken) {
  if (!status) return ''
  const candidates = status.candidates || []
  const authBlocked = candidates.filter(function(candidate) {
    return candidate.reachable && candidate.requireAuth && !candidate.available
  })
  const bases = authBlocked.map(function(c) { return c.base }).sort().join(',')
  const reason = authBlocked.map(function(c) { return c.authReason || '' }).sort().join(',')
  return bases + '|' + reason + '|' + (accessToken ? 'token' : 'no-token')
}

export function syncResolverLoginToast(accessToken) {
  const state = getMediaResolverHealthState()
  if (!state.checked) return

  const warning = getResolverLoginWarning(state.status, accessToken)
  if (!warning) {
    lastWarnedKey = ''
    toast.dismiss(TOAST_ID)
    return
  }

  const key = warningKey(state.status, accessToken)
  if (key === lastWarnedKey) return
  lastWarnedKey = key

  toast.warning(warning.message, {
    toastId: TOAST_ID,
    autoClose: 12000,
    closeOnClick: true,
  })
}

/** Subscribe once from app init; re-shows after resolver settings change. */
export function startResolverLoginToastSync(accessToken) {
  function onSettingsChanged() {
    lastWarnedKey = ''
    toast.dismiss(TOAST_ID)
    syncResolverLoginToast(accessToken)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('mediaProxySettingsChanged', onSettingsChanged)
  }

  syncResolverLoginToast(accessToken)
  const unsubscribe = subscribeMediaResolverHealth(function() {
    syncResolverLoginToast(accessToken)
  })

  return function stop() {
    unsubscribe()
    if (typeof window !== 'undefined') {
      window.removeEventListener('mediaProxySettingsChanged', onSettingsChanged)
    }
  }
}

export function __resetResolverLoginToastForTests() {
  lastWarnedKey = ''
  toast.dismiss(TOAST_ID)
}
