import { getLinkSrcType } from './checkTuneLinkPlayback'
import { getTuneOwnedMediaDriveSummary, isOwnedMediaLink } from './linkRecording'
import { isMusicCollectionLinkUri } from './musicCollectionLinkUtils'
import { isBandcampLinkUri } from './bandcampLinkUtils'
import { isArchiveOrgLinkUri } from './archiveOrgLinkUtils'
import { isLocGovLinkUri } from './locGovLinkUtils'
import { linkUriString } from './tuneLinkUri'
import { getAudioCacheTuneSummaries, getStemCacheTuneSummaries } from './mediaCacheStorage'

const DECLARED_SOURCES = {
  youtube: true,
  'music-collection': true,
  'device-file': true,
  bandcamp: true,
  'internet-archive': true,
  europeana: true,
  loc: true,
  file: true,
  mic: true,
  'video-file': true,
}

export function resolveTuneMediaSource(link, srcType) {
  const declared = link && link.source
  if (declared && DECLARED_SOURCES[declared]) return declared
  if (srcType === 'youtube') return 'youtube'
  if (srcType === 'midifile') return 'midi'
  if (srcType === 'recording') return 'recording'
  const uri = linkUriString(link)
  if (isMusicCollectionLinkUri(uri)) return 'music-collection'
  if (isBandcampLinkUri(uri)) return 'bandcamp'
  if (isArchiveOrgLinkUri(uri)) return 'internet-archive'
  if (isLocGovLinkUri(uri)) return 'loc'
  if (srcType === 'inline') return 'recording'
  if (srcType === 'audio') return 'audio'
  return srcType || null
}

export function emptyTuneMediaLinkStatus() {
  return {
    hasMidi: false,
    hasYoutube: false,
    hasRecording: false,
    mediaSource: null,
    driveStatus: null,
    hasOwnedMedia: false,
    hasCachedMedia: false,
    hasStems: false,
    mediaCacheScanned: false,
  }
}

/**
 * Sync media-kind flags from tune.links. Cache and stems are filled later
 * from IndexedDB summaries.
 */
export function scanTuneMediaLinkStatus(tune, isYoutubeLink) {
  const status = emptyTuneMediaLinkStatus()
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return status

  tune.links.forEach(function(link) {
    if (!link) return
    const srcType = getLinkSrcType(link, isYoutubeLink)
    if (srcType === 'empty' || srcType === 'skip') return
    if (srcType === 'midifile') status.hasMidi = true
    if (srcType === 'youtube') status.hasYoutube = true
    if (srcType === 'recording' || srcType === 'inline') status.hasRecording = true
    if (isOwnedMediaLink(link)) status.hasOwnedMedia = true
    if (!status.mediaSource) status.mediaSource = resolveTuneMediaSource(link, srcType)
  })

  const drive = getTuneOwnedMediaDriveSummary(tune)
  status.driveStatus = drive ? drive.status : null
  return status
}

function summaryTuneIds(summaries) {
  const ids = {}
  ;(summaries || []).forEach(function(row) {
    if (!row || !row.tuneId || !(row.entries > 0)) return
    ids[String(row.tuneId)] = true
  })
  return ids
}

export function mergeMediaCacheFlags(tuneStatus, audioSummaries, stemSummaries) {
  const audioIds = summaryTuneIds(audioSummaries)
  const stemIds = summaryTuneIds(stemSummaries)
  const next = {}
  let changed = false
  Object.keys(tuneStatus || {}).forEach(function(id) {
    const entry = tuneStatus[id]
    if (!entry) return
    const hasCachedMedia = !!audioIds[id] || !!audioIds[String(id)]
    const hasStems = !!stemIds[id] || !!stemIds[String(id)]
    if (
      entry.hasCachedMedia === hasCachedMedia
      && entry.hasStems === hasStems
      && entry.mediaCacheScanned
    ) {
      next[id] = entry
      return
    }
    changed = true
    next[id] = Object.assign({}, entry, {
      hasCachedMedia: hasCachedMedia,
      hasStems: hasStems,
      mediaCacheScanned: true,
    })
  })
  return changed ? next : tuneStatus
}

export async function attachMediaCacheFlags(tuneStatus, shouldCancel) {
  const map = tuneStatus || {}
  const ids = Object.keys(map)
  if (ids.length === 0) return map
  let needsScan = false
  ids.forEach(function(id) {
    if (map[id] && !map[id].mediaCacheScanned) needsScan = true
  })
  if (!needsScan) return map
  if (typeof shouldCancel === 'function' && shouldCancel()) return null
  let audioSummaries = []
  let stemSummaries = []
  try {
    const results = await Promise.all([
      getAudioCacheTuneSummaries(),
      getStemCacheTuneSummaries(),
    ])
    audioSummaries = results[0]
    stemSummaries = results[1]
  } catch (err) {
    audioSummaries = []
    stemSummaries = []
  }
  if (typeof shouldCancel === 'function' && shouldCancel()) return null
  return mergeMediaCacheFlags(map, audioSummaries, stemSummaries)
}
