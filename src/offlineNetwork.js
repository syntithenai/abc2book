import { useEffect, useState } from 'react'

export const OFFLINE_MESSAGE = 'This needs an internet connection.'
export const OFFLINE_LOGIN_MESSAGE = 'Sign-in needs an internet connection.'
export const OFFLINE_WAITING_MESSAGE = 'Waiting for connection…'
export const OFFLINE_PLAYBACK_MESSAGE = 'Not cached for offline playback'

export function isNavigatorOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function shouldAttemptNetwork() {
  return !isNavigatorOffline()
}

export function getOfflineBlock() {
  if (!isNavigatorOffline()) return null
  return {
    kind: 'offline',
    message: OFFLINE_MESSAGE,
    showLoginButton: false,
  }
}

/** Prefer a network message when offline; never blame login or the local resolver. */
export function networkUnavailableMessage(resolverFallback) {
  if (isNavigatorOffline()) return OFFLINE_MESSAGE
  return resolverFallback || 'Media resolver is not available.'
}

const onlineResumeFns = []
let onlineResumeAttached = false

function ensureOnlineResumeListener() {
  if (onlineResumeAttached || typeof window === 'undefined') return
  onlineResumeAttached = true
  window.addEventListener('online', function() {
    onlineResumeFns.forEach(function(fn) {
      try { fn() } catch (e) {}
    })
  })
}

/** Register a callback that runs when the browser comes back online. */
export function registerOnlineResume(fn) {
  if (typeof fn !== 'function') return
  if (onlineResumeFns.indexOf(fn) === -1) onlineResumeFns.push(fn)
  ensureOnlineResumeListener()
}

export function useNavigatorOnline() {
  const [online, setOnline] = useState(function() {
    return typeof navigator === 'undefined' || navigator.onLine !== false
  })

  useEffect(function() {
    function onOnline() { setOnline(true) }
    function onOffline() { setOnline(false) }
    setOnline(typeof navigator === 'undefined' || navigator.onLine !== false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return function() {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}

export function __resetOfflineNetworkForTests() {
  onlineResumeFns.length = 0
  onlineResumeAttached = false
}
