import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'

function SearchSessionModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button  style={{color:'black'}} variant="secondary" onClick={handleShow}>
        S&nbsp;{props.tunebook.icons.search}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Search https://thesession.org</Modal.Title>
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
export default SearchSessionModal
