import {useState} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'


export default function ShareAudioModal({tunebook, token, recording, recordingsManager}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
 
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  const docs = useGoogleDocument(token)

  var linkBase = window.location.origin 
  linkBase = 'https://tunebook.syntithenai.com'
  const [link,setLink] = useState(null)
  //console.log(recording,token)
  if (!recording || !token) return null 

  var shared = localStorage.getItem('bookstorage_audio_public_'+recording.id) === "true" ? true : false
  var saved = recording && recording.googleId ? true : false
  var variant="secondary"
  if (saved && shared) {
    variant="success" 
  } else if (saved) {
    variant="info" 
  }
  return (
    <>
      <Button variant={variant}   onClick={function() {
              
              function finishConfirm() {
                   docs.addPermission(recording.googleId, {type:'anyone', role:'reader'})
                   var theLink = linkBase+ "/#/importaudio/"+recording.googleId
                   setLink(theLink)
                   handleShow()
              }
              
              function doConfirm() {
                if (recording && recording.googleId) {
                  //console.log('save easy')
                  finishConfirm()
                } else {
                  //console.log('save before share')
                  recordingsManager.saveRecording(recording).then(function(googleRecording) {
                    if (googleRecording && googleRecording.googleId) {
                       finishConfirm()
                    }
                  })
                
                } 
              }
              
              if (localStorage.getItem('bookstorage_audio_public_'+recording.id)) {
                doConfirm()
              } else {
                if (window.confirm('The google document that stores this audio file will be made available for anybody to read. Is that OK?')) {
                  localStorage.setItem('bookstorage_audio_public_'+recording.id,'true')
                  doConfirm()
                }
              }  
            }}>
        {tunebook.icons.share}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Share Audio</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            {link && <>
              
                  <div style={{clear:'both', paddingTop:'1em', overflow:'clip'}}>{link && <a style={{fontSize:'0.7em',overflow:'clip'}} href={link}>{link}</a>}</div>
                  <div style={{clear:'both', paddingTop:'1em'}}><Button variant="info" onClick={function() {tunebook.utils.copyText(link)}} >Copy Link</Button></div>
                <div style={{clear:'both', paddingTop:'1em'}} >
                  <a target="_new" href={"https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(link)+"&quote=My%20Tune%20Book"} ><Button>{tunebook.icons.facebook} Share on Facebook</Button></a>
                  <a target="_new" href={"mailto://fred@here.com"+"?subject=My%20Tune%20Book&body="+encodeURIComponent(link)} ><Button>{tunebook.icons.email} Share by Email</Button></a>
                </div>
                
            </>}
        </Modal.Body>
      </Modal>
    </>
  );
}
