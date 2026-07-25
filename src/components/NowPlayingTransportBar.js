import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import {
  isQueueActive,
  getCurrentTuneId,
  getQueuePositionLabel,
  getQueueItemLabel,
  isExternalQueueItem,
  isLessonQueue,
} from '../nowPlayingQueue'
import { resumePlaylistPlayback } from '../tunePlaybackActions'
import { playLessonYoutube, pauseLessonYoutube, isLessonYoutubePlaying, subscribeLessonYoutube } from '../lessonYoutubePlayer'
import { isPlaybackInterruptPath } from '../toolPlaybackInterrupt'
import { isQueuePlaybackEngaged } from '../playbackNavigationUtils'
import PlaylistModal from './PlaylistModal'
import './NowPlayingTransportBar.css'

export default function NowPlayingTransportBar({
  nowPlayingQueue,
  setNowPlayingQueue,
  tunebook,
  tunes,
  mediaController,
  gigModeActive,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [showPlaylist, setShowPlaylist] = useState(false)
  const isLessonExternal = isLessonQueue(nowPlayingQueue) && isExternalQueueItem(
    nowPlayingQueue && nowPlayingQueue.items
      ? nowPlayingQueue.items[nowPlayingQueue.currentIndex || 0]
      : null
  )
  const [lessonYoutubePlaying, setLessonYoutubePlaying] = useState(isLessonYoutubePlaying)

  useEffect(function() {
    if (!isLessonExternal) return undefined
    return subscribeLessonYoutube(function(state) {
      setLessonYoutubePlaying(!!(state && state.isPlaying))
    })
  }, [isLessonExternal, nowPlayingQueue && nowPlayingQueue.currentIndex])

  if (gigModeActive || isPlaybackInterruptPath(location.pathname)) {
    return null
  }
  if (!isQueueActive(nowPlayingQueue)) {
    return null
  }

  const queueTuneId = getCurrentTuneId(nowPlayingQueue)
  const currentItem = nowPlayingQueue.items[nowPlayingQueue.currentIndex || 0]
  const isExternal = isExternalQueueItem(currentItem)
  if (!queueTuneId && !isExternal) return null

  const playingTune = tunes && queueTuneId ? tunes[queueTuneId] : null
  const tuneName = isExternal
    ? getQueueItemLabel(currentItem, tunes)
    : (playingTune && playingTune.name ? playingTune.name : 'Playlist')
  const positionLabel = getQueuePositionLabel(nowPlayingQueue)
  const mediaIsPlaying = !!(mediaController && mediaController.isPlaying)
  const transportIsPlaying = isLessonExternal ? lessonYoutubePlaying : mediaIsPlaying
  const isLoading = !!(mediaController && mediaController.isLoading)
  const isEngaged = isQueuePlaybackEngaged(mediaController)
  const showLoading = isLoading && isEngaged
  const stallTitle = mediaController && mediaController.playlistStalled
    ? 'Paused — network timeout'
    : null

  function stepPlaylist(direction) {
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

  function handlePlaylistPlayPause() {
    if (!mediaController && !isLessonQueue(nowPlayingQueue)) return
    if (isLessonQueue(nowPlayingQueue) && isExternal) {
      if (transportIsPlaying) pauseLessonYoutube()
      else playLessonYoutube({ fromUserGesture: true })
      return
    }
    if (!mediaController) return
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
  }

  return (
    <>
      <div className="now-playing-transport-bar" role="toolbar" aria-label="Playlist transport">
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

        <div className="now-playing-transport-center">
          <div className="now-playing-transport-center-group">
            {showLoading ? (
              <Button
                variant="secondary"
                className="now-playing-transport-play-btn"
                title={stallTitle || 'Cancel loading'}
                aria-label={stallTitle || 'Cancel loading'}
                onClick={handlePlaylistPlayPause}
              >
                {tunebook.icons.waiting}
              </Button>
            ) : transportIsPlaying ? (
              <Button
                variant="warning"
                className="now-playing-transport-play-btn"
                data-testid="playlist-pause-button"
                title="Pause playlist"
                aria-label="Pause playlist"
                onClick={handlePlaylistPlayPause}
              >
                {tunebook.icons.pause}
              </Button>
            ) : (
              <Button
                variant="success"
                className="now-playing-transport-play-btn"
                data-testid="playlist-play-button"
                title="Resume playlist"
                aria-label="Resume playlist"
                onClick={handlePlaylistPlayPause}
              >
                {tunebook.icons.play}
              </Button>
            )}
            <Button
              variant="outline-secondary"
              size="sm"
              className="now-playing-transport-list-btn"
              aria-label="Open playlist"
              title="Playlist"
              data-testid="playlist-list-button"
              onClick={function() { setShowPlaylist(true) }}
            >
              {tunebook.icons.menu}
              <span className="now-playing-transport-btn-label">List</span>
            </Button>
            {playingTune && queueTuneId ? (
              <Link
                to={'/tunes/' + queueTuneId}
                className="now-playing-transport-tune-link"
                title={'Go to ' + tuneName}
              >
                <span className="now-playing-transport-tune-name">{tuneName}</span>
                <span className="now-playing-transport-position">({positionLabel})</span>
              </Link>
            ) : (
              <span className="now-playing-transport-tune-link">
                <span className="now-playing-transport-tune-name">{tuneName}</span>
                <span className="now-playing-transport-position">({positionLabel})</span>
              </span>
            )}
          </div>
        </div>

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
      </div>

      <PlaylistModal
        tunebook={tunebook}
        nowPlayingQueue={nowPlayingQueue}
        setNowPlayingQueue={setNowPlayingQueue}
        tunes={tunes}
        isPlaying={transportIsPlaying}
        hideTrigger={true}
        show={showPlaylist}
        onShowChange={setShowPlaylist}
      />
    </>
  )
}
