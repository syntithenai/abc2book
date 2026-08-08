import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import {Link} from 'react-router-dom'
import ShareTunebookModal from './ShareTunebookModal'

function TuneBookOptionsModal(props) {
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const bookName = props.tunebookOption || props.currentTuneBook || ''

  if (!bookName) return null

  return (
    <>
      <Button variant="primary" className={props.btnClassName} onClick={handleShow}>{props.tunebook.icons.arrowdownswhite}</Button>

      <Modal style={{width:'100%', marginTop:'5em'}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{'Book Tools - ' + bookName}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button variant="success"  style={{color:'black'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc(bookName);  handleClose()}}  >
            {props.tunebook.icons.save}  Download
          </Button>
          <span style={{marginLeft:'0.3em',float:'right', paddingBottom:'1em'}} ><ShareTunebookModal tunebook={props.tunebook} token={props.token} login={props.login} googleDocumentId={props.googleDocumentId} shareKind="book" tiny={false} currentTuneBook={bookName} tunes={props.tunes} saveTune={props.tunebook.saveTune} /></span>
           
         <hr style={{width:'100%', clear:'both'}} />
          <Button style={{float:'left', marginBottom:'1em', color:'black'}} variant="primary" onClick={function(e) { props.tunebook.copyTuneBookAbc(bookName);  handleClose()}}  >
           {props.tunebook.icons.filecopyline} Copy ABC
          </Button>
          <Link to={"/cheatsheet/"+encodeURIComponent(bookName)} ><Button  style={{color:'black'}} variant="primary" >
            {props.tunebook.icons.music}  Cheat Sheet
          </Button></Link>
          <Link to={"/print/"+encodeURIComponent(bookName)} ><Button   style={{color:'black'}}  variant="primary" >
            {props.tunebook.icons.printer} Print
          </Button></Link>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default TuneBookOptionsModal
