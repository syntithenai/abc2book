import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import {Link} from 'react-router-dom'
function TuneBookOptionsModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);


  
  return (
    <>
      <Button style={{color:'black'}} variant="primary" onClick={handleShow}>...</Button>

      <Modal style={{width:'100%'}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{props.currentTuneBook ? 'Book Tools - '+props.currentTuneBook : 'Tools for All Tunes'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button variant="success" onClick={function(e) { props.tunebook.downloadTuneBookAbc(props.currentTuneBook);  handleClose()}}  >
            Download
          </Button>
          <Button style={{float:'right'}} variant="primary" onClick={function(e) { props.tunebook.copyTuneBookAbc(props.currentTuneBook);  handleClose()}}  >
            Copy ABC
          </Button>
          <hr/>
          <Link to={"/cheatsheet/"+props.currentTuneBook} ><Button  variant="primary" >
            Cheat Sheet
          </Button></Link>
          <Link to={"/print/"+props.currentTuneBook} ><Button  variant="primary" >
            Print
          </Button></Link>
          {props.currentTuneBook ? <Button style={{float:'right'}} variant="danger" onClick={function(e) { if (window.confirm('Do you really want to delete the tune book '+props.currentTuneBook+'?')) {props.tunebook.deleteTuneBook(props.currentTuneBook)}; props.setCurrentTuneBook(''); handleClose()}}>
            Delete book
          </Button> : null}
          {!props.currentTuneBook && <Button style={{float:'right'}} variant="danger" onClick={function(e) { if (window.confirm('Do you really want to delete all your stored tunes?')) {props.tunebook.deleteAll()}; props.setCurrentTuneBook(''); handleClose()}}>
            Delete All
          </Button>}
        </Modal.Body>
      </Modal>
    </>
  );
}
export default TuneBookOptionsModal
