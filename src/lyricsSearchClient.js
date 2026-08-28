import { parseNdjsonLine } from './ndjsonParse'
import {
  fetchViaMediaProxy,
  isMediaProxyConfigured,
  isMediaResolverInfrastructureError,
} from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { handleLyricsSearchStreamEvent, isLyricsSearchSoftMissMessage, normalizeLyricsSearch } from './lyricsSearchNormalize'
import { searchLyricsLight } from './lyricsSearchLight'
import { isAbortError } from './abortUtils'

export { normalizeLyricsSearch, handleLyricsSearchStreamEvent, isLyricsSearchSoftMissMessage } from './lyricsSearchNormalize'

const LYRICS_ACCEPT_HEADER = 'application/x-ndjson, application/json'

function isTimeoutAbortError(err) {
  if (!isAbortError(err)) return false
  const message = String(err && err.message || '').toLowerCase()
  return message.indexOf('timed out') >= 0 || message.indexOf('timeout') >= 0
}

async function parseLyricsSearchResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable lyrics search response')
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Lyrics search failed')
  }

  return normalizeLyricsSearch(body)
}

async function parseStreamingLyricsSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseLyricsSearchResponse(response)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseLyricsSearchResponse(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      const parsed = handleLyricsSearchStreamEvent(parseNdjsonLine(line), onProgress)
      if (parsed) result = parsed
    }
  }

  if (buffer.trim()) {
    const parsed = handleLyricsSearchStreamEvent(parseNdjsonLine(buffer), onProgress)
    if (parsed) result = parsed
  }

  if (!result) {
    throw new Error('Lyrics search stream ended without a result')
  }
  return result
}

async function parseSearchResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingLyricsSearchResponse(response, onProgress)
  }
  return parseLyricsSearchResponse(response)
}

export async function searchLyricsViaResolver(options) {
  const {
    title,
    artist,
    url,
    accessToken,
    signal,
    onProgress,
  } = options

  if (!url && !(title && String(title).trim())) {
    throw new Error('Song title is required')
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting lyrics search...', 0, 'start')
  }

  const response = await fetchViaMediaProxy('/search-lyrics', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title || '',
      artist: artist || '',
      url: url || '',
    }),
    signal: signal,
    headers: {
      Accept: LYRICS_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  })

  return parseSearchResponse(response, onProgress)
}

function shouldUseResolver(options) {
  if (options && options.forceLightweight) return false
  if (options && options.forceResolver) return true
  if (options && options.resolverAvailable === false) return false
  if (options && options.resolverAvailable === true) return true
  if (!isMediaProxyConfigured()) return false
  const health = getMediaResolverHealthState()
  if (health && health.checked) return !!health.available
  return true
}

function shouldFallbackFromResolverResult(result) {
  if (!result || typeof result !== 'object') return true
  if (!result.empty) return false
  return !(Array.isArray(result.manualCandidates) && result.manualCandidates.length > 0)
}

function shouldFallbackFromResolverError(err, opts) {
  if (opts && typeof opts.wasTimedOut === 'function' && opts.wasTimedOut()) return true
  if (isTimeoutAbortError(err)) return true
  return isMediaResolverInfrastructureError(err)
    || isLyricsSearchSoftMissMessage(err && err.message)
}

function shouldRethrowAbort(err, opts) {
  if (!isAbortError(err)) return false
  if (opts && typeof opts.isCancelled === 'function' && opts.isCancelled()) return true
  if (opts && typeof opts.wasTimedOut === 'function' && opts.wasTimedOut()) return false
  if (isTimeoutAbortError(err)) return false
  return true
}

/** Cap resolver lyrics scrapes so the lyrics editor cannot jam before lrclib/ovh. */
const LYRICS_RESOLVER_BUDGET_MS = 25000

async function searchLyricsViaResolverWithBudget(opts, budgetMs) {
  const parentSignal = opts.signal
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  let timer = null
  let timedOut = false

  function onParentAbort() {
    if (controller) {
      try { controller.abort() } catch (e) { /* ignore */ }
    }
  }

  if (controller && parentSignal) {
    if (parentSignal.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      throw err
    }
    parentSignal.addEventListener('abort', onParentAbort)
  }
  if (controller) {
    timer = setTimeout(function() {
      timedOut = true
      try { controller.abort() } catch (e) { /* ignore */ }
    }, budgetMs)
  }

  try {
    return await searchLyricsViaResolver(Object.assign({}, opts, {
      signal: controller ? controller.signal : parentSignal,
    }))
  } catch (err) {
    if (timedOut) {
      const timeoutErr = new Error('Lyrics search timed out')
      timeoutErr.name = 'AbortError'
      throw timeoutErr
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
    if (controller && parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort)
    }
  }
}

async function searchLyricsLightAfterResolver(opts) {
  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Trying lightweight lyrics sources…', 0.4, 'fallback')
  }
  // Job timeout aborts the parent signal; give light APIs a fresh short window.
  if (opts.signal && opts.signal.aborted) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    let timer = null
    if (controller) {
      timer = setTimeout(function() {
        try { controller.abort() } catch (e) { /* ignore */ }
      }, 25000)
    }
    try {
      return await searchLyricsLight(Object.assign({}, opts, {
        signal: controller ? controller.signal : undefined,
        skipColdIndexLoad: opts.skipColdIndexLoad,
        indexTimeoutMs: opts.indexTimeoutMs,
      }))
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return searchLyricsLight(Object.assign({}, opts, {
    skipColdIndexLoad: opts.skipColdIndexLoad,
    indexTimeoutMs: opts.indexTimeoutMs,
  }))
}

export async function searchLyrics(options) {
  const opts = options || {}

  if (opts.url) {
    try {
      const result = await searchLyricsViaResolverWithBudget(opts, LYRICS_RESOLVER_BUDGET_MS)
      if (!shouldFallbackFromResolverResult(result)) return result
    } catch (err) {
      if (shouldRethrowAbort(err, opts)) throw err
      if (!shouldFallbackFromResolverError(err, opts)) throw err
    }
    return searchLyricsLightAfterResolver(opts)
  }

  const useResolver = shouldUseResolver(opts)

  if (useResolver) {
    try {
      const result = await searchLyricsViaResolverWithBudget(opts, LYRICS_RESOLVER_BUDGET_MS)
      if (!shouldFallbackFromResolverResult(result)) return result
    } catch (err) {
      if (shouldRethrowAbort(err, opts)) throw err
      if (!shouldFallbackFromResolverError(err, opts)) throw err
    }
    return searchLyricsLightAfterResolver(opts)
  }

  return searchLyricsLight(opts)
}
