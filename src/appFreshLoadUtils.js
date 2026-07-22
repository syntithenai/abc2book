export const PREFER_FRESH_APP_STORAGE_KEY = 'bookstorage_prefer_fresh_app'
export const PENDING_CACHE_CLEAR_KEY = 'bookstorage_fresh_pending_cache_clear'
export const FRESH_LOAD_PARAM = 'fresh'
export const FRESH_LOAD_ATTEMPT_KEY = 'bookstorage_fresh_load_attempt'
export const FRESH_LOAD_ABORTED_KEY = 'bookstorage_fresh_load_aborted'
export const FRESH_LOAD_RELOAD_GUARD_KEY = 'bookstorage_fresh_reload'
export const DEFAULT_FRESH_REVERT_HASH = '#/tunes'

export function isOffline(options) {
  if (options && typeof options.isOffline === 'boolean') return options.isOffline
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function readFreshParamFromLocation(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null)
  if (!loc) return false
  try {
    if (new URLSearchParams(loc.search || '').get(FRESH_LOAD_PARAM) === '1') return true
    const hash = loc.hash || ''
    const qIndex = hash.indexOf('?')
    if (qIndex < 0) return false
    return new URLSearchParams(hash.slice(qIndex + 1)).get(FRESH_LOAD_PARAM) === '1'
  } catch (e) {
    return false
  }
}

export function isShareImportRoute(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null)
  if (!loc) return false
  const hash = loc.hash || ''
  return hash.indexOf('#/importdoc') === 0 || hash.indexOf('/importdoc') >= 0
}

export function buildFreshRevertUrl(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null)
  const pathname = loc && loc.pathname ? loc.pathname : '/'
  return pathname + DEFAULT_FRESH_REVERT_HASH
}

export function prefersFreshAppLoad(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    return store.getItem(PREFER_FRESH_APP_STORAGE_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function hasPendingCacheClear(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    return store.getItem(PENDING_CACHE_CLEAR_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function hasFreshLoadAttempt(sessionStorageRef) {
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!session) return false
  try {
    return session.getItem(FRESH_LOAD_ATTEMPT_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function setPreferFreshAppLoad(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  try {
    store.setItem(PREFER_FRESH_APP_STORAGE_KEY, '1')
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function clearPreferFreshAppLoad(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  try {
    store.removeItem(PREFER_FRESH_APP_STORAGE_KEY)
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function setPendingCacheClear(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  try {
    store.setItem(PENDING_CACHE_CLEAR_KEY, '1')
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function clearPendingCacheClear(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  try {
    store.removeItem(PENDING_CACHE_CLEAR_KEY)
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function setFreshLoadAttempt(sessionStorageRef) {
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!session) return
  try {
    session.setItem(FRESH_LOAD_ATTEMPT_KEY, '1')
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function clearFreshLoadAttempt(sessionStorageRef) {
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!session) return
  try {
    session.removeItem(FRESH_LOAD_ATTEMPT_KEY)
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function markFreshLoadAborted(sessionStorageRef) {
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!session) return
  try {
    session.setItem(FRESH_LOAD_ABORTED_KEY, '1')
  } catch (e) {
    // ignore quota / privacy errors
  }
}

export function consumeFreshLoadAborted(sessionStorageRef) {
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!session) return false
  try {
    if (session.getItem(FRESH_LOAD_ABORTED_KEY) !== '1') return false
    session.removeItem(FRESH_LOAD_ABORTED_KEY)
    return true
  } catch (e) {
    return false
  }
}

export function stripFreshParamFromLocation(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null)
  if (!loc) return ''
  const url = new URL(loc.href)
  url.searchParams.delete(FRESH_LOAD_PARAM)
  const hash = url.hash || ''
  const qIndex = hash.indexOf('?')
  if (qIndex >= 0) {
    const hashParams = new URLSearchParams(hash.slice(qIndex + 1))
    hashParams.delete(FRESH_LOAD_PARAM)
    const hashPath = hash.slice(0, qIndex)
    const nextHashQuery = hashParams.toString()
    url.hash = nextHashQuery ? hashPath + '?' + nextHashQuery : hashPath
  }
  return url.pathname + url.search + url.hash
}

export async function unregisterAppServiceWorkerOnly() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(function(registration) {
      return registration.unregister()
    }))
  }
}

export async function clearAppCachesOnly() {
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys()
    await Promise.all(keys.map(function(key) {
      return caches.delete(key)
    }))
  }
}

export async function clearAppServiceWorkerAndCaches() {
  await unregisterAppServiceWorkerOnly()
  await clearAppCachesOnly()
}

export function appendFreshLoadParam(url) {
  if (!url) return url
  if (url.indexOf(FRESH_LOAD_PARAM + '=1') >= 0) return url
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + FRESH_LOAD_PARAM + '=1'
}

export function clearFreshLoadState(storage, sessionStorageRef) {
  clearPreferFreshAppLoad(storage)
  clearPendingCacheClear(storage)
  clearFreshLoadAttempt(sessionStorageRef)
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!session) return
  try {
    session.removeItem(FRESH_LOAD_RELOAD_GUARD_KEY)
  } catch (e) {
    // ignore quota / privacy errors
  }
}

/** Abandon a fresh share-link attempt and return to the cached app. Never deletes caches. */
export async function revertFreshLoadAttempt(options) {
  const opts = options || {}
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  const sessionStorageRef = opts.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  const location = opts.location || (typeof window !== 'undefined' ? window.location : null)

  clearFreshLoadState(storage, sessionStorageRef)
  markFreshLoadAborted(sessionStorageRef)

  const revertUrl = opts.revertUrl
    || (isShareImportRoute(location) ? buildFreshRevertUrl(location) : stripFreshParamFromLocation(location) || '/')

  return {
    shouldNavigate: true,
    revertUrl: revertUrl || '/',
    cancelledImport: isShareImportRoute(location),
  }
}

/**
 * Start a fresh share-link load while online. Keeps the PWA cache and service worker
 * until the new version mounts successfully.
 */
export async function beginFreshLoadFromShareLink(options) {
  const opts = options || {}
  const location = opts.location || (typeof window !== 'undefined' ? window.location : null)
  const sessionStorageRef = opts.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (!location) return { started: false, shouldNavigate: false, revertUrl: '' }

  const hasFreshParam = readFreshParamFromLocation(location)
  if (!hasFreshParam) {
    return { started: false, shouldNavigate: false, revertUrl: '' }
  }

  if (isOffline(opts)) {
    return revertFreshLoadAttempt({
      location: location,
      storage: opts.storage,
      sessionStorage: sessionStorageRef,
      revertUrl: opts.revertUrl,
    })
  }

  setFreshLoadAttempt(sessionStorageRef)
  return { started: true, shouldNavigate: false, revertUrl: '' }
}

/** After the new app version mounts online, commit to network-only loads going forward. */
export async function finalizeFreshLoadIfReady(options) {
  const opts = options || {}
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  const sessionStorageRef = opts.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  const location = opts.location || (typeof window !== 'undefined' ? window.location : null)

  if (!hasFreshLoadAttempt(sessionStorageRef)) {
    return { finalized: false, reverted: false }
  }

  if (isOffline(opts)) {
    const revert = await revertFreshLoadAttempt({
      location: location,
      storage: storage,
      sessionStorage: sessionStorageRef,
    })
    return { finalized: false, reverted: true, shouldNavigate: revert.shouldNavigate, revertUrl: revert.revertUrl }
  }

  setPreferFreshAppLoad(storage)
  await unregisterAppServiceWorkerOnly()
  await clearAppCachesOnly()
  clearFreshLoadAttempt(sessionStorageRef)
  const session = sessionStorageRef || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (session) {
    try {
      session.removeItem(FRESH_LOAD_RELOAD_GUARD_KEY)
    } catch (e) {
      // ignore quota / privacy errors
    }
  }

  return {
    finalized: true,
    reverted: false,
    cleanUrl: stripFreshParamFromLocation(location) || '/',
  }
}

/** @deprecated Use beginFreshLoadFromShareLink + finalizeFreshLoadIfReady */
export async function applyFreshLoadFromShareLink(options) {
  return beginFreshLoadFromShareLink(options)
}
