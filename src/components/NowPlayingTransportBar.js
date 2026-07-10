import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import {
  isQueueActive,
  getCurrentTuneId,
  getQueuePositionLabel,
} from '../nowPlayingQueue'
import { resumePlaylistPlayback } from '../tunePlaybackActions'
import { isPlaybackInterruptPath } from '../toolPlaybackInterrupt'
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

  if (gigModeActive || isPlaybackInterruptPath(location.pathname)) {
    return null
  }
  if (!isQueueActive(nowPlayingQueue)) {
    return null
  }

  const queueTuneId = getCurrentTuneId(nowPlayingQueue)
  if (!queueTuneId) return null

  const playingTune = tunes && tunes[queueTuneId] ? tunes[queueTuneId] : null
  const tuneName = playingTune && playingTune.name ? playingTune.name : 'Playlist'
  const positionLabel = getQueuePositionLabel(nowPlayingQueue)
  const isPlaying = !!(mediaController && mediaController.isPlaying)
  const isLoading = !!(mediaController && mediaController.isLoading)

  function stepPlaylist(direction) {
    if (direction >= 0) {
      tunebook.navigateToNextSong(queueTuneId, null, navigate, location.pathname, {
        mediaController: mediaController,
      })
    } else {
      tunebook.navigateToPreviousSong(queueTuneId, navigate, location.pathname, {
        mediaController: mediaController,
      })
    }
  }

  function handlePlaylistPlayPause() {
    if (!mediaController) return
    if (isLoading) {
      mediaController.pause()
      mediaController.setIsLoading(false)
      mediaController.setIsReady(false)
      return
    }
    if (isPlaying) {
      mediaController.pause()
      return
    }
    resumePlaylistPlayback(mediaController, tunebook, navigate, nowPlayingQueue, tunes)
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
            {isLoading ? (
              <Button
                variant="secondary"
                className="now-playing-transport-play-btn"
                title="Cancel loading"
                aria-label="Cancel loading"
                onClick={handlePlaylistPlayPause}
              >
                {tunebook.icons.waiting}
              </Button>
            ) : isPlaying ? (
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
              <span className="now-playing-transport-tune-name">{nowPlayingQueue.name || 'Playlist'}</span>
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
        isPlaying={isPlaying}
        hideTrigger={true}
        show={showPlaylist}
        onShowChange={setShowPlaylist}
      />
    </>
  )
}
