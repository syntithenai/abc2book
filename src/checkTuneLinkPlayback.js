import { isOwnedMediaLink, isOwnedMediaLinkUri, resolveRecordingLinkAudio, resolveRecordingLinkMidi } from './linkRecording'
import { formatTuneDisplayName } from './tuneDisplayName'
import { resolveLinkPlaybackSrcType } from './mediaLinkSrcType'

export const LINK_CHECK_TIMEOUT_AUDIO_MS = 45000
export const LINK_CHECK_TIMEOUT_YOUTUBE_MS = 90000
export const LINK_CHECK_TIMEOUT_RECORDING_MS = 45000

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
      resolve({ ok: false, error: 'cancelled' })
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
      resolve(result)
    }

    function onAbort() {
      finish({ ok: false, error: 'cancelled' })
    }

    const timer = setTimeout(function() {
      finish({ ok: false, error: 'Timed out waiting for playback' })
    }, timeoutMs)

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }

    audio.addEventListener('error', function() {
      finish({ ok: false, error: 'Could not load or play this link' })
    })

    audio.addEventListener('playing', function() {
      finish({ ok: true })
    })

    audio.addEventListener('canplaythrough', function() {
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function() {
          finish({ ok: false, error: 'Playback was blocked or failed to start' })
        })
      }
    }, { once: true })

    audio.src = src
    audio.load()
  })
}

export async function checkRecordingLinkPlayback(link, tuneId, linkIndex, options) {
  const opts = options || {}
  if (!isOwnedMediaLink(link)) {
    return { ok: false, error: 'Not a recording link' }
  }
  if (getLinkSrcType(link, opts.isYoutubeLink) === 'midifile') {
    try {
      await resolveRecordingLinkMidi(link, tuneId, linkIndex, {
        accessToken: opts.accessToken,
        driveApi: opts.driveApi,
        forPlayback: false,
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'MIDI recording is not available' }
    }
  }
  try {
    const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
      accessToken: opts.accessToken,
      driveApi: opts.driveApi,
      forPlayback: false,
    })
    if (!resolved || !resolved.blob) {
      return { ok: false, error: 'Recording audio is not available' }
    }
    const blobUrl = URL.createObjectURL(resolved.blob)
    const result = await checkAudioLinkPlayback(blobUrl, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs || LINK_CHECK_TIMEOUT_RECORDING_MS,
    })
    URL.revokeObjectURL(blobUrl)
    return result
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Recording is not available' }
  }
}
