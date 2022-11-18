import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'


export default function LinksEditorModal({tunebook, tune, setBlockKeyboardShortcuts, icon, autoPlay, setStartPlaying}) {
  const [show, setShow] = useState(false);
 
  const handleClose = () => {
      setShow(false);
      
  }
  const handleShow = () => {
      setShow(true);
  }
  
  //useEffect(function() {
    ////if (setBlockKeyboardShortcuts) 
    //setBlockKeyboardShortcuts(true)
  //}, [])

  return (
    <>
      <Button variant="danger"   onClick={function() {
          handleShow()
        }}>{icon ==="media" ?  tunebook.icons.youtube : tunebook.icons.dropdown}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Audio Links and Files</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <LinksEditor setStartPlaying={setStartPlaying} autoplay={autoPlay}  tunebook={tunebook} tune={tune} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} handleClose={handleClose} />
        </Modal.Body>
      </Modal>
    </>
  );
}
