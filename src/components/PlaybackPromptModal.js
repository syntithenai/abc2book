import { useState, useEffect } from 'react'
import { Button, Modal } from 'react-bootstrap'
import SelectMediaLinkModal from './SelectMediaLinkModal'

const LOAD_FAILURE_PROMPT_TIMEOUT_MS = 10000

export default function PlaybackPromptModal(props) {
  const {
    show,
    reason,
    mediaController,
    tune,
    tunebook,
    src,
    forceRefresh,
    token,
    user,
    googleDocumentId,
    login,
    onLinksSaved,
  } = props

  const [showSelectMedia, setShowSelectMedia] = useState(false)
  const isLoadFailed = reason === 'loadFailed'

  useEffect(function() {
    if (!show || !isLoadFailed || showSelectMedia) return undefined
    const timer = setTimeout(function() {
      const mc = mediaController
      if (!mc) return
      if (mc.dismissLoadFailurePrompt) {
        mc.dismissLoadFailurePrompt()
      } else {
        mc.setTapToPlay(false)
      }
    }, LOAD_FAILURE_PROMPT_TIMEOUT_MS)
    return function() {
      clearTimeout(timer)
    }
  }, [show, isLoadFailed, showSelectMedia])

  if (!show || !mediaController) return null

  function dismissPrompt() {
    mediaController.setTapToPlay(false)
    if (isLoadFailed) {
      mediaController.stop()
      mediaController.setPlayCancelled(true)
      return
    }
    if (mediaController.canResumePlayback && mediaController.canResumePlayback()) {
      return
    }
    mediaController.stop()
    mediaController.setPlayCancelled(true)
  }

  function handlePlayClick() {
    if (mediaController.resumeAudioContextAndPlay) {
      mediaController.resumeAudioContextAndPlay()
    } else {
      mediaController.setTapToPlay(false)
      mediaController.play()
    }
  }

  const currentLinkIndex = mediaController.mediaLinkNumber

  return (
    <>
      <Modal
        show={!showSelectMedia}
        data-testid="tap-to-play-modal"
        onHide={dismissPrompt}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {isLoadFailed ? 'Media could not be loaded' : 'Click to allow autoplay'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isLoadFailed ? (
            <p className="mb-3">
              This media link could not be loaded. The file may be missing, blocked, or in an unsupported format.
              Choose a different link or update the media for this tune. The playlist will continue automatically in a few seconds.
            </p>
          ) : (
            <p className="mb-3">
              Your browser blocked automatic playback. Tap Play to start audio.
            </p>
          )}
          {isLoadFailed ? (
            <>
              <Button
                variant="primary"
                onClick={function() { setShowSelectMedia(true) }}
              >
                Select media
              </Button>
              {' '}
              <Button
                variant="outline-secondary"
                onClick={dismissPrompt}
              >
                Cancel
              </Button>
              {src ? (
                <>
                  {' '}
                  <a href={src} target="_blank" rel="noreferrer">
                    <Button variant="outline-primary">Open link</Button>
                  </a>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Button variant="success" onClick={handlePlayClick}>Play</Button>
              {' '}
              <Button
                variant="danger"
                onClick={function() {
                  mediaController.stop()
                  mediaController.setPlayCancelled(true)
                  mediaController.setTapToPlay(false)
                }}
              >
                Cancel
              </Button>
              {src ? (
                <>
                  {' '}
                  <a href={src} target="_blank" rel="noreferrer">
                    <Button variant="primary">Open link</Button>
                  </a>
                </>
              ) : null}
            </>
          )}
        </Modal.Body>
      </Modal>

      <SelectMediaLinkModal
        show={showSelectMedia}
        onHide={function() { setShowSelectMedia(false) }}
        tune={tune}
        tunebook={tunebook}
        mediaController={mediaController}
        currentLinkIndex={currentLinkIndex}
        forceRefresh={forceRefresh}
        token={token}
        user={user}
        googleDocumentId={googleDocumentId}
        login={login}
        onLinksSaved={onLinksSaved}
      />
    </>
  )
}
