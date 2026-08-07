import {
  isQueueActive,
  advanceQueue,
  getCurrentItem,
  resolvePlaybackForItem,
  isExternalQueueItem,
  isRepeatPlaylist,
} from './nowPlayingQueue'
import { isQueuePlaybackEngaged } from './playbackNavigationUtils'
import { isQueueItemPlayable } from './playlistPlaybackResilience'

function isResolverOrYoutubeTarget(target, tunebook) {
  if (!target || target.type === 'midi') return false
  if (target.srcType === 'youtube') return true
  const isYoutube = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink
  if (target.src && isYoutube && isYoutube(target.src)) return true
  return target.srcType === 'resolver' || target.srcType === 'audio'
}

/**
 * Prefetch media for the next queue item during active playlist playback.
 */
export function prefetchUpcomingQueueItem(queue, tunes, tunebook, mediaController, options) {
  const opts = options || {}
  if (!isQueueActive(queue) || !mediaController || !tunebook) return false
  if (!isQueuePlaybackEngaged(mediaController, { queue: queue })) return false

  const wrap = isRepeatPlaylist(queue)
  const stepped = advanceQueue(queue, 1, { wrap: wrap })
  if (stepped.atEdge) return false

  const item = getCurrentItem(stepped.queue)
  if (!item || isExternalQueueItem(item)) return false

  const tune = item.tuneId && tunes ? tunes[item.tuneId] : null
  if (!tune || !isQueueItemPlayable(tune, item, tunebook)) return false

  const target = resolvePlaybackForItem(tune, item, tunebook)
  if (!isResolverOrYoutubeTarget(target, tunebook)) return false

  const linkIndex = target.linkNum != null ? target.linkNum : (item.linkIndex != null ? item.linkIndex : 0)
  const links = Array.isArray(tune.links) ? tune.links : []
  const link = links[linkIndex] || links[0]
  if (!link) return false

  const src = link.link || link.url || ''
  const srcType = target.srcType || (tunebook.utils && tunebook.utils.isYoutubeLink && tunebook.utils.isYoutubeLink(src) ? 'youtube' : 'audio')

  if (mediaController.prefetchTuneMediaLink) {
    return mediaController.prefetchTuneMediaLink(tune, linkIndex, src, srcType, opts)
  }

  if (mediaController.prepareExternalMedia && src) {
    mediaController.prepareExternalMedia(src, undefined, {
      autoPlay: false,
      showLoading: false,
      prefetchOnly: true,
    })
    return true
  }

  return false
}
