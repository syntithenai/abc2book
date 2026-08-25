import { isOwnedMediaLink, isOwnedMediaLinkUri, resolveRecordingLinkAudio, resolveRecordingLinkMidi, findCachedExternalMediaForLink } from './linkRecording'
import { formatTuneDisplayName } from './tuneDisplayName'
import { resolveLinkPlaybackSrcType } from './mediaLinkSrcType'
import { resolveMidiLinkPlaybackData } from './midiLinkResolve'
import {
  getExternalMediaCacheKey,
  getCachedExternalMediaBlob,
} from './externalMediaAudioCache'
import {
  blobForHtmlAudioPlayback,
  fetchPlayableAudioBlob,
  isMediaProxyAuthorizationError,
  normalizeAccessToken,
  requiresResolverProxiedPlayback,
} from './mediaProxyClient'
import { isMusicCollectionResult } from './mediaLinkSearchDisplay'

export const LINK_CHECK_TIMEOUT_AUDIO_MS = 45000
export const LINK_CHECK_TIMEOUT_SLOW_AUDIO_MS = 120000
export const LINK_CHECK_TIMEOUT_YOUTUBE_MS = 90000
export const LINK_CHECK_TIMEOUT_RECORDING_MS = 45000

export const LINK_CHECK_STATUS = {
  OK: 'ok',
  BROKEN: 'broken',
  NEEDS_LOGIN: 'needs_login',
  CANCELLED: 'cancelled',
  SKIP: 'skip',
}

export function getLinkSrcType(link, isYoutubeLink) {
  if (!link || !link.link || !String(link.link).trim()) {
    return 'empty'
  }
  return resolveLinkPlaybackSrcType(link, isYoutubeLink)
}

export function getEmptyLinkReason(link) {
  if (!link || !link.link || !String(link.link).trim()) {
    return 'Missing link URL'
  }
  return null
}

export function tuneHasLinkContent(tune, hasLinks) {
  if (typeof hasLinks === 'function') {
    return !!hasLinks(tune)
  }
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) {
    return false
  }
  return tune.links.some(function(link) {
    return !!(link && link.link && String(link.link).trim())
  })
}

export function getTunesWithoutLinks(tunes, hasLinks) {
  if (!Array.isArray(tunes)) return []

  return tunes
    .filter(function(tune) {
      return tune && tune.id && !tuneHasLinkContent(tune, hasLinks)
    })
    .map(function(tune) {
      return {
        tuneId: tune.id,
        tuneName: formatTuneDisplayName(tune.name),
        composer: tune.composer || '',
      }
    })
}

export function buildLinkCheckQueue(tunes) {
  const queue = []
  if (!Array.isArray(tunes)) return queue

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    const links = Array.isArray(tune.links) ? tune.links : []
    links.forEach(function(link, linkIndex) {
      if (!link) return
      const hasContent = !!(link.title || link.link || link.startAt || link.endAt)
      if (!hasContent) return
      queue.push({
        tuneId: tune.id,
        tuneName: formatTuneDisplayName(tune.name),
        composer: tune.composer || '',
        linkIndex: linkIndex,
        link: link,
      })
    })
  })

  return queue
}

function linkMissingRegionFields(link) {
  if (!link || !link.link || !String(link.link).trim()) return null
  if (getLinkSrcType(link) === 'midifile') return null
  const missing = []
  if (!link.startAt || !String(link.startAt).trim()) missing.push('startAt')
  if (!link.endAt || !String(link.endAt).trim()) missing.push('endAt')
  return missing.length > 0 ? missing : null
}

export function getLinkRegionWarnings(tunes, hasLinks) {
  if (!Array.isArray(tunes)) return []

  const warnings = []
  tunes.forEach(function(tune) {
    if (!tune || !tune.id || !tuneHasLinkContent(tune, hasLinks)) return
    const links = Array.isArray(tune.links) ? tune.links : []
    links.forEach(function(link, linkIndex) {
      const missing = linkMissingRegionFields(link)
      if (!missing) return
      warnings.push({
        tuneId: tune.id,
        tuneName: formatTuneDisplayName(tune.name),
        composer: tune.composer || '',
        linkIndex: linkIndex,
        link: link,
        missing: missing,
      })
    })
  })
  return warnings
}

export function checkAudioLinkPlayback(src, options) {
  const opts = options || {}
  const timeoutMs = opts.timeoutMs || LINK_CHECK_TIMEOUT_AUDIO_MS
  const signal = opts.signal

  return new Promise(function(resolve) {
    if (signal && signal.aborted) {
      resolve({ ok: false, status: LINK_CHECK_STATUS.CANCELLED, error: 'cancelled' })
      return
    }

    const audio = document.createElement('audio')
    audio.volume = 0
    audio.preload = 'auto'

    let settled = false

    function finish(result) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      try {
        audio.pause()
      } catch (e) {}
      audio.removeAttribute('src')
      try {
        audio.load()
      } catch (e) {}
      if (result && result.ok) {
        resolve({ ok: true, status: LINK_CHECK_STATUS.OK, error: null })
        return
      }
      resolve({
        ok: false,
        status: (result && result.status) || LINK_CHECK_STATUS.BROKEN,
        error: (result && result.error) || 'Could not load or play this link',
      })
    }

    function onAbort() {
      finish({ ok: false, status: LINK_CHECK_STATUS.CANCELLED, error: 'cancelled' })
    }

    const timer = setTimeout(function() {
      finish({ ok: false, status: LINK_CHECK_STATUS.BROKEN, error: 'Timed out waiting for playback' })
    }, timeoutMs)

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }

    audio.addEventListener('error', function() {
      finish({ ok: false, status: LINK_CHECK_STATUS.BROKEN, error: 'Could not load or play this link' })
    })

    audio.addEventListener('playing', function() {
      finish({ ok: true })
    })

    audio.addEventListener('canplaythrough', function() {
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function() {
          finish({
            ok: false,
            status: LINK_CHECK_STATUS.BROKEN,
            error: 'Playback was blocked or failed to start',
          })
        })
      }
    }, { once: true })

    audio.src = src
    audio.load()
  })
}

function linkCheckResult(status, error) {
  if (status === LINK_CHECK_STATUS.OK || status === LINK_CHECK_STATUS.SKIP) {
    return { ok: true, status: status, error: null }
  }
  return {
    ok: false,
    status: status || LINK_CHECK_STATUS.BROKEN,
    error: error || 'Playback failed',
  }
}

export function isLinkCheckAuthFailure(error, options) {
  const opts = options || {}
  if (isMediaProxyAuthorizationError(error)) return true
  const message = error && error.message ? String(error.message) : String(error || '')
  if (!message) return false
  const lower = message.toLowerCase()
  if (message.indexOf('Media proxy error 401') === 0) return true
  if (message.indexOf('Media proxy error 403') === 0) return true
  if (lower.indexOf('missing authorization') >= 0) return true
  if (lower.indexOf('invalid or expired google token') >= 0) return true
  if (lower.indexOf('login required') >= 0) return true
  if (lower.indexOf('sign in') >= 0) return true
  if (lower.indexOf('please login') >= 0) return true
  if (lower.indexOf('log in with') >= 0) return true
  // Authenticated library/streaming sources without a token
  if (!normalizeAccessToken(opts.accessToken) && opts.requiresAuth) {
    if (lower.indexOf('requires a configured media resolver') >= 0) return true
    if (lower.indexOf('media proxy not configured') >= 0) return true
  }
  return false
}

async function playBlobForLinkCheck(blob, options) {
  const opts = options || {}
  if (!blob) {
    return linkCheckResult(LINK_CHECK_STATUS.BROKEN, 'Audio is not available')
  }
  const playable = await blobForHtmlAudioPlayback(blob, blob.type)
  const blobUrl = URL.createObjectURL(playable)
  try {
    return await checkAudioLinkPlayback(blobUrl, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs || LINK_CHECK_TIMEOUT_RECORDING_MS,
    })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export async function resolveCachedLinkAudioBlob(link, tuneId, linkIndex, options) {
  const opts = options || {}
  const src = link && link.link != null ? String(link.link).trim() : ''
  if (!tuneId || !src) return null
  const linkCount = opts.linkCount != null ? opts.linkCount : 0
  try {
    const viaLink = await findCachedExternalMediaForLink(tuneId, linkIndex, link, linkCount)
    if (viaLink && viaLink.blob) return viaLink.blob
  } catch (e) {}
  try {
    const cached = await getCachedExternalMediaBlob(getExternalMediaCacheKey(tuneId, linkIndex, src))
    if (cached && cached.blob) return cached.blob
  } catch (e) {}
  return null
}

export async function checkRecordingLinkPlayback(link, tuneId, linkIndex, options) {
  const opts = options || {}
  if (!isOwnedMediaLink(link) && !isOwnedMediaLinkUri(link && link.link)) {
    return linkCheckResult(LINK_CHECK_STATUS.BROKEN, 'Not a recording link')
  }
  if (getLinkSrcType(link, opts.isYoutubeLink) === 'midifile') {
    try {
      await resolveRecordingLinkMidi(link, tuneId, linkIndex, {
        accessToken: opts.accessToken,
        driveApi: opts.driveApi,
        forPlayback: false,
      })
      return linkCheckResult(LINK_CHECK_STATUS.OK)
    } catch (e) {
      if (isLinkCheckAuthFailure(e, opts)) {
        return linkCheckResult(LINK_CHECK_STATUS.NEEDS_LOGIN, 'Needing Login')
      }
      return linkCheckResult(
        LINK_CHECK_STATUS.BROKEN,
        e && e.message ? e.message : 'MIDI recording is not available'
      )
    }
  }
  try {
    const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
      accessToken: opts.accessToken,
      driveApi: opts.driveApi,
      forPlayback: false,
    })
    if (!resolved || !resolved.blob) {
      return linkCheckResult(LINK_CHECK_STATUS.BROKEN, 'Recording audio is not available')
    }
    return playBlobForLinkCheck(resolved.blob, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs || LINK_CHECK_TIMEOUT_RECORDING_MS,
    })
  } catch (e) {
    if (isLinkCheckAuthFailure(e, opts)) {
      return linkCheckResult(LINK_CHECK_STATUS.NEEDS_LOGIN, 'Needing Login')
    }
    return linkCheckResult(
      LINK_CHECK_STATUS.BROKEN,
      e && e.message ? e.message : 'Recording is not available'
    )
  }
}

export async function checkMidiLinkPlayback(link, tuneId, linkIndex, options) {
  const opts = options || {}
  try {
    await resolveMidiLinkPlaybackData(link, tuneId, linkIndex, {
      accessToken: opts.accessToken,
      driveApi: opts.driveApi,
      isYoutubeLink: opts.isYoutubeLink,
    })
    return linkCheckResult(LINK_CHECK_STATUS.OK)
  } catch (e) {
    if (isLinkCheckAuthFailure(e, opts)) {
      return linkCheckResult(LINK_CHECK_STATUS.NEEDS_LOGIN, 'Needing Login')
    }
    return linkCheckResult(
      LINK_CHECK_STATUS.BROKEN,
      e && e.message ? e.message : 'MIDI link is not available'
    )
  }
}

export async function checkExternalOrInlineAudioLinkPlayback(link, tuneId, linkIndex, options) {
  const opts = options || {}
  const src = link && link.link != null ? String(link.link).trim() : ''
  if (!src) {
    return linkCheckResult(LINK_CHECK_STATUS.BROKEN, 'Missing link URL')
  }

  const cachedBlob = await resolveCachedLinkAudioBlob(link, tuneId, linkIndex, opts)
  if (cachedBlob) {
    return playBlobForLinkCheck(cachedBlob, {
      signal: opts.signal,
      timeoutMs: LINK_CHECK_TIMEOUT_SLOW_AUDIO_MS,
    })
  }

  const needsAuthSource = requiresResolverProxiedPlayback(src)
    || !!(link && link.collectionEntryId)
    || isMusicCollectionResult(link)
  const token = normalizeAccessToken(opts.accessToken)
  if (needsAuthSource && !token) {
    return linkCheckResult(LINK_CHECK_STATUS.NEEDS_LOGIN, 'Needing Login')
  }

  try {
    const blob = await fetchPlayableAudioBlob(src, opts.srcType || 'audio', {
      youtubeGetId: opts.youtubeGetId,
      accessToken: opts.accessToken,
      collectionLink: link,
    })
    return playBlobForLinkCheck(blob, {
      signal: opts.signal,
      timeoutMs: LINK_CHECK_TIMEOUT_SLOW_AUDIO_MS,
    })
  } catch (e) {
    if (isLinkCheckAuthFailure(e, Object.assign({}, opts, { requiresAuth: needsAuthSource }))) {
      return linkCheckResult(LINK_CHECK_STATUS.NEEDS_LOGIN, 'Needing Login')
    }
    // Fall back to direct URL play for plain http(s) when proxy path failed non-auth
    if (/^https?:\/\//i.test(src) && !needsAuthSource) {
      return checkAudioLinkPlayback(src, {
        signal: opts.signal,
        timeoutMs: LINK_CHECK_TIMEOUT_SLOW_AUDIO_MS,
      })
    }
    return linkCheckResult(
      LINK_CHECK_STATUS.BROKEN,
      e && e.message ? e.message : 'Could not load or play this link'
    )
  }
}

/**
 * Unified playability check for one queue item.
 * @returns {Promise<{ok:boolean,status:string,error:?string}>}
 */
export async function checkLinkPlaybackItem(item, options) {
  const opts = options || {}
  const link = item && item.link
  const tuneId = item && item.tuneId
  const linkIndex = item && item.linkIndex
  const emptyReason = getEmptyLinkReason(link)
  if (emptyReason) {
    return linkCheckResult(LINK_CHECK_STATUS.BROKEN, emptyReason)
  }

  const srcType = getLinkSrcType(link, opts.isYoutubeLink)
  if (srcType === 'skip') {
    return linkCheckResult(LINK_CHECK_STATUS.SKIP)
  }

  if (srcType === 'youtube') {
    const cachedBlob = await resolveCachedLinkAudioBlob(link, tuneId, linkIndex, opts)
    if (cachedBlob) {
      return playBlobForLinkCheck(cachedBlob, {
        signal: opts.signal,
        timeoutMs: LINK_CHECK_TIMEOUT_SLOW_AUDIO_MS,
      })
    }
    if (typeof opts.checkYoutube === 'function') {
      const yt = await opts.checkYoutube(link, opts.signal)
      if (yt && yt.ok) return linkCheckResult(LINK_CHECK_STATUS.OK)
      if (yt && yt.error === 'cancelled') {
        return linkCheckResult(LINK_CHECK_STATUS.CANCELLED, 'cancelled')
      }
      // If muted iframe check fails, try resolver audio when logged in
      const token = normalizeAccessToken(opts.accessToken)
      if (token && typeof opts.youtubeGetId === 'function') {
        try {
          const blob = await fetchPlayableAudioBlob(String(link.link).trim(), 'youtube', {
            youtubeGetId: opts.youtubeGetId,
            accessToken: opts.accessToken,
          })
          return playBlobForLinkCheck(blob, {
            signal: opts.signal,
            timeoutMs: LINK_CHECK_TIMEOUT_SLOW_AUDIO_MS,
          })
        } catch (e) {
          if (isLinkCheckAuthFailure(e, opts)) {
            return linkCheckResult(LINK_CHECK_STATUS.NEEDS_LOGIN, 'Needing Login')
          }
        }
      }
      return linkCheckResult(
        LINK_CHECK_STATUS.BROKEN,
        (yt && yt.error) || 'YouTube playback failed'
      )
    }
    return checkExternalOrInlineAudioLinkPlayback(link, tuneId, linkIndex, Object.assign({}, opts, {
      srcType: 'youtube',
    }))
  }

  if (srcType === 'midifile') {
    return checkMidiLinkPlayback(link, tuneId, linkIndex, opts)
  }

  if (srcType === 'recording') {
    return checkRecordingLinkPlayback(link, tuneId, linkIndex, opts)
  }

  if (srcType === 'inline') {
    return checkAudioLinkPlayback(String(link.link).trim(), {
      signal: opts.signal,
      timeoutMs: LINK_CHECK_TIMEOUT_AUDIO_MS,
    })
  }

  // audio (http, collection, bandcamp, archive, loc, …)
  return checkExternalOrInlineAudioLinkPlayback(link, tuneId, linkIndex, Object.assign({}, opts, {
    srcType: 'audio',
  }))
}
