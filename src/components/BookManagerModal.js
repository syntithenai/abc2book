import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'

function BookManagerModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button style={{color:'black'}} variant="secondary" onClick={handleShow}>...</Button>

      <Modal show={show} onHide={handleClose} >
        <Modal.Header closeButton>
          <Modal.Title>Save</Modal.Title>
        </Modal.Header>
        <Modal.Footer>
          <Button variant="primary" onClick={handleClose}>
           Save
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Copy ABC
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Print
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Double Note Lengths
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default BookManagerModal
