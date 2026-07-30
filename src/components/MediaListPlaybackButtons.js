import PlayWithQueueDropdown from './PlayWithQueueDropdown'
import { appendMediaCandidateToQueue, insertMediaCandidateAfterCurrentInQueue } from '../nowPlayingQueue'
import { playMediaCandidate } from '../standaloneMediaPlayback'

export default function MediaListPlaybackButtons(props) {
  const candidate = props.candidate
  if (!candidate) return null

  function handlePlay(event) {
    event.preventDefault()
    event.stopPropagation()
    if (props.mediaController && props.mediaController.preparePlaybackFromUserGesture) {
      props.mediaController.preparePlaybackFromUserGesture()
    }
    playMediaCandidate(candidate, props.mediaController, { play: true }).catch(function(err) {
      if (props.onError) props.onError(err)
    })
  }

  function handleAddToQueue(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue) return
    const next = appendMediaCandidateToQueue(props.nowPlayingQueue, candidate)
    props.setNowPlayingQueue(next)
  }

  function handlePlayNext(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue) return
    const next = insertMediaCandidateAfterCurrentInQueue(props.nowPlayingQueue, candidate)
    props.setNowPlayingQueue(next)
  }

  function handleAddToTunebook(event) {
    event.preventDefault()
    event.stopPropagation()
    if (props.onAddToTunebook) props.onAddToTunebook(candidate)
  }

  return (
    <PlayWithQueueDropdown
      variant={props.variant || 'compact'}
      playIcon={props.playIcon}
      playVariant={props.playVariant}
      isPlaying={false}
      onPlay={handlePlay}
      onAddToQueue={props.setNowPlayingQueue ? handleAddToQueue : null}
      onPlayNext={props.setNowPlayingQueue ? handlePlayNext : null}
      onAddToTunebook={props.onAddToTunebook ? handleAddToTunebook : null}
      addToTunebookLabel="Add to Tunebook"
      showQueueMenu={props.showQueueMenu !== false && !!props.setNowPlayingQueue}
      testId={'media-list-play-' + (candidate.id || candidate.uri || candidate.link || 'item')}
      className={props.className}
      playLabel={props.playLabel}
      onContainerClick={props.onContainerClick}
      buttonSize={props.buttonSize}
    />
  )
}
