import {useState} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import ListSelectorModal from './ListSelectorModal'
function AddSongModal(props) {
  const [show, setShow] = useState(false);
  const [songTitle, setSongTitle] = useState('')

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const boostUp = () => {}
  const boostDown = () => {}
  
  function getOptions() {
    return {}
  }
  
  function getSearchOptions() {
    return {}
  }
  
  return (
    <>
      <Button variant="secondary" onClick={handleShow}>
        {props.tunebook.icons.fileadd}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Add a song</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           <div>Add song to <ListSelectorModal title={'Select a Book'} value={props.currentTuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={getOptions} searchOptions={getSearchOptions} triggerElement={<Button style={{marginLeft:'1em'}} >Book {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>}  extraButtons={[<Button key="newbook" >New Book</Button>, <Button key="collections" >Collections</Button>]}  />
           </div>
           <br/>
          <input type="text" value={songTitle} onChange={function(e) {setSongTitle(e.target.value) }} />
          <Button variant="primary" onClick={function(e) {
            props.tunebook.saveTune({title:songTitle, book :props.currentTuneBook}); props.setFilter(songTitle) ; handleClose() }} >Add</Button>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default AddSongModal
