import { playlistIndexForEntity, startLessonPlaylist } from '../lessonPlaylist'
import { LessonQuickInfoPopover, LessonQuickInfoTrigger } from './LessonQuickInfo'

function entityHasPlay(entity, lesson, track) {
  if (track && (track.youtube || track.youtubeId)) return true
  if (!entity || !lesson) return false
  if (typeof entity.playlist_index === 'number') {
    const playlist = lesson.playlist || []
    const row = playlist[entity.playlist_index]
    return !!(row && (row.youtube || row.youtubeId))
  }
  const idx = playlistIndexForEntity(lesson, entity.id)
  if (idx < 0) return false
  const playlist = lesson.playlist || []
  const row = playlist[idx]
  return !!(row && (row.youtube || row.youtubeId))
}

export default function LessonEntityRef(props) {
  const entity = props.entity
  const lesson = props.lesson
  const tunebook = props.tunebook
  const navigate = props.navigate
  const mediaController = props.mediaController

  if (!entity) return null

  const playIndex = typeof entity.playlist_index === 'number'
    ? entity.playlist_index
    : playlistIndexForEntity(lesson, entity.id)
  const playlistTrack = playIndex >= 0 && lesson && lesson.playlist
    ? lesson.playlist[playIndex]
    : null
  const canPlay = entityHasPlay(entity, lesson, playlistTrack)

  function handlePlay(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!canPlay || playIndex < 0) return
    startLessonPlaylist(lesson, playIndex, {
      tunebook: tunebook,
      navigate: navigate,
      mediaController: mediaController,
    })
  }

  const overlay = (
    <LessonQuickInfoPopover
      entity={entity}
      tunebook={tunebook}
      canPlay={canPlay}
      onPlay={handlePlay}
      popoverId={'lesson-entity-' + entity.id}
    />
  )

  return (
    <span className="lesson-entity-ref" data-entity-id={entity.id} ref={props.innerRef}>
      <LessonQuickInfoTrigger
        overlay={overlay}
        trigger={(
          <button
            type="button"
            className="lesson-entity-name"
            aria-label={'About ' + entity.name}
          >
            {entity.name}
          </button>
        )}
      />
      {canPlay ? (
        <button
          type="button"
          className="lesson-inline-play"
          aria-label={'Play ' + entity.name}
          onClick={handlePlay}
        >
          {tunebook.icons.play}
        </button>
      ) : null}
    </span>
  )
}
