import {useState} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'


export default function ShareTunebookModal({tunebook, token,googleDocumentId, tiny}) {
  const [show, setShow] = useState(false);
 
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  const [showPublish, setShowPublish] = useState(false);
  const handleClosePublish = () => setShowPublish(false);
  const handleShowPublish = () => setShowPublish(true);
  
  const docs = useGoogleDocument({token})

  var linkBase = window.location.origin 
  linkBase = 'https://tunebook.syntithenai.com'
  const [link,setLink] = useState(null)
  
  var style={color:'black'}
  if (tiny) {
    style.fontSize = '1.42em'
    style.marginLeft = '0.1em'
  }
  
  return (
    <>{token ? <>
      <Button variant={tiny ? "info" : "success"} size={tiny ? "large" : ""}  style={style} onClick={function() {
              if (window.confirm('The google document that stores your tune book will be made available for anybody to read. Is that OK?')) {
                 docs.addPermission(googleDocumentId, {type:'anyone', role:'reader'})
                 setLink(linkBase+ "/#/importdoc/"+googleDocumentId)
                 handleShow()
              }  
            }}>
        {tunebook.icons.share}{!tiny && <span> Share Tune Book</span>}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Share Your Tune Book</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           
            {link && <>
              {!showPublish && <>
                  <div style={{clear:'both', paddingTop:'1em', overflow:'clip'}}>{link && <a style={{fontSize:'0.7em',overflow:'clip'}} href={link}>{link}</a>}</div>
                  <div style={{clear:'both', paddingTop:'1em'}}><Button variant="info" onClick={function() {tunebook.utils.copyText(link)}} >Copy Link</Button></div>
                <div style={{clear:'both', paddingTop:'1em'}} >
                  <a target="_new" href={"https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(link)+"&quote=My%20Tune%20Book"} ><Button>{tunebook.icons.facebook} Share on Facebook</Button></a>
                  <a target="_new" href={"mailto://fred@here.com"+"?subject=My%20Tune%20Book&body="+encodeURIComponent(link)} ><Button>{tunebook.icons.email} Share by Email</Button></a>
                </div>
                <div style={{clear:'both', paddingTop:'1em'}}>
                  <Button variant="success" onClick={handleShowPublish} >Submit for Curation</Button>
                </div>
              </>}
              {showPublish && <div>
                <div>Thanks for being willing to share. Before you submit your tune book, a few things you should know.</div>
                <br/>
                <ul>
                  <li>You are agreeing to share all the tunes in your tunebook into the public domain so anyone can use them.</li>
                  <li>Once processed by the admin team, your tunes will be available to import as a 'Curated Collection'.</li>
                  <li>The admin team may arbitrarily reject or modify your tune book in the process of publishing it.</li>
                  <li>
                    The admin team may get back to you with quality control suggestions.
                    <br/>A few suggestions ...
                    <ul>
                        <li>Tunes should use repeat signs and first/second endings to ensure that the audio playback is correct.</li>
                        <li>Tunes should include chords.</li>
                      </ul>
                  </li>
                  <li>Finally, Clicking Yes will open a link to send an email to the admin team. <b>You need to send this email :)</b></li>
                  
                </ul>
                
                <a 
                  target="_new" 
                  href={"mailto://syntithenai@gmail.com"+"?subject=Submitting my tunebook for curation&body="+encodeURIComponent(link)}
                >
                  <Button variant="success" >Yes</Button>
                </a>
                
                &nbsp;<Button onClick={handleClosePublish} variant="danger" >No</Button>
              </div>}
            </>}
        </Modal.Body>
      </Modal>
    </> : null}</>
  );
}
