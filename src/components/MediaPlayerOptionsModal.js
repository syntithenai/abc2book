import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import {useNavigate, Link, useLocation} from 'react-router-dom'
import MediaSeekSlider from '../components/MediaSeekSlider'
import AbcPlaylistManager from './AbcPlaylistManager'
import PlaybackSpeedSelector from './PlaybackSpeedSelector'

import PlaylistManager from './PlaylistManager'
 
export default function MediaPlayerOptionsModal({mediaController, tunebook, buttonSize, abcPlaylist,setAbcPlaylist,mediaPlaylist, setMediaPlaylist, variant, currentTuneBook, tagFilter, selected}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [show, setShow] = useState(false);
  var useButtonSize=(buttonSize ? buttonSize : 'lg')
  const handleClose = (e) => {
    setShow(false);
  }
  const handleShow = (e) => {
    setShow(true);
  }
  
 
  const [hasMusic, setHasMusic] = useState(false)
  const [hasLinks, setHasLinks] = useState(false)
   
   useEffect(function() {
       //console.log(location.pathname, location.pathname.indexOf("/tunes/"))
       //console.log(tunebook.abcTools.hasChords(tunebook.abcTools.getNotes(mediaController.tune)), tunebook.abcTools.getNotes(mediaController.tune))
       if ((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && tunebook.hasNotesOrChords(mediaController.tune)) {
          setHasMusic(true)
       } else {
           setHasMusic(false)
       }
       if ((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && mediaController.tune && tunebook.hasLinks(mediaController.tune)) {
          setHasLinks(true)
       } else {
          setHasLinks(false)
       } 
   },[mediaController.tune])
  
  return (
    <>
      <Button size={useButtonSize}  onClick={handleShow} variant={(variant ? variant : (mediaController.isLoading ? "secondary" : (mediaController.isPlaying ? "warning" : "success")))}  >{tunebook.icons.dropdown}</Button>

      <Modal  onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Media Controls</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{height:'40em'}}>
         
          {((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && mediaController.tune) && <div style={{borderBottom:'1px solid black'}}>
              
              
              <span >{hasLinks ? mediaController.tune.links.map(function(link,linkKey) {
                  return <Link key={linkKey}  to={"/tunes/"+mediaController.tune.id+"/playMedia/"+linkKey}><Button style={{marginLeft:'0.1em'}}  variant="danger" onClick={function() {
                     //mediaController.playLink(linkKey)
                     //mediaController.cleanup()
                     if (mediaController.getSrcType(mediaController.getSrc(mediaController.tune, mediaController.mediaLinkNumber)) === 'youtube' || mediaController.getSrcType(mediaController.getSrc(mediaController.tune, mediaController.mediaLinkNumber)) === 'audio')  {
                         //mediaController.stop()
                         mediaController.play(linkKey,mediaController.tune)
                     }
                     handleClose()
                  }} >{tunebook.icons.link} {tunebook.icons.play} {linkKey + 1}</Button></Link>
               }) : ''}</span>
               { hasMusic && <Link to={"/tunes/"+mediaController.tune.id+"/playMidi"}><Button style={{marginLeft:'0.1em'}}  variant="success" onClick={function() {
                  //mediaController.cleanupTimin()
                 //mediaController.playMidi()
                 //console.log("MMMMMMMMM",mediaController.getSrcType(mediaController.getSrc(mediaController.tune, mediaController.mediaLinkNumber)))
                 if (mediaController.getSrcType(mediaController.getSrc(mediaController.tune, mediaController.mediaLinkNumber)) === 'abc')  {
                     //mediaController.stop()
                     mediaController.play(null,mediaController.tune,'midi')
                 }
                 ;handleClose()
              }} >{tunebook.icons.music} {tunebook.icons.play}</Button></Link>}
              
            </div>}
            <div style={{borderBottom:'1px solid black', paddingTop:'0.5em', marginTop:'0.5em'}}>
                <PlaybackSpeedSelector onChange={function(val) {mediaController.setPlaybackSpeed(val)}} value={mediaController.playbackSpeed} mediaController={mediaController}/>
            </div>
            <div style={{borderBottom:'1px solid black', paddingTop:'0.5em', marginTop:'0.5em'}}>
                <AbcPlaylistManager handleClose={handleClose}  tunebook={tunebook} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} />
                <PlaylistManager handleClose={handleClose} tunebook={tunebook} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
            </div>
           
        </Modal.Body>
      </Modal>
    </>
  );
}
 
            //{(mediaController.tune) &&  <><Button onClick={function() {tunebook.fillMediaPlaylist(currentTuneBook,selected,tagFilter ); handleClose()}} variant={"success"}  >{tunebook.icons.play}  Links</Button>  &nbsp;&nbsp;    
            //<Button onClick={function() {tunebook.fillAbcPlaylist(currentTuneBook,selected,tagFilter , navigate); handleClose()}} variant={"success"}  >{tunebook.icons.play} Midi</Button></>}
// <MediaSeekSlider  mediaController={mediaController} />

//<Button style={{marginLeft:'2em'}}  variant="danger" onClick={function() {
                //handleClose()

             //}} >Cancel</Button>
