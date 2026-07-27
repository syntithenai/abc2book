import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import NowPlayingQueueManager from '../components/NowPlayingQueueManager'
import PlaylistToolbar from '../components/PlaylistToolbar'
import { useDocumentTitle } from '../pageTitle'
import './NowPlayingPage.css'

export default function NowPlayingPage(props) {
  const navigate = useNavigate()
  const [, setTick] = useState(0)
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

  useDocumentTitle(tuneName + ' — Now Playing')

  const handleClose = useCallback(function() {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/books')
    }
  }, [navigate])

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
    toggleTunePlayback(mediaController, props.tunebook, navigate, { pathname: activeTuneId ? '/tunes/' + activeTuneId : '/now-playing' }, queueContext)
  }

  function stepPlaylist(direction) {
    if (!queueActive || !activeTuneId) return
    if (direction >= 0) {
      props.tunebook.navigateToNextSong(activeTuneId, null, navigate, '/now-playing', {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    } else {
      props.tunebook.navigateToPreviousSong(activeTuneId, navigate, '/now-playing', {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    }
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
        <div className="now-playing-page-main-row">
          <div className="now-playing-page-artwork-col">
            {playingTune ? (
              <TuneArtwork
                tune={playingTune}
                tunebook={props.tunebook}
                className="now-playing-page-artwork"
              />
            ) : null}
          </div>

          <div className="now-playing-page-center">
            <div className="now-playing-page-title-row">
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
                <div className="now-playing-page-transport-row">
                  <PlaybackVolumeSlider
                    mediaController={mediaController}
                    className="now-playing-page-volume"
                    volumeIcon={props.tunebook.icons.volume}
                  />
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
            </div>
          </div>
        </div>

        {mediaController ? (
          <MediaSeekSlider mediaController={mediaController} className="now-playing-page-seek" />
        ) : null}
      </div>

      {queueActive ? (
        <div className="now-playing-page-playlist-section">
          <hr className="now-playing-page-playlist-divider" />
          <div className="now-playing-page-playlist-header">
            <h2>Playlist{nowPlayingQueue.name ? ': ' + nowPlayingQueue.name : ''}</h2>
          </div>
          <PlaylistToolbar
            tunebook={props.tunebook}
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            tunes={props.tunes}
            onCleared={handleClose}
          />
          <NowPlayingQueueManager
            tunebook={props.tunebook}
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            tunes={props.tunes}
            mediaController={mediaController}
          />
        </div>
      ) : null}
    </div>
  )
}
