import {useState} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
function AddSongModal(props) {
  const [show, setShow] = useState(props.show ==="addTune");
  const [songTitle, setSongTitle] = useState('')
  const [songWords, setSongWords] = useState('')
  const [songNotes, setSongNotes] = useState('')
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const boostUp = () => {}
  const boostDown = () => {}
  
  function addTune() {
    var cleanNotes = songNotes.split("\n").filter(function(line) {
        if (props.tunebook.abcTools.isNoteLine(line)) {
          return true
        } else {
          return false
        }
    })
    props.tunebook.saveTune({name:songTitle, books :(props.currentTuneBook ? [props.currentTuneBook] : []), notes: cleanNotes, words: songWords.trim().split("\n")}); 
    props.setFilter(songTitle) ; 
    setSongTitle('')
    setSongWords('')
    setSongNotes('')
    //props.updateList(songTitle,props.currentTuneBook)
    handleClose() 
  }

  return (
    <>
      <Button variant="success" onClick={handleShow}>
        {props.tunebook.icons.fileadd}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Add a tune</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           <div>Add tune to <BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={props.currentTuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'1em'}} >Book {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>}   />
           </div>
           <br/>
          <input type="text" value={songTitle} onChange={function(e) {setSongTitle(e.target.value) }} />
          <span style={{marginLeft:'0.3em'}} >{(songTitle.length > 0) &&<Button variant="success" onClick={addTune} >Add</Button>}
          {(songTitle.length === 0) &&<Button variant="secondary" >Add</Button>}
          </span>
          <label>Lyrics<textarea  value={songWords} onChange={function(e) {setSongWords(e.target.value) }} rows='8' style={{width:'100%'}}/></label>
          <label>ABC Notes<textarea  value={songNotes} onChange={function(e) {setSongNotes(e.target.value) }} rows='8' style={{width:'100%'}}/></label>
          
        </Modal.Body>
      </Modal>
    </>
  );
}
export default AddSongModal
