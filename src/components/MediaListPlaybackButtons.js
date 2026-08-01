import PlayWithQueueDropdown from './PlayWithQueueDropdown'
import {
  appendMediaCandidateToActiveQueue,
  insertMediaCandidateNextInActiveQueue,
  isMediaCandidateCurrentQueueItem,
  pauseMediaCandidateQueuePlayback,
  resumeMediaCandidateQueuePlayback,
  startMediaCandidateQueuePlayback,
} from '../mediaSearchQueuePlayback'
import { isStandaloneMediaCandidateEngaged } from '../standaloneMediaPlayback'
import { useStandaloneMediaPlaybackState } from '../useStandaloneMediaPlaybackState'

export default function MediaListPlaybackButtons(props) {
  const candidate = props.candidate
  const playbackState = useStandaloneMediaPlaybackState(candidate, props.nowPlayingQueue)
  if (!candidate) return null

  const isPlaying = playbackState.isPlaying
  const isEngaged = isMediaCandidateCurrentQueueItem(candidate, props.nowPlayingQueue)
    && isStandaloneMediaCandidateEngaged(candidate)

  async function handlePlay(event) {
    event.preventDefault()
    event.stopPropagation()
    if (isPlaying) {
      try {
        await pauseMediaCandidateQueuePlayback()
      } catch (err) {
        if (props.onError) props.onError(err)
      }
      return
    }
    if (isEngaged) {
      try {
        await resumeMediaCandidateQueuePlayback()
      } catch (err) {
        if (props.onError) props.onError(err)
      }
      return
    }
    try {
      startMediaCandidateQueuePlayback({
        candidate: candidate,
        tunebook: props.tunebook,
        setNowPlayingQueue: props.setNowPlayingQueue,
        mediaController: props.mediaController,
      })
    } catch (err) {
      if (props.onError) props.onError(err)
    }
  }

  function handleAddToQueue(event) {
    event.preventDefault()
    event.stopPropagation()
    appendMediaCandidateToActiveQueue(
      props.nowPlayingQueue,
      candidate,
      props.setNowPlayingQueue
    )
  }

  function handlePlayNext(event) {
    event.preventDefault()
    event.stopPropagation()
    insertMediaCandidateNextInActiveQueue(
      props.nowPlayingQueue,
      candidate,
      props.setNowPlayingQueue
    )
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
      pauseIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.pause : null}
      playVariant={props.playVariant}
      isPlaying={isPlaying}
      onPlay={handlePlay}
      onAddToQueue={props.setNowPlayingQueue ? handleAddToQueue : null}
      onPlayNext={props.setNowPlayingQueue ? handlePlayNext : null}
      onAddToTunebook={props.onAddToTunebook ? handleAddToTunebook : null}
      addToTunebookLabel="Add to Tunebook"
      showQueueMenu={props.showQueueMenu !== false && !!props.setNowPlayingQueue}
      testId={'media-list-play-' + (candidate.id || candidate.uri || candidate.link || 'item')}
      className={props.className || 'tune-list-item-play'}
      playLabel={props.playLabel}
      onContainerClick={props.onContainerClick}
      buttonSize={props.buttonSize}
      listItemMenu
    />
  )
}
