import {useState, useEffect} from 'react'
import {Button, Modal} from 'react-bootstrap'
import {Link} from 'react-router-dom'
import ShareTunebookModal from './ShareTunebookModal'
import {useNavigate} from 'react-router-dom'
import useYouTubePlaylist from '../useYouTubePlaylist'

function TuneBookOptionsModal(props) {
  const [show, setShow] = useState(false);
  const [user, setUser] = useState(null);
  const {insertOrUpdatePlaylist} = useYouTubePlaylist()
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const navigate = useNavigate()

  function YouTubeGetID(url){
        url = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
        return undefined !== url[2]?url[2].split(/[^0-9a-z_\-]/i)[0]:url[0];
  }
  
  function exportYouTubePlaylist() {
     if (props.currentTuneBook)   {
        var tunes = props.tunebook.fromBook(props.currentTuneBook)
        if (Array.isArray(tunes)) {
            var ids = []
            tunes.forEach(function(tune) {
                if (Array.isArray(tune.links)) {
                    tune.links.forEach(function(link) {
                      if (link.link) {
                          //console.log('extract id from ', link.link)
                          var newId = YouTubeGetID(link.link)
                          if (newId && typeof link.link === 'string') {
                            ids.push({id: newId, start: (link.startAt > 0 ? link.startAt : 0), end: (link.endAt > 0 ? link.endAt : 0), note:'Tune Book'})
                          }
                      }  
                    })
                }
            })
            //console.log(ids)
        }
        insertOrUpdatePlaylist(props.currentTuneBook, ids.slice(0,4), ((props.token && props.token.access_token) ? props.token.access_token : null))
        handleClose()
     }
  }
  

  
  return (
    <>
      <Button style={{color:'black'}} variant="primary" onClick={handleShow}>{props.tunebook.icons.arrowdownswhite}</Button>

      <Modal style={{width:'100%'}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{props.currentTuneBook ? 'Book Tools - '+props.currentTuneBook : 'Tools for All Tunes'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button variant="success"  style={{color:'black'}} onClick={function(e) { props.tunebook.downloadTuneBookAbc(props.currentTuneBook);  handleClose()}}  >
            {props.tunebook.icons.save}  Download
          </Button>
          <Button style={{marginLeft:'0.1em'}} onClick={function() {props.tunebook.fillMediaPlaylist(props.tunebookOption); navigate("/tunes")}} variant={"danger"} size="small" >{props.tunebook.icons.play} Play Media</Button>
          
          <Button style={{marginLeft:'0.1em'}}  onClick={function() {props.tunebook.fillAbcPlaylist(props.tunebookOption,'',navigate); navigate("/tunes")}} variant={"success"} size="small" >{props.tunebook.icons.play} Play Midi</Button>
         
          
          {(props.currentTuneBook && props.token) && <hr style={{width:'100%', clear:'both'}} />}
           {<span style={{marginLeft:'0.3em',float:'right', paddingBottom:'1em'}} ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={false} currentTuneBook={props.currentTuneBook}  /></span>}
           
           
           {(props.user && props.user.email &&  props.user.email === 'syntithenai@gmail.com' && props.currentTuneBook && props.token) && <Button style={{color:'black'}} variant="info" onClick={exportYouTubePlaylist} >{props.tunebook.icons.add} Export YouTube Playlist</Button>}
           
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
