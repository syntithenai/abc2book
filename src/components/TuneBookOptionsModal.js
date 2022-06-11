import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import {Link} from 'react-router-dom'
import ShareTunebookModal from './ShareTunebookModal'

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
          <Button variant="success"  style={{color:'black'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc(props.currentTuneBook);  handleClose()}}  >
            {props.tunebook.icons.save}  Download
          </Button>
           {<span style={{marginLeft:'0.3em',float:'right'}} ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={false} currentTuneBook={props.currentTuneBook}  /></span>}
         <hr style={{width:'100%', clear:'both'}} />
          <Button style={{float:'left', marginBottom:'1em', color:'black'}} variant="primary" onClick={function(e) { props.tunebook.copyTuneBookAbc(props.currentTuneBook);  handleClose()}}  >
           {props.tunebook.icons.filecopyline} Copy ABC
          </Button>
          {props.currentTuneBook ? <Link to={"/cheatsheet/"+props.currentTuneBook} ><Button  style={{color:'black'}} variant="primary" >
            {props.tunebook.icons.music}  Cheat Sheet
          </Button></Link> : null}
          {props.currentTuneBook ? <Link to={"/print/"+props.currentTuneBook} ><Button   style={{color:'black'}}  variant="primary" >
            {props.tunebook.icons.printer} Print
          </Button></Link> : null}
          <hr style={{width:'100%', clear:'both'}} />
        
          {props.currentTuneBook ? <Button style={{float:'left', color:'black'}} variant="danger" onClick={function(e) { if (window.confirm('Do you really want to delete the tune book '+props.currentTuneBook+'?')) {props.tunebook.deleteTuneBook(props.currentTuneBook)}; props.setCurrentTuneBook(''); handleClose()}}>
            
            {props.tunebook.icons.deletebin} Delete book
          </Button> : null}
          {!props.currentTuneBook && <Button style={{float:'left', color:'black'}} variant="danger" onClick={function(e) { if (window.confirm('Do you really want to delete all your stored tunes?')) {props.tunebook.deleteAll()}; props.setCurrentTuneBook(''); handleClose()}}>
            {props.tunebook.icons.deletebin}  Delete All
          </Button>}
        </Modal.Body>
      </Modal>
    </>
  );
}
export default TuneBookOptionsModal
