import { useNavigate, useLocation } from 'react-router-dom'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'
import {
  appendMediaCandidateToActiveQueue,
  isMediaCandidateCurrentQueueItem,
  pauseMediaCandidateQueuePlayback,
  resumeMediaCandidateQueuePlayback,
  startMediaCandidateQueuePlayback,
} from '../mediaSearchQueuePlayback'
import { isStandaloneMediaCandidateEngaged } from '../standaloneMediaPlayback'
import { useStandaloneMediaPlaybackState } from '../useStandaloneMediaPlaybackState'
import { startTunePlayback, finalizePlayNextQueue } from '../tunePlaybackActions'
import {
  appendTuneToQueue,
  insertTuneAfterCurrentInQueue,
  insertMediaCandidateAfterCurrentInQueue,
} from '../nowPlayingQueue'
import {
  ensureMediaSearchTune,
  findExistingMediaSearchTune,
  isMaterializableMediaSearchCandidate,
} from '../mediaSearchTuneMaterialize'

function buildQueueContext(props) {
  return {
    tunes: props.tunes,
    nowPlayingQueue: props.nowPlayingQueue,
    setNowPlayingQueue: props.setNowPlayingQueue,
    setCurrentTune: props.setCurrentTune,
  }
}

function buildMaterializeOptions(props) {
  return {
    tunes: props.tunes,
    abcjsParser: props.abcjsParser,
    accessToken: props.accessToken || '',
    resolverAvailable: props.resolverAvailable,
    searchIndex: props.searchIndex,
    loadTuneTexts: props.loadTuneTexts,
    forceRefresh: props.forceRefresh,
  }
}

export default function MediaListPlaybackButtons(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const candidate = props.candidate
  const materializable = isMaterializableMediaSearchCandidate(candidate)
  const playbackState = useStandaloneMediaPlaybackState(candidate, props.nowPlayingQueue)
  if (!candidate) return null

  const mediaController = props.mediaControllerRef && props.mediaControllerRef.current
    ? props.mediaControllerRef.current
    : props.mediaController

  const materializedTune = materializable && props.tunes
    ? findExistingMediaSearchTune(props.tunes, candidate)
    : null

  const isPlaying = materializable
    ? !!(materializedTune
      && props.nowPlayingTuneId === materializedTune.id
      && mediaController
      && (mediaController.isPlaying || mediaController.isLoading))
    : playbackState.isPlaying

  const isEngaged = materializable
    ? !!(materializedTune && props.nowPlayingTuneId === materializedTune.id)
    : isMediaCandidateCurrentQueueItem(candidate, props.nowPlayingQueue)
      && isStandaloneMediaCandidateEngaged(candidate)

  async function handleMaterializedPlay(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.tunebook || !mediaController) return
    if (mediaController.preparePlaybackFromUserGesture) {
      mediaController.preparePlaybackFromUserGesture()
    }
    try {
      const tune = await ensureMediaSearchTune(candidate, props.tunebook, buildMaterializeOptions(props))
      startTunePlayback(
        mediaController,
        props.tunebook,
        navigate,
        location,
        Object.assign({}, buildQueueContext(props), { playTuneId: tune.id })
      )
    } catch (err) {
      if (props.onError) props.onError(err)
    }
  }

  async function handleMaterializedAddToQueue(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue || !props.tunebook) return
    try {
      const tune = await ensureMediaSearchTune(candidate, props.tunebook, buildMaterializeOptions(props))
      const next = appendTuneToQueue(props.nowPlayingQueue, tune.id)
      props.setNowPlayingQueue(next)
    } catch (err) {
      if (props.onError) props.onError(err)
    }
  }

  async function handleMaterializedPlayNext(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!props.setNowPlayingQueue || !props.tunebook) return
    try {
      const tune = await ensureMediaSearchTune(candidate, props.tunebook, buildMaterializeOptions(props))
      const priorQueue = props.nowPlayingQueue
      const next = insertTuneAfterCurrentInQueue(priorQueue, tune.id)
      finalizePlayNextQueue(mediaController, props.tunebook, priorQueue, next, props.setNowPlayingQueue)
    } catch (err) {
      if (props.onError) props.onError(err)
    }
  }

  async function handlePlay(event) {
    if (materializable) {
      if (isPlaying && mediaController && mediaController.pause) {
        event.preventDefault()
        event.stopPropagation()
        mediaController.pause()
        return
      }
      await handleMaterializedPlay(event)
      return
    }
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
        mediaController: mediaController,
      })
    } catch (err) {
      if (props.onError) props.onError(err)
    }
  }

  function handleAddToQueue(event) {
    if (materializable) {
      handleMaterializedAddToQueue(event)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    appendMediaCandidateToActiveQueue(
      props.nowPlayingQueue,
      candidate,
      props.setNowPlayingQueue
    )
  }

  function handlePlayNext(event) {
    if (materializable) {
      handleMaterializedPlayNext(event)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const priorQueue = props.nowPlayingQueue
    const next = insertMediaCandidateAfterCurrentInQueue(priorQueue, candidate, {
      source: 'media-search',
      autoAdvance: true,
    })
    finalizePlayNextQueue(mediaController, props.tunebook, priorQueue, next, props.setNowPlayingQueue)
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
      onAddToTunebook={!materializable && props.onAddToTunebook ? handleAddToTunebook : null}
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
