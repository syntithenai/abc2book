import {
  fetchViaMediaProxy,
  isMediaProxyConfigured,
  isMediaResolverInfrastructureError,
} from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'

const DEFAULT_LIMIT = 8
const RESOLVER_TIMEOUT_MS = 12000

function emptyResult() {
  return { candidates: [], empty: true, found: false }
}

function mergeAbortSignals(userSignal, timeoutMs) {
  if (typeof AbortController === 'undefined') {
    return { signal: userSignal, cancel: function() {} }
  }
  const timeoutController = new AbortController()
  let timer = setTimeout(function() {
    timeoutController.abort()
  }, timeoutMs > 0 ? timeoutMs : RESOLVER_TIMEOUT_MS)

  function onUserAbort() {
    timeoutController.abort()
  }
  if (userSignal) {
    if (userSignal.aborted) {
      timeoutController.abort()
    } else if (typeof userSignal.addEventListener === 'function') {
      userSignal.addEventListener('abort', onUserAbort)
    }
  }

  return {
    signal: timeoutController.signal,
    cancel: function() {
      clearTimeout(timer)
      if (userSignal && typeof userSignal.removeEventListener === 'function') {
        userSignal.removeEventListener('abort', onUserAbort)
      }
    },
  }
}

function shouldUseResolver(options) {
  if (options && options.forceResolver === false) return false
  if (options && options.resolverAvailable === false) return false
  if (options && options.resolverAvailable === true) return true
  if (!isMediaProxyConfigured()) return false
  const health = getMediaResolverHealthState()
  if (health && health.checked) return !!health.available
  return true
}

async function parseSimilarMelodiesResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable similar-melodies response')
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Similar melodies search failed')
  }
  const candidates = Array.isArray(body && body.candidates) ? body.candidates : []
  return {
    candidates: candidates,
    empty: candidates.length === 0,
    found: candidates.length > 0,
  }
}

/**
 * Contour-only similar melody search against the hosted resolver index.
 */
export async function searchSimilarMelodiesViaResolver(options) {
  const opts = options || {}
  const abc = String(opts.abc || opts.abcHint || '').trim()
  if (!abc) return emptyResult()

  if (!shouldUseResolver(opts)) {
    return emptyResult()
  }

  const limit = opts.limit > 0 ? Math.min(24, opts.limit) : DEFAULT_LIMIT
  const timeoutMs = opts.timeoutMs > 0 ? opts.timeoutMs : RESOLVER_TIMEOUT_MS
  const abortBundle = mergeAbortSignals(opts.signal, timeoutMs)
  try {
    const response = await fetchViaMediaProxy('/search-similar-melodies', opts.accessToken, {
      method: 'POST',
      body: JSON.stringify({ abc: abc, limit: limit }),
      signal: abortBundle.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    return await parseSimilarMelodiesResponse(response)
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return emptyResult()
    }
    if (isMediaResolverInfrastructureError(err)) {
      return emptyResult()
    }
    throw err
  } finally {
    abortBundle.cancel()
  }
}
