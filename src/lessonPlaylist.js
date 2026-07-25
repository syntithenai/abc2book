import { createQueueId } from './nowPlayingQueue'
import { extractYoutubeVideoId } from './lessonYoutube'
import { playLessonYoutube } from './lessonYoutubePlayer'
import { stopPlaylistPlayback } from './playlistPlaybackResilience'

/**
 * Build a transient lesson queue from playlist track definitions.
 * @param {object} options
 * @param {Array} options.tracks - { youtube, label, subtitle?, entityId? }
 * @param {string} options.lessonId
 * @param {string} options.name
 * @param {number} [options.currentIndex]
 */
export function createLessonQueue(options) {
  const opts = options || {}
  const tracks = Array.isArray(opts.tracks) ? opts.tracks : []
  const items = tracks.map(function(track) {
    const youtubeId = extractYoutubeVideoId(track.youtube || track.youtubeId)
    if (!youtubeId) return null
    return {
      tuneId: null,
      prefer: 'external',
      externalMedia: {
        youtubeId: youtubeId,
        title: track.label || track.title || 'Lesson track',
        subtitle: track.subtitle || track.artist || '',
        lessonId: opts.lessonId || '',
        entityId: track.entityId || track.entity_id || null,
      },
    }
  }).filter(Boolean)

  return {
    id: opts.id || createQueueId(),
    name: opts.name || 'Lesson playlist',
    source: 'lesson',
    lessonId: opts.lessonId || null,
    items: items,
    currentIndex: typeof opts.currentIndex === 'number' ? opts.currentIndex : 0,
    followTune: false,
    autoAdvance: true,
    loop: false,
    shuffle: false,
    shuffleOrder: null,
    suspendSnapshot: null,
    previewOnce: null,
  }
}

/**
 * Resolve playlist index for an entity (first track linked to entity_id).
 */
export function playlistIndexForEntity(lesson, entityId) {
  if (!lesson || !entityId) return -1
  const playlist = Array.isArray(lesson.playlist) ? lesson.playlist : []
  const idx = playlist.findIndex(function(track) {
    return track && (track.entity_id === entityId || track.entityId === entityId)
  })
  if (idx >= 0) return idx
  const entities = Array.isArray(lesson.entities) ? lesson.entities : []
  const entity = entities.find(function(e) { return e && e.id === entityId })
  if (entity && typeof entity.playlist_index === 'number') return entity.playlist_index
  return -1
}

export function playlistIndexForTrack(lesson, trackId) {
  if (!lesson || !trackId) return -1
  const playlist = Array.isArray(lesson.playlist) ? lesson.playlist : []
  return playlist.findIndex(function(track) {
    return track && track.id === trackId
  })
}

export function startLessonPlaylist(lesson, startIndex, deps) {
  const d = deps || {}
  const playlist = Array.isArray(lesson && lesson.playlist) ? lesson.playlist : []
  if (!playlist.length || !d.tunebook || !d.tunebook.startNowPlayingQueue) return false
  const queue = createLessonQueue({
    tracks: playlist,
    lessonId: lesson.id,
    name: lesson.title || lesson.name || 'Lesson',
    currentIndex: typeof startIndex === 'number' ? startIndex : 0,
  })
  if (!queue.items.length) return false
  if (d.mediaController) stopPlaylistPlayback(d.mediaController)
  d.tunebook.startNowPlayingQueue(queue, d.navigate, {
    startPlayback: true,
    navigate: false,
    mediaController: d.mediaController,
  })
  playLessonYoutube({ fromUserGesture: true })
  if (d.setLessonPlaybackActive) d.setLessonPlaybackActive(true)
  return true
}
