import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import {
  isQueueActive,
  getQueuePositionLabel,
} from '../nowPlayingQueue'
import { resumePlaylistPlayback, toggleTunePlayback } from '../tunePlaybackActions'
import { isQueuePlaybackEngaged, getActivePlaybackTuneId } from '../playbackNavigationUtils'
import MediaSeekSlider from '../components/MediaSeekSlider'
import PlaybackVolumeSlider from '../components/PlaybackVolumeSlider'
import TuneArtwork from '../components/TuneArtwork'
import { getTuneArtworkUrl } from '../nowPlayingArtwork'
import MediaPlaybackSettingsTabs from '../components/MediaPlaybackSettingsTabs'
import MediaSourcePlaybackButtons from '../components/MediaSourcePlaybackButtons'
import { useDocumentTitle } from '../pageTitle'
import './NowPlayingPage.css'

export default function NowPlayingPage(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [, setTick] = useState(0)
  const returnPath = props.returnPath || location.pathname
  const mediaController = props.mediaController
  const nowPlayingQueue = props.nowPlayingQueue
  const queueActive = isQueueActive(nowPlayingQueue)
  const playbackEngaged = isQueuePlaybackEngaged(mediaController, { queue: nowPlayingQueue })
  const activeTuneId = getActivePlaybackTuneId(mediaController, nowPlayingQueue)
  const playingTune = activeTuneId && props.tunes ? props.tunes[activeTuneId] : (mediaController && mediaController.tune)
  const tuneName = playingTune && playingTune.name ? playingTune.name : 'Now playing'
  const composer = playingTune && playingTune.composer ? playingTune.composer : ''
  const positionLabel = queueActive ? getQueuePositionLabel(nowPlayingQueue) : null
  const mediaIsPlaying = !!(mediaController && mediaController.isPlaying)
  const isLoading = !!(mediaController && mediaController.isLoading)
  const artworkUrl = playingTune ? getTuneArtworkUrl(playingTune, props.tunebook) : null
  const [showArtwork, setShowArtwork] = useState(!!artworkUrl)

  useDocumentTitle(tuneName + ' — Now Playing')

  useEffect(function() {
    setShowArtwork(!!artworkUrl)
  }, [artworkUrl, activeTuneId])

  const handleClose = useCallback(function() {
    if (typeof props.onClose === 'function') {
      props.onClose()
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/books')
    }
  }, [navigate, props.onClose])

  useEffect(function() {
    if (!playbackEngaged && !queueActive) return undefined
    const id = setInterval(function() { setTick(function(n) { return n + 1 }) }, 400)
    return function() { clearInterval(id) }
  }, [playbackEngaged, queueActive, mediaController])

  useEffect(function() {
    if (props.blockKeyboardShortcuts) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return function() { window.removeEventListener('keydown', onKeyDown) }
  }, [props.blockKeyboardShortcuts, handleClose])

  const queueContext = {
    tunes: props.tunes,
    nowPlayingQueue: nowPlayingQueue,
    setNowPlayingQueue: props.setNowPlayingQueue,
    setQueuePlayConfirm: props.setQueuePlayConfirm,
    skipQueueConfirm: true,
  }

  function handlePlayPause() {
    if (!mediaController) return
    if (queueActive) {
      if (isLoading) {
        mediaController.pause()
        mediaController.setIsLoading(false)
        mediaController.setIsReady(false)
        return
      }
      if (mediaIsPlaying) {
        mediaController.pause()
        return
      }
      resumePlaylistPlayback(
        mediaController,
        props.tunebook,
        navigate,
        nowPlayingQueue,
        props.tunes,
        props.setNowPlayingQueue
      )
      return
    }
    toggleTunePlayback(
      mediaController,
      props.tunebook,
      navigate,
      { pathname: activeTuneId ? '/tunes/' + activeTuneId : returnPath },
      queueContext
    )
  }

  function stepPlaylist(direction) {
    if (!queueActive || !activeTuneId) return
    if (direction >= 0) {
      props.tunebook.navigateToNextSong(activeTuneId, null, navigate, returnPath, {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    } else {
      props.tunebook.navigateToPreviousSong(activeTuneId, navigate, returnPath, {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    }
  }

  function handleRewindToStart() {
    if (!mediaController || !mediaController.rewindToStart) return
    mediaController.rewindToStart()
  }

  if (!playbackEngaged && !queueActive) {
    return (
      <div className="now-playing-page now-playing-page--empty">
        <h1>Now Playing</h1>
        <p>Nothing is playing right now.</p>
        <Button as={Link} to="/books" variant="primary">Browse tunes</Button>
      </div>
    )
  }

  return (
    <div className="now-playing-page">
      <div className="now-playing-page-header">
        <Button
          variant="link"
          className="now-playing-page-close"
          aria-label="Close now playing"
          title="Close"
          onClick={handleClose}
        >
          {props.tunebook.icons.close}
        </Button>
      </div>

      <div className="now-playing-page-body">
        <div
          className={
            'now-playing-page-main-row'
            + (showArtwork ? ' now-playing-page-main-row--with-artwork' : '')
          }
        >
          <div className="now-playing-page-center">
            <div className="now-playing-page-title-row">
              {mediaController ? (
                <div className="now-playing-page-transport-row">
                  {queueActive ? (
                    <Button variant="outline-primary" className="now-playing-page-step-btn" aria-label="Previous" onClick={function() { stepPlaylist(-1) }}>
                      {props.tunebook.icons.previous}
                    </Button>
                  ) : null}
                  <Button
                    variant={mediaIsPlaying ? 'warning' : 'success'}
                    className="now-playing-page-play-btn"
                    aria-label={mediaIsPlaying ? 'Pause' : 'Play'}
                    onClick={handlePlayPause}
                  >
                    {isLoading ? props.tunebook.icons.waiting : (mediaIsPlaying ? props.tunebook.icons.pause : props.tunebook.icons.play)}
                  </Button>
                  {queueActive ? (
                    <Button variant="outline-primary" className="now-playing-page-step-btn" aria-label="Next" onClick={function() { stepPlaylist(1) }}>
                      {props.tunebook.icons.next}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="now-playing-page-title-line">
                {activeTuneId ? (
                  <Link to={'/tunes/' + activeTuneId} className="now-playing-page-title-link">
                    {tuneName}
                  </Link>
                ) : (
                  <span className="now-playing-page-title-link">{tuneName}</span>
                )}
                {composer ? <span className="now-playing-page-title-composer"> — {composer}</span> : null}
                {positionLabel ? <span className="now-playing-page-title-position"> ({positionLabel})</span> : null}
              </div>

              {mediaController ? (
                <PlaybackVolumeSlider
                  mediaController={mediaController}
                  className="now-playing-page-volume"
                  volumeIcon={props.tunebook.icons.volume}
                />
              ) : null}
            </div>
          </div>

          {showArtwork && playingTune ? (
            <div className="now-playing-page-artwork-col">
              <TuneArtwork
                tune={playingTune}
                tunebook={props.tunebook}
                className="now-playing-page-artwork"
                onHidden={function() { setShowArtwork(false) }}
              />
            </div>
          ) : null}
        </div>

        {mediaController && playingTune ? (
          <>
            <div className="now-playing-page-seek-row">
              <MediaSeekSlider mediaController={mediaController} className="now-playing-page-seek" />
              <Button
                variant="outline-secondary"
                size="sm"
                className="now-playing-page-rewind-btn"
                aria-label="Rewind to start"
                title="Rewind to start"
                data-testid="now-playing-rewind-button"
                onClick={handleRewindToStart}
              >
                {props.tunebook.icons.skipback}
              </Button>
            </div>
            <div className="now-playing-page-media-sources">
              <div className="media-controls-playback-buttons">
                <MediaSourcePlaybackButtons
                  tune={playingTune}
                  tunebook={props.tunebook}
                  mediaController={mediaController}
                  suppressRouteNavigation
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {mediaController && (playingTune || queueActive) ? (
        <div className="now-playing-page-controls-section">
          {playingTune ? (
            <hr className="now-playing-page-tabs-divider" />
          ) : null}
          <MediaPlaybackSettingsTabs
            tune={playingTune}
            tunebook={props.tunebook}
            mediaController={mediaController}
            className="now-playing-page-settings-tabs"
            active
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            tunes={props.tunes}
            onPlaylistCleared={handleClose}
          />
        </div>
      ) : null}
    </div>
  )
}
