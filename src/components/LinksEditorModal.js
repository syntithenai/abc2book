import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'


export default function LinksEditorModal({tunebook, tune, setBlockKeyboardShortcuts, icon, autoPlay, setStartPlaying}) {
  const [show, setShow] = useState(false);
  var [proxyTune,setProxyTune] = useState(tune)
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
  
   useEffect(function(e) {
        //console.log('ensure links',tune.links)
        if (!Array.isArray(tune.links) || tune.links.length < 1) {
            console.log('ensure links')
            tune.links = [{title:'',link:''}]; 
            //tunebook.saveTune(tune); 
            setProxyTune(tune)
        }
  },[tune])

  return (
    <>
      <Button variant="danger"   onClick={function() {
          handleShow()
        }}>{icon ==="media" ?  tunebook.icons.link : tunebook.icons.dropdown}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Links</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <LinksEditor setStartPlaying={setStartPlaying} autoplay={autoPlay}  tunebook={tunebook} tune={proxyTune} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} handleClose={handleClose} />
        
         
        </Modal.Body>
        
      </Modal>
    </>
  );
}
