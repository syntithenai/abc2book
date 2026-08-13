import { Modal } from 'react-bootstrap'
import { LyricsChordsHelpBody } from '../lyricsChordsHelpContent'

export default function LyricsChordsHelpModal(props) {
  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Lyrics and chords</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <LyricsChordsHelpBody />
      </Modal.Body>
    </Modal>
  )
}
