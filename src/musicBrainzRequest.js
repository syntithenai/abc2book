import axios from 'axios'

export const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
export const MUSICBRAINZ_USER_AGENT = 'ABC2Book/1.0 (https://tunebook.net)'
export const MUSICBRAINZ_MIN_GAP_MS = 1100
export const MUSICBRAINZ_MAX_RETRIES = 3

function effectiveMinGapMs() {
  if (process.env.NODE_ENV === 'test') return 0
  return MUSICBRAINZ_MIN_GAP_MS
}

let lastRequestAt = 0
let requestChain = Promise.resolve()

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms)
  })
}

function isRetryableMusicBrainzStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504
}

/**
 * Convert axios / HTTP failures into short user-facing Error objects.
 * Never leaves "Request failed with status code NNN" as the primary message.
 */
export function toFriendlyMusicBrainzError(error) {
  if (!error) {
    const err = new Error('MusicBrainz request failed. Try again.')
    err.code = 'HTTP_ERROR'
    return err
  }
  if (error.name === 'AbortError') return error
  if (error.code === 'MUSICBRAINZ_BUSY' || error.code === 'HTTP_ERROR' || error.code === 'NETWORK_ERROR') {
    return error
  }

  const status = error.response && error.response.status
  if (isRetryableMusicBrainzStatus(status)) {
    const busy = new Error('MusicBrainz is busy — wait a moment and try again.')
    busy.code = 'MUSICBRAINZ_BUSY'
    busy.status = status
    busy.cause = error
    return busy
  }
  if (status) {
    const err = new Error('MusicBrainz returned an error (' + status + '). Try again.')
    err.code = 'HTTP_ERROR'
    err.status = status
    err.cause = error
    return err
  }
  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
    const err = new Error('Network error — check your connection and try again.')
    err.code = 'NETWORK_ERROR'
    err.cause = error
    return err
  }
  const rawMessage = String(error.message || '')
  if (/^Request failed with status code \d+$/i.test(rawMessage)) {
    const err = new Error('MusicBrainz request failed. Try again.')
    err.code = 'HTTP_ERROR'
    err.cause = error
    return err
  }
  if (rawMessage) {
    const err = new Error(rawMessage)
    err.code = error.code || 'HTTP_ERROR'
    err.cause = error
    return err
  }
  const err = new Error('MusicBrainz request failed. Try again.')
  err.code = 'HTTP_ERROR'
  err.cause = error
  return err
}

export function musicBrainzRequestConfig(signal) {
  // Browsers refuse to set User-Agent (forbidden header). MusicBrainz sees the
  // browser's default UA; MUSICBRAINZ_USER_AGENT is kept for server-side use.
  return {
    signal: signal,
  }
}

function scheduleMusicBrainzRequest(run) {
  const scheduled = requestChain.then(async function() {
    const waitMs = Math.max(0, effectiveMinGapMs() - (Date.now() - lastRequestAt))
    if (waitMs > 0) await delay(waitMs)
    return run()
  })
  requestChain = scheduled.catch(function() {})
  return scheduled
}

/**
 * Throttled MusicBrainz GET with retry on rate-limit / overload responses.
 */
export async function musicBrainzGet(path, options) {
  const opts = options || {}
  const params = opts.params || {}
  const signal = opts.signal
  const url = String(path || '').indexOf('http') === 0
    ? String(path)
    : MUSICBRAINZ_BASE + path

  return scheduleMusicBrainzRequest(async function() {
    let attempt = 0
    while (true) {
      if (signal && signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      try {
        lastRequestAt = Date.now()
        const response = await axios.get(url, {
          params: params,
          ...musicBrainzRequestConfig(signal),
        })
        return response
      } catch (error) {
        if (error && error.name === 'AbortError') throw error
        const status = error && error.response && error.response.status
        if (isRetryableMusicBrainzStatus(status) && attempt < MUSICBRAINZ_MAX_RETRIES) {
          attempt += 1
          await delay(effectiveMinGapMs() * attempt)
          continue
        }
        throw toFriendlyMusicBrainzError(error)
      }
    }
  })
}

export function resetMusicBrainzRequestStateForTests() {
  lastRequestAt = 0
  requestChain = Promise.resolve()
}
