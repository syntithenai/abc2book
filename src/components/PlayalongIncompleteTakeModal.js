import { Button, Modal } from 'react-bootstrap'

export default function PlayalongIncompleteTakeModal(props) {
  const show = !!props.show
  return (
    <Modal
      show={show}
      onHide={props.onDiscard}
      centered
      backdrop="static"
      data-testid="playalong-incomplete-take-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Incomplete recording</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-0">
          You stopped before the end of the tune. Discard this take, or keep it
          and score what you recorded?
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button
          type="button"
          variant="outline-secondary"
          data-testid="playalong-incomplete-discard"
          onClick={props.onDiscard}
        >
          Discard
        </Button>
        <Button
          type="button"
          variant="primary"
          data-testid="playalong-incomplete-keep"
          onClick={props.onKeep}
        >
          Keep and score
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
