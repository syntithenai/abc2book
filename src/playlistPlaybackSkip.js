import {
  isQueueActive,
  isExternalQueueItem,
} from './nowPlayingQueue'
import { isMediaLinkPlaybackCandidate } from './mediaLinkSrcType'
import { advanceQueueToNextPlayable } from './playlistPlaybackResilience'

export function collectMediaLinkCandidateIndexes(tune, isYoutubeLink) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return []
  const indexes = []
  for (let i = 0; i < tune.links.length; i++) {
    if (isMediaLinkPlaybackCandidate(tune.links[i], isYoutubeLink)) indexes.push(i)
  }
  return indexes
}

/**
 * Next playable media link on the same tune (after the given link index).
 * Walks remaining links, then wraps so every candidate is tried once.
 */
export function findNextPlayableLinkIndex(tune, tunebook, afterLinkIndex, options) {
  const opts = options || {}
  if (!tune || !Array.isArray(tune.links) || tune.links.length < 2) return -1
  const skipIndexes = opts.skipIndexes || {}
  const isYoutubeLink = opts.isYoutubeLink
    || (tunebook && tunebook.utils && tunebook.utils.isYoutubeLink)
  const start = typeof afterLinkIndex === 'number' && afterLinkIndex >= 0
    ? afterLinkIndex + 1
    : 0
  const count = tune.links.length
  for (let offset = 0; offset < count; offset++) {
    const i = (start + offset) % count
    if (i === afterLinkIndex) continue
    if (skipIndexes[i]) continue
    if (isMediaLinkPlaybackCandidate(tune.links[i], isYoutubeLink)) return i
  }
  return -1
}

/**
 * Walk the queue forward from the current item, skipping failures / unplayable tunes.
 */
export async function advanceQueueAfterPlaybackFailure(queue, tunes, tunebook, options) {
  const opts = options || {}
  if (!isQueueActive(queue)) {
    return { queue: queue, tune: null, item: null, atEnd: true }
  }

  const maxSkips = typeof opts.maxSkips === 'number' ? opts.maxSkips : queue.items.length
  let workingQueue = queue

  for (let skip = 0; skip < maxSkips; skip++) {
    const result = await advanceQueueToNextPlayable(workingQueue, tunes, tunebook, {
      direction: 1,
      advanceFirst: true,
      isYoutubeLink: opts.isYoutubeLink,
      playbackMode: opts.playbackMode || 'auto',
      accessToken: opts.accessToken,
      resolverStatus: opts.resolverStatus,
      resolverHealth: opts.resolverHealth,
    })
    if (!result.atEnd && result.item) {
      return result
    }
    if (result.atEnd) break
    workingQueue = result.queue || workingQueue
  }

  return { queue: workingQueue, tune: null, item: null, atEnd: true }
}

export function queueItemHasAlternateMediaLinks(tune, item, tunebook, currentLinkIndex, options) {
  if (!tune || isExternalQueueItem(item)) return false
  return findNextPlayableLinkIndex(tune, tunebook, currentLinkIndex, options) >= 0
}

export function getCurrentQueueItemLinkIndex(item, mediaLinkNumber) {
  if (item && item.linkIndex != null) return item.linkIndex
  if (mediaLinkNumber != null && mediaLinkNumber !== '') {
    const parsed = parseInt(mediaLinkNumber, 10)
    if (!isNaN(parsed)) return parsed
  }
  return 0
}
