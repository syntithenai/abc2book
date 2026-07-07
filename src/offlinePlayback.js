import { isExternalMediaCached } from './externalMediaAudioCache'
import { getLinkSrcType } from './mediaLinkResolve'
import {
  resolvePlaybackForItem,
  isQueueActive,
  getCurrentItem,
  advanceQueue,
} from './nowPlayingQueue'

export function isNavigatorOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function playbackModeFromPathname(pathname) {
  if (!pathname) return 'auto'
  if (pathname.indexOf('/playMidi') !== -1) return 'midi'
  if (pathname.indexOf('/playMedia') !== -1) return 'media'
  return 'auto'
}

export async function isMediaLinkOfflineReady(tune, linkIndex, isYoutubeLink) {
  if (!tune || !Array.isArray(tune.links)) return false
  const link = tune.links[linkIndex]
  if (!link || !link.link) return false
  const srcType = getLinkSrcType(link.link, isYoutubeLink)
  if (srcType === 'inline') return true
  if (srcType === 'abc' || srcType === 'skip') return false
  if (srcType === 'audio' || srcType === 'youtube' || srcType === 'recording') {
    return isExternalMediaCached(tune.id, linkIndex, link.link)
  }
  return false
}

export async function isTuneOfflinePlayable(tune, target, tunebook, isYoutubeLink, playbackMode) {
  if (!tune || !tunebook) return false
  if (!isNavigatorOffline()) return true

  const mode = playbackMode || 'auto'

  if (mode === 'midi') {
    return typeof tunebook.hasNotesOrChords === 'function' && tunebook.hasNotesOrChords(tune)
  }

  let resolvedTarget = target
  if (!resolvedTarget) {
    if (mode === 'media') {
      resolvedTarget = { type: 'media', linkNum: 0 }
    } else {
      resolvedTarget = resolvePlaybackForItem(
        tune,
        { tuneId: tune.id, prefer: 'auto' },
        tunebook
      )
    }
  }

  if (!resolvedTarget) return false

  if (resolvedTarget.type === 'midi') {
    return typeof tunebook.hasNotesOrChords === 'function' && tunebook.hasNotesOrChords(tune)
  }

  const linkNum = resolvedTarget.linkNum != null ? resolvedTarget.linkNum : 0
  return isMediaLinkOfflineReady(tune, linkNum, isYoutubeLink)
}

export async function findNextOfflinePlayableListIndex(tunes, startIndex, direction, getTarget, tunebook, isYoutubeLink, playbackMode) {
  if (!Array.isArray(tunes) || tunes.length === 0) return -1
  const step = direction >= 0 ? 1 : -1
  const nextIndex = startIndex + step
  if (!isNavigatorOffline()) {
    return (nextIndex >= 0 && nextIndex < tunes.length) ? nextIndex : -1
  }

  let index = nextIndex
  let attempts = 0
  while (index >= 0 && index < tunes.length && attempts < tunes.length) {
    const tune = tunes[index]
    const target = typeof getTarget === 'function' ? getTarget(tune, index) : null
    if (await isTuneOfflinePlayable(tune, target, tunebook, isYoutubeLink, playbackMode)) {
      return index
    }
    index += step
    attempts += 1
  }
  return -1
}

export async function advanceQueueToOfflinePlayable(queue, tunes, tunebook, isYoutubeLink, playbackMode) {
  if (!isQueueActive(queue)) {
    return { queue: queue, tune: null, item: null, atEnd: true }
  }

  let workingQueue = queue
  let attempts = 0
  const maxAttempts = queue.items.length

  while (attempts < maxAttempts) {
    const item = getCurrentItem(workingQueue)
    const tune = item && item.tuneId && tunes ? tunes[item.tuneId] : null
    if (!tune) {
      return { queue: workingQueue, tune: null, item: item, atEnd: true }
    }
    const target = resolvePlaybackForItem(tune, item, tunebook)
    if (!isNavigatorOffline() || await isTuneOfflinePlayable(tune, target, tunebook, isYoutubeLink, playbackMode)) {
      return { queue: workingQueue, tune: tune, item: item, atEnd: false }
    }
    const stepped = advanceQueue(workingQueue, 1)
    if (stepped.atEdge && stepped.edge === 'end') {
      return { queue: workingQueue, tune: null, item: null, atEnd: true }
    }
    workingQueue = stepped.queue
    attempts += 1
  }

  return { queue: workingQueue, tune: null, item: null, atEnd: true }
}
