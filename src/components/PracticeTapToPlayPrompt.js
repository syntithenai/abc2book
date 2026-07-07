import { Button, Modal } from 'react-bootstrap'

export default function PracticeTapToPlayPrompt(props) {
  const mediaController = props.mediaController
  const stepType = props.stepType
  if (stepType !== 'tune') return null
  if (!mediaController) return null
  if (!mediaController.tapToPlay) return null

  const title = 'Allow playback'
  const message = 'Your browser requires a tap before audio can play.'
  const buttonLabel = 'Play audio'
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : null
  const buttonIcon = icons ? (icons.playwhite || icons.play) : null

  function handlePlayClick() {
    if (props.armPlaybackGesture) props.armPlaybackGesture()
    if (mediaController.playFromUserGesture) {
      mediaController.playFromUserGesture({ fresh: true })
    } else if (mediaController.resumeAudioContextAndPlay) {
      mediaController.resumeAudioContextAndPlay()
    } else {
      mediaController.setTapToPlay(false)
      mediaController.play({ fresh: true })
    }
  }

  return (
    <Modal
      show={true}
      backdrop="static"
      keyboard={false}
      centered
      className="practice-tap-to-play-modal"
      style={{ zIndex: 1300 }}
    >
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="practice-tap-to-play-modal-body">
        <p className="practice-tap-to-play-modal-text">{message}</p>
        <Button
          variant="success"
          size="lg"
          className="practice-tap-to-play-modal-btn"
          onClick={handlePlayClick}
        >
          {buttonIcon ? (
            <span className="practice-tap-to-play-modal-btn-icon" aria-hidden="true">{buttonIcon}</span>
          ) : null}
          <span>{buttonLabel}</span>
        </Button>
      </Modal.Body>
    </Modal>
  )
}
