import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import LocalSearchSelectorModal from './LocalSearchSelectorModal'
import TheSessionSearchSelectorModal from './TheSessionSearchSelectorModal'

function SearchModal(props) {
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
          <Modal.Title>Search</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <LocalSearchSelectorModal triggerClick={function(e) {setShow(false);}} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
          <TheSessionSearchSelectorModal triggerClick={function(e) {setShow(false);}} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
        </Modal.Body>
      
      </Modal>
    </>
  );
}
export default SearchModal
