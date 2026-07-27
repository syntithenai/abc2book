import { useNavigate, useLocation } from 'react-router-dom'
import { startTunePlayback } from '../tunePlaybackActions'
import { appendTuneToQueue, insertTuneAfterCurrentInQueue } from '../nowPlayingQueue'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'

function buildQueueContext(props) {
  return {
    tunes: props.tunes,
    playTuneId: props.tune && props.tune.id,
    nowPlayingQueue: props.nowPlayingQueue,
    setNowPlayingQueue: props.setNowPlayingQueue,
    setQueuePlayConfirm: props.setQueuePlayConfirm,
    skipQueueConfirm: props.skipQueueConfirm !== false,
  }
}

export default function TuneListPlaybackButtons(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const tune = props.tune
  if (!tune || !tune.id) return null
  if (!props.tunebook || !props.mediaController) return null

  const hasMusic = props.tunebook.hasNotesOrChords && props.tunebook.hasNotesOrChords(tune)
  const hasLinks = props.tunebook.hasLinks
    ? props.tunebook.hasLinks(tune)
    : (Array.isArray(tune.links) && tune.links.length > 0)
  if (!hasMusic && !hasLinks) return null

  const isPlaying = props.nowPlayingTuneId === tune.id
    && props.mediaController
    && (props.mediaController.isPlaying || props.mediaController.isLoading)

  function handlePlay(event) {
    event.preventDefault()
    event.stopPropagation()
    if (props.mediaController.preparePlaybackFromUserGesture) {
      props.mediaController.preparePlaybackFromUserGesture()
    }
    startTunePlayback(
      props.mediaController,
      props.tunebook,
      navigate,
      location,
      buildQueueContext(props)
    )
  }

  function handleAddToQueue(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue) return
    const next = appendTuneToQueue(props.nowPlayingQueue, tune.id)
    props.setNowPlayingQueue(next)
  }

  function handlePlayNext(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue) return
    const next = insertTuneAfterCurrentInQueue(props.nowPlayingQueue, tune.id)
    props.setNowPlayingQueue(next)
  }

  return (
    <PlayWithQueueDropdown
      variant={props.variant || 'compact'}
      playIcon={props.playIcon || props.tunebook.icons.play}
      playVariant={props.playVariant}
      isPlaying={isPlaying}
      onPlay={handlePlay}
      onAddToQueue={props.setNowPlayingQueue ? handleAddToQueue : null}
      onPlayNext={props.setNowPlayingQueue ? handlePlayNext : null}
      showQueueMenu={props.showQueueMenu !== false && !!props.setNowPlayingQueue}
      testId={'tune-list-play-' + tune.id}
      className={props.className}
      playLabel={props.playLabel}
      addToQueueLabel={props.addToQueueLabel}
      playNextLabel={props.playNextLabel}
      onContainerClick={props.onContainerClick}
      buttonSize={props.buttonSize}
    />
  )
}
