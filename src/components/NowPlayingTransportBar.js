import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import {
  isQueueActive,
  getQueuePositionLabel,
  getQueueItemLabel,
  isExternalQueueItem,
  isLessonQueue,
} from '../nowPlayingQueue'
import { resumePlaylistPlayback, toggleTunePlayback } from '../tunePlaybackActions'
import { playLessonYoutube, pauseLessonYoutube, isLessonYoutubePlaying, subscribeLessonYoutube } from '../lessonYoutubePlayer'
import { isPlaybackInterruptPath } from '../toolPlaybackInterrupt'
import {
  isQueuePlaybackEngaged,
  getActivePlaybackTuneId,
} from '../playbackNavigationUtils'
import MediaSeekSlider from './MediaSeekSlider'
import TuneArtwork from './TuneArtwork'
import './NowPlayingTransportBar.css'

export default function NowPlayingTransportBar({
  nowPlayingQueue,
  setNowPlayingQueue,
  tunebook,
  tunes,
  mediaController,
  gigModeActive,
  setQueuePlayConfirm,
  nowPlayingExpanded,
  onNowPlayingExpandedChange,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [, setEngagementTick] = useState(0)
  const isFullscreen = !!nowPlayingExpanded

  const queueActive = isQueueActive(nowPlayingQueue)
  const playbackEngaged = isQueuePlaybackEngaged(mediaController, {
    queue: nowPlayingQueue,
    viewedTuneId: null,
  })
  const showBar = !gigModeActive
    && !isPlaybackInterruptPath(location.pathname)
    && (queueActive || playbackEngaged)

  const isLessonExternal = queueActive && isLessonQueue(nowPlayingQueue) && isExternalQueueItem(
    nowPlayingQueue.items[nowPlayingQueue.currentIndex || 0]
  )
  const [lessonYoutubePlaying, setLessonYoutubePlaying] = useState(isLessonYoutubePlaying)

  useEffect(function() {
    if (!showBar) return undefined
    const id = setInterval(function() {
      setEngagementTick(function(n) { return n + 1 })
    }, 500)
    return function() { clearInterval(id) }
  }, [showBar, mediaController])

  useEffect(function() {
    if (!isLessonExternal) return undefined
    return subscribeLessonYoutube(function(state) {
      setLessonYoutubePlaying(!!(state && state.isPlaying))
    })
  }, [isLessonExternal, nowPlayingQueue && nowPlayingQueue.currentIndex])

  if (!showBar) return null

  const activeTuneId = getActivePlaybackTuneId(mediaController, nowPlayingQueue)
  const queueTuneId = activeTuneId
  const currentItem = queueActive
    ? nowPlayingQueue.items[nowPlayingQueue.currentIndex || 0]
    : null
  const isExternal = currentItem ? isExternalQueueItem(currentItem) : false
  if (!queueTuneId && !isExternal) return null

  const playingTune = tunes && queueTuneId ? tunes[queueTuneId] : (mediaController && mediaController.tune)
  const tuneName = isExternal
    ? getQueueItemLabel(currentItem, tunes)
    : (playingTune && playingTune.name ? playingTune.name : 'Now playing')
  const composer = playingTune && playingTune.composer ? playingTune.composer : ''
  const positionLabel = queueActive ? getQueuePositionLabel(nowPlayingQueue) : null
  const mediaIsPlaying = !!(mediaController && mediaController.isPlaying)
  const transportIsPlaying = isLessonExternal ? lessonYoutubePlaying : mediaIsPlaying
  const isLoading = !!(mediaController && mediaController.isLoading)
  const isEngaged = isQueuePlaybackEngaged(mediaController)
  const showLoading = isLoading && isEngaged
  const stallTitle = mediaController && mediaController.playlistStalled
    ? 'Paused — network timeout'
    : null

  const queueContext = {
    tunes: tunes,
    nowPlayingQueue: nowPlayingQueue,
    setNowPlayingQueue: setNowPlayingQueue,
    setQueuePlayConfirm: setQueuePlayConfirm,
    skipQueueConfirm: true,
  }

  function stepPlaylist(direction) {
    if (!queueActive) return
    if (direction >= 0) {
      tunebook.navigateToNextSong(queueTuneId, null, navigate, location.pathname, {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    } else {
      tunebook.navigateToPreviousSong(queueTuneId, navigate, location.pathname, {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    }
  }

  function handlePlayPause() {
    if (isLessonQueue(nowPlayingQueue) && isExternal) {
      if (transportIsPlaying) pauseLessonYoutube()
      else playLessonYoutube({ fromUserGesture: true })
      return
    }
    if (!mediaController) return
    if (queueActive) {
      if (showLoading) {
        mediaController.pause()
        mediaController.setIsLoading(false)
        mediaController.setIsReady(false)
        return
      }
      if (mediaIsPlaying) {
        mediaController.pause()
        return
      }
      resumePlaylistPlayback(mediaController, tunebook, navigate, nowPlayingQueue, tunes, setNowPlayingQueue)
      return
    }
    toggleTunePlayback(mediaController, tunebook, navigate, location, queueContext)
  }

  function handleFullscreenToggle() {
    if (typeof onNowPlayingExpandedChange !== 'function') return
    onNowPlayingExpandedChange(!isFullscreen)
  }

  function openNowPlaying() {
    if (typeof onNowPlayingExpandedChange === 'function') {
      onNowPlayingExpandedChange(true)
    }
  }

  const previousButton = queueActive ? (
    <Button
      variant="primary"
      className="now-playing-transport-btn now-playing-transport-btn--previous"
      aria-label="Previous in playlist"
      title="Previous in playlist"
      data-testid="playlist-previous-button"
      onClick={function() { stepPlaylist(-1) }}
    >
      {tunebook.icons.previous}
      <span className="now-playing-transport-btn-label">Previous</span>
    </Button>
  ) : null

  const nextButton = queueActive ? (
    <Button
      variant="primary"
      className="now-playing-transport-btn now-playing-transport-btn--next"
      aria-label="Next in playlist"
      title="Next in playlist"
      data-testid="playlist-next-button"
      onClick={function() { stepPlaylist(1) }}
    >
      <span className="now-playing-transport-btn-label">Next</span>
      {tunebook.icons.next}
    </Button>
  ) : null

  const playPauseButton = showLoading ? (
    <Button
      variant="secondary"
      className="now-playing-transport-play-btn"
      title={stallTitle || 'Cancel loading'}
      aria-label={stallTitle || 'Cancel loading'}
      onClick={handlePlayPause}
    >
      {tunebook.icons.waiting}
    </Button>
  ) : transportIsPlaying ? (
    <Button
      variant="warning"
      className="now-playing-transport-play-btn"
      data-testid="playlist-pause-button"
      title="Pause"
      aria-label="Pause"
      onClick={handlePlayPause}
    >
      {tunebook.icons.pause}
    </Button>
  ) : (
    <Button
      variant="success"
      className="now-playing-transport-play-btn"
      data-testid="playlist-play-button"
      title="Play"
      aria-label="Play"
      onClick={handlePlayPause}
    >
      {tunebook.icons.play}
    </Button>
  )

  const tuneTitle = playingTune && queueTuneId ? (
    <Link
      to={'/tunes/' + queueTuneId}
      className="now-playing-transport-tune-link"
      title={'Go to ' + tuneName}
    >
      <span className="now-playing-transport-tune-name">{tuneName}</span>
      {composer ? (
        <span className="now-playing-transport-composer"> — {composer}</span>
      ) : null}
      {positionLabel ? (
        <span className="now-playing-transport-position"> ({positionLabel})</span>
      ) : null}
    </Link>
  ) : (
    <span className="now-playing-transport-tune-link">
      <span className="now-playing-transport-tune-name">{tuneName}</span>
      {composer ? (
        <span className="now-playing-transport-composer"> — {composer}</span>
      ) : null}
      {positionLabel ? (
        <span className="now-playing-transport-position"> ({positionLabel})</span>
      ) : null}
    </span>
  )

  const fullscreenButton = (
    <Button
      variant={isFullscreen ? 'secondary' : 'outline-secondary'}
      size="sm"
      className="now-playing-transport-fullscreen-btn"
      aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
      title={isFullscreen ? 'Exit full screen' : 'Full screen'}
      aria-pressed={isFullscreen}
      data-testid="now-playing-expand-button"
      onClick={handleFullscreenToggle}
    >
      {tunebook.icons.fullscreen}
    </Button>
  )

  return (
    <div
      className={'now-playing-transport-bar' + (isFullscreen ? ' now-playing-transport-bar--fullscreen' : '')}
      role="toolbar"
      aria-label="Now playing transport"
    >
      <div className="now-playing-transport-main">
        <div className="now-playing-transport-left">
          {queueActive ? previousButton : (
            <span className="now-playing-transport-btn-spacer" aria-hidden="true" />
          )}
        </div>

        <div className="now-playing-transport-center">
          {!isFullscreen ? (
            <div className="now-playing-transport-center-cluster">
              {playPauseButton}
              {playingTune ? (
                <button
                  type="button"
                  className="now-playing-transport-artwork-link"
                  title="Open now playing"
                  aria-label="Open now playing"
                  onClick={openNowPlaying}
                >
                  <TuneArtwork
                    tune={playingTune}
                    tunebook={tunebook}
                    className="now-playing-transport-artwork"
                  />
                </button>
              ) : null}
              {tuneTitle}
            </div>
          ) : null}
        </div>

        <div className="now-playing-transport-right">
          {queueActive ? nextButton : (
            <span className="now-playing-transport-btn-spacer" aria-hidden="true" />
          )}
          {fullscreenButton}
        </div>
      </div>

      {mediaController ? (
        <div className="now-playing-transport-secondary">
          <MediaSeekSlider mediaController={mediaController} className="transport compact" />
        </div>
      ) : null}
    </div>
  )
}
