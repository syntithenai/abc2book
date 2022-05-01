import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'

function SearchLocalModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button  variant="secondary" onClick={handleShow}>
        {props.tunebook.icons.search}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Search the collection</Modal.Title>
        </Modal.Header>
        <Modal.Footer>
         <Button variant="primary" onClick={handleClose}>
            Double Note Lengths
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default SearchLocalModal
