import { getScratchpadBlob } from './scratchpadBlobs'
import {
  normalizeAudioProject,
  getActiveTake,
  getTakeById,
  getTrackById,
  getProjectDuration,
} from './scratchpadAudioProject'
import { resolveRecordingLinkAudio, isOwnedMediaLink } from './linkRecording'
import { getLinkSrcType } from './checkTuneLinkPlayback'
import { fetchDirectOrProxy } from './mediaProxyClient'
import { getLinkTrimBounds, trimAudioBuffer } from './mediaAudioTrim'
import { buildTuneMediaExportBlob } from './mediaExportUtils'
import { decodeAudioBlob } from './audioSilenceUtils'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'
import { pasteIntoBlob } from './scratchpadAudioEditOps'

async function srcToBlob(src, srcType, options) {
  const trimmed = String(src || '').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) {
    const response = await fetch(trimmed)
    return response.blob()
  }
  const result = await fetchDirectOrProxy({
    src: trimmed,
    srcType: srcType,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.token,
    collectionLink: options.collectionLink || null,
  })
  return result.response.blob()
}

async function applyLinkTrim(blob, link) {
  if (!link) return blob
  const bounds = getLinkTrimBounds(link)
  if (!bounds.startSec && !bounds.endSec) return blob
  const buffer = await decodeAudioBlob(blob)
  const trimmed = trimAudioBuffer(buffer, bounds.startSec, bounds.endSec || buffer.duration)
  if (!trimmed) return blob
  return encodeAudioBufferToWav(trimmed)
}

/**
 * Resolve audio bytes from a scratchpad audio item.
 * Options: { trackId, takeId, source: 'mixdown' | 'take' }
 */
export async function resolveScratchpadItemAudioBlob(item, options) {
  const opts = options || {}
  if (!item || item.type !== 'audio') {
    throw new Error('Not an audio scratchpad item')
  }
  const audio = normalizeAudioProject(item)
  if (!audio) throw new Error('Invalid audio project')

  let blobKey = null
  const source = opts.source || 'mixdown'

  if (source === 'mixdown' && audio.mixdownBlobKey) {
    const mixBlob = await getScratchpadBlob(audio.mixdownBlobKey)
    if (mixBlob && mixBlob.size > 0) return mixBlob
  }

  let track = null
  if (opts.trackId) {
    track = getTrackById(audio, opts.trackId)
  }
  if (!track) {
    track = (audio.tracks || []).find(function(t) { return t.type === 'audio' })
  }
  if (!track) throw new Error('No audio track in source item')

  let take = null
  if (opts.takeId) {
    take = getTakeById(track, opts.takeId)
  } else {
    take = getActiveTake(track)
  }
  if (!take || !take.blobKey) throw new Error('No audio data in source item')

  blobKey = take.blobKey
  const blob = await getScratchpadBlob(blobKey)
  if (!blob || blob.size <= 0) throw new Error('Could not load source audio')
  return blob
}

export function listScratchpadItemAudioSources(item) {
  if (!item || item.type !== 'audio') return []
  const audio = normalizeAudioProject(item)
  if (!audio) return []
  const sources = []
  if (audio.mixdownBlobKey) {
    sources.push({ id: 'mixdown', label: 'Mixdown', source: 'mixdown' })
  }
  ;(audio.tracks || []).forEach(function(track) {
    if (track.type === 'midi') return
    ;(track.takes || []).forEach(function(take, index) {
      if (!take.blobKey) return
      const isActive = take.id === track.activeTakeId
      sources.push({
        id: track.id + ':' + take.id,
        label: (track.name || 'Track') + ' — Take ' + (index + 1) + (isActive ? ' (active)' : ''),
        source: 'take',
        trackId: track.id,
        takeId: take.id,
      })
    })
  })
  return sources
}

/**
 * Resolve audio bytes from a tune link (recording, URL, or YouTube).
 */
export async function resolveTuneLinkAudioBlob(options) {
  const opts = options || {}
  const linkIndex = opts.linkIndex != null ? opts.linkIndex : 0
  const link = opts.link || (opts.tune && opts.tune.links ? opts.tune.links[linkIndex] : null)
  const tuneId = (opts.tune && opts.tune.id) || opts.tuneId
  if (!link || !String(link.link || '').trim()) {
    throw new Error('Missing tune link')
  }
  const isYoutubeLink = opts.tunebook && opts.tunebook.utils && opts.tunebook.utils.isYoutubeLink
    ? function(url) { return opts.tunebook.utils.isYoutubeLink(url) }
    : opts.isYoutubeLink
  const srcType = getLinkSrcType(link, isYoutubeLink)

  if (srcType !== 'audio' && srcType !== 'recording' && srcType !== 'youtube') {
    throw new Error('This link type cannot be inserted as audio')
  }

  let blob = null

  if (srcType === 'recording' || isOwnedMediaLink(link)) {
    if (!tuneId) throw new Error('Save the tune before inserting audio')
    const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
      accessToken: opts.token && opts.token.access_token,
      driveApi: opts.driveApi,
      forPlayback: true,
    })
    blob = resolved && resolved.blob
  } else if (srcType === 'youtube') {
    if (!opts.tune || !opts.tune.links) {
      throw new Error('Tune context required for YouTube links')
    }
    const exported = await buildTuneMediaExportBlob({
      tune: opts.tune,
      linkIndex: linkIndex,
      srcType: srcType,
      youtubeGetId: opts.tunebook && opts.tunebook.utils && opts.tunebook.utils.youtubeGetId,
      accessToken: opts.token && opts.token.access_token,
      trim: true,
      audioFormat: 'wav',
    })
    blob = exported && exported.blob
  } else {
    blob = await srcToBlob(link.link, srcType, {
      youtubeGetId: opts.tunebook && opts.tunebook.utils && opts.tunebook.utils.youtubeGetId,
      token: opts.token && opts.token.access_token,
      collectionLink: link,
    })
  }

  if (!blob || blob.size <= 0) {
    throw new Error('Could not load audio from tune link')
  }

  if (srcType !== 'youtube') {
    blob = await applyLinkTrim(blob, link)
  }
  return blob
}

export function linkCanInsertAsAudio(link, isYoutubeLink) {
  const srcType = getLinkSrcType(link, isYoutubeLink)
  return srcType === 'audio' || srcType === 'recording' || srcType === 'youtube'
}

/**
 * Paste insertBlob into baseBlob at playhead (or replace selection).
 */
export async function insertAudioBlobAtPlayhead(baseBlob, insertBlob, playheadSec, selection) {
  return pasteIntoBlob(baseBlob, insertBlob, playheadSec, selection)
}

export async function getScratchpadItemDuration(item) {
  if (!item || item.type !== 'audio') return 0
  const audio = normalizeAudioProject(item)
  if (!audio) return 0
  return getProjectDuration(audio)
}
