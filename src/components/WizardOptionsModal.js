import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'

function WizardOptionsModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button  variant="secondary" onClick={handleShow}>
        {props.tunebook.icons.wizard}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Wizards</Modal.Title>
        </Modal.Header>
        <Modal.Footer>
          <Button variant="primary" onClick={handleClose}>
            Auto Fix
          </Button>
          <Button variant="primary" onClick={handleClose}>
            4 Bar Layout
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Halve Note Lengths
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Double Note Lengths
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default WizardOptionsModal
