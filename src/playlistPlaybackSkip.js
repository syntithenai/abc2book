import {
  isQueueActive,
  getCurrentItem,
  resolvePlaybackForItem,
  isExternalQueueItem,
} from './nowPlayingQueue'
import { advanceQueueToNextPlayable } from './playlistPlaybackResilience'

/**
 * Next playable media link on the same tune (after the given link index).
 */
export function findNextPlayableLinkIndex(tune, tunebook, afterLinkIndex) {
  if (!tune || !tunebook || !Array.isArray(tune.links) || tune.links.length < 2) return -1
  const start = typeof afterLinkIndex === 'number' && afterLinkIndex >= 0
    ? afterLinkIndex + 1
    : 0
  for (let i = start; i < tune.links.length; i++) {
    const item = { tuneId: tune.id, prefer: 'media', linkIndex: i }
    if (resolvePlaybackForItem(tune, item, tunebook)) return i
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
    })
    if (!result.atEnd && result.item) {
      return result
    }
    if (result.atEnd) break
    workingQueue = result.queue || workingQueue
  }

  return { queue: workingQueue, tune: null, item: null, atEnd: true }
}

export function queueItemHasAlternateMediaLinks(tune, item, tunebook, currentLinkIndex) {
  if (!tune || !item || isExternalQueueItem(item)) return false
  return findNextPlayableLinkIndex(tune, tunebook, currentLinkIndex) >= 0
}

export function getCurrentQueueItemLinkIndex(item, mediaLinkNumber) {
  if (item && item.linkIndex != null) return item.linkIndex
  if (mediaLinkNumber != null && mediaLinkNumber !== '') {
    const parsed = parseInt(mediaLinkNumber, 10)
    if (!isNaN(parsed)) return parsed
  }
  return 0
}
