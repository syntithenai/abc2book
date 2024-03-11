import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'


export default function SharePublicTuneModal({tunebook, tune}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
 
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  var a=process.env.NODE_ENV === "development" ? 'http://localhost:3000' : 'https://tunebook.net'
  const [link, setLink] = useState('');
  useEffect(function() {
      if (tune && tune.id && tune.srcUrl) {
        var link = a + '/#/importlink/'+encodeURIComponent(tune.srcUrl) + '/tune/'+tune.id+'/play'
        setLink(link)
      }
  },[(tune ? tune.id : null)])
  
  
  return (
    <>{(link ? true : false) && <>
      <Button variant="info" onClick={handleShow}>
        {tunebook.icons.share} Share
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{"Share Tune"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
                 <div style={{clear:'both', paddingTop:'1em', overflow:'clip'}}>{link && <p style={{fontSize:'0.7em'}} >{link}</p>}</div>
                  <div style={{clear:'both', paddingTop:'1em'}}><Button variant="info" onClick={function() {tunebook.utils.copyText(link)}} >Copy Link</Button></div>
                <div style={{clear:'both', paddingTop:'1em'}} >
                  <a target="_new" href={"https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(link)+"&quote=Sharing%20a%20song%20from%20tunebook.net"} ><Button>{tunebook.icons.facebook} Share on Facebook</Button></a>
                  <a target="_new" href={"mailto://fred@here.com"+"?subject=Sharing%20a%20song%20from%20tunebook.net&body="+encodeURIComponent(link)} ><Button>{tunebook.icons.email} Share by Email</Button></a>
                </div>
              
        </Modal.Body>
      </Modal>
    </>}</>
  );
}
