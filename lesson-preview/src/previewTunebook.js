import { icons } from '@app/Icons'
import { playLessonYoutube } from '@app/lessonYoutubePlayer'

/**
 * Minimal tunebook stub so LessonTrackRef / startLessonPlaylist work in static preview.
 */
export function createPreviewTunebook(setNowPlayingQueue) {
  return {
    icons: icons,
    startNowPlayingQueue: function(queue) {
      if (typeof setNowPlayingQueue === 'function') {
        setNowPlayingQueue(queue)
      }
      playLessonYoutube({ fromUserGesture: true })
      return true
    },
  }
}
