import { playlistIndexForTrack, startLessonPlaylist } from '../lessonPlaylist'
import { LessonQuickInfoPopover, LessonQuickInfoTrigger } from './LessonQuickInfo'

function trackHasPlay(track) {
  return !!(track && (track.youtube || track.youtubeId))
}

export default function LessonTrackRef(props) {
  const trackId = props.trackId
  const track = props.track
  const entity = props.entity
  const label = props.label || (track && track.label) || props.trackId || 'Recording'
  const lesson = props.lesson
  const tunebook = props.tunebook
  const navigate = props.navigate
  const mediaController = props.mediaController
  const playIndex = playlistIndexForTrack(lesson, trackId)
  const canPlay = playIndex >= 0 && trackHasPlay(track)

  function handlePlay(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!canPlay) return
    startLessonPlaylist(lesson, playIndex, {
      tunebook: tunebook,
      navigate: navigate,
      mediaController: mediaController,
    })
  }

  if (!entity) {
    return (
      <span className="lesson-track-ref" data-track-id={trackId}>
        <em className="lesson-track-label-plain">{label}</em>
        {canPlay ? (
          <button
            type="button"
            className="lesson-inline-play"
            aria-label={'Play ' + label}
            onClick={handlePlay}
          >
            {tunebook.icons.play}
          </button>
        ) : null}
      </span>
    )
  }

  const overlay = (
    <LessonQuickInfoPopover
      entity={entity}
      recordingLabel={label}
      tunebook={tunebook}
      canPlay={canPlay}
      onPlay={handlePlay}
      popoverId={'lesson-track-' + trackId}
    />
  )

  return (
    <span className="lesson-track-ref" data-track-id={trackId}>
      <LessonQuickInfoTrigger
        overlay={overlay}
        trigger={(
          <button
            type="button"
            className="lesson-track-label"
            aria-label={'About ' + label + ' — ' + entity.name}
          >
            <em>{label}</em>
          </button>
        )}
      />
      {canPlay ? (
        <button
          type="button"
          className="lesson-inline-play"
          aria-label={'Play ' + label}
          title={'Play ' + label}
          onClick={handlePlay}
        >
          {tunebook.icons.play}
        </button>
      ) : null}
    </span>
  )
}
