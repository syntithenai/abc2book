import { useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import { useLocation, useParams } from 'react-router-dom'
import { getViewedTuneIdFromPath, isMiniPlayerTransportVisible } from '../playbackNavigationUtils'
import MediaSourcePlaybackButtons from './MediaSourcePlaybackButtons'
import RemoteOutputButton from './RemoteOutputButton'
import './MediaPlayerOptionsModal.css'

function resolveTuneRecord(tunes, tune) {
  if (!tune || !tune.id) return null
  if (tunes && tunes[tune.id]) return tunes[tune.id]
  return tune
}

function resolveControlsHeaderTune(mediaController, tunes, viewedTune) {
  if (mediaController.isPlaying || mediaController.isLoading) {
    return resolveTuneRecord(tunes, mediaController.tune) || viewedTune
  }
  if (viewedTune) return viewedTune
  return resolveTuneRecord(tunes, mediaController.tune)
}

export default function MediaPlayerOptionsModal({
  mediaController,
  tunebook,
  buttonSize,
  variant,
  tunes,
  nowPlayingQueue,
  contextTune,
  suppressRouteNavigation,
  dialogZIndex,
  gigModeActive = false,
  onOpenNowPlaying,
}) {
  const location = useLocation()
  const params = useParams()
  const viewedTuneId = getViewedTuneIdFromPath(location.pathname)
    || (params.tuneId ? params.tuneId : null)
  const viewedTune = (function() {
    if (contextTune) {
      if (contextTune.id && tunes && tunes[contextTune.id]) {
        return tunes[contextTune.id]
      }
      return contextTune
    }
    if (viewedTuneId && tunes && tunes[viewedTuneId]) {
      return tunes[viewedTuneId]
    }
    return mediaController.tune
  })()
  const inPracticeContext = !!contextTune
  const showTunePlaybackControls = inPracticeContext
    || location.pathname.indexOf('/tunes/') === 0
    || location.pathname.indexOf('/editor/') === 0
  const sourceTune = viewedTune || resolveTuneRecord(tunes, mediaController.tune)
  const controlsHeaderTune = resolveControlsHeaderTune(mediaController, tunes, viewedTune)
  const controlsHeaderTuneLabel = controlsHeaderTune
    && controlsHeaderTune.name
    && controlsHeaderTune.name.trim().length > 0
    ? controlsHeaderTune.name.trim()
    : (controlsHeaderTune ? 'Untitled Song' : '')
  const showNowPlayingHeader = !!(mediaController.isPlaying || mediaController.isLoading)
  const [show, setShow] = useState(false)
  const useButtonSize = (buttonSize ? buttonSize : 'lg')
  const miniPlayerActive = isMiniPlayerTransportVisible(
    location.pathname,
    nowPlayingQueue,
    gigModeActive,
    mediaController
  )

  const handleClose = function() {
    setShow(false)
  }

  function handleShow() {
    if (miniPlayerActive) {
      if (typeof onOpenNowPlaying === 'function') onOpenNowPlaying()
      return
    }
    setShow(true)
  }

  return (
    <>
      <Button
        size={useButtonSize}
        onClick={handleShow}
        variant={(variant ? variant : (mediaController.isLoading ? 'secondary' : (mediaController.isPlaying ? 'warning' : 'success')))}
        aria-label={miniPlayerActive ? 'Open now playing' : 'Choose media source'}
        title={miniPlayerActive ? 'Open now playing' : 'Choose media source'}
      >
        {tunebook.icons.dropdown}
      </Button>

      <Modal
        onClick={function(e) { e.stopPropagation() }}
        show={show}
        onHide={handleClose}
        size="lg"
        style={dialogZIndex ? { zIndex: dialogZIndex } : undefined}
        backdropClassName={dialogZIndex ? 'media-controls-modal-backdrop-elevated' : undefined}
      >
        <Modal.Header closeButton className="media-controls-modal-header">
          <Modal.Title className="media-controls-modal-title-row">
            <span className="media-controls-modal-title-text">Choose media source</span>
            {controlsHeaderTuneLabel ? (
              <span
                className="media-controls-now-playing"
                title={(showNowPlayingHeader ? 'Now Playing: ' : '') + controlsHeaderTuneLabel}
              >
                {showNowPlayingHeader ? 'Now Playing: ' : ''}{controlsHeaderTuneLabel}
              </span>
            ) : null}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {(showTunePlaybackControls && sourceTune) ? (
            <>
              <div className="media-controls-transport-actions d-flex align-items-center gap-2 mb-3">
                <RemoteOutputButton
                  mediaController={mediaController}
                  tunebook={tunebook}
                  compact
                  nowPlayingQueue={nowPlayingQueue}
                  tunes={tunes}
                />
              </div>
              <div className="media-controls-playback-buttons">
                <MediaSourcePlaybackButtons
                  tune={sourceTune}
                  tunebook={tunebook}
                  mediaController={mediaController}
                  suppressRouteNavigation={suppressRouteNavigation}
                />
              </div>
            </>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  )
}
