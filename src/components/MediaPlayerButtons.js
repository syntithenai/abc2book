import {Button, ButtonGroup} from 'react-bootstrap'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
import {useNavigate, useParams, useLocation} from 'react-router-dom'
import {useEffect, useState} from 'react'

export default function MediaPlayerButtons({mediaController, tunebook, buttonSize, abcPlaylist,setAbcPlaylist,mediaPlaylist, setMediaPlaylist, currentTuneBook, tagFilter, selected}) {
   var useButtonSize=(buttonSize ? buttonSize : 'lg')
   const location = useLocation()
    //console.log(tunebook.abcTools.hasChords(tunebook.abcTools.getNotes(mediaController.tune)),tunebook.abcTools.getNotes(mediaController.tune),mediaController.tune)
   const navigate = useNavigate()
   const [showButtons, setShowButtons] = useState(false)
   var clickTimeout = null
   useEffect(function() {
           if (mediaController.tune && (tunebook.hasNotesOrChords(mediaController.tune) || (Array.isArray(mediaController.tune.links) && mediaController.tune.links.length > 0))) {
              setShowButtons(true)
           } else {
               setShowButtons(false)
           }
   },[mediaController.tune])
   if (mediaController.tune && (location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0)) { 
       return <ButtonGroup>
                <>
                    {(showButtons && mediaController.isLoading) && <Button size={useButtonSize} variant="secondary" onClick={function() {mediaController.pause(); mediaController.setIsLoading(false); mediaController.setIsReady(false)}} >{tunebook.icons.waiting}</Button>}
                    {(showButtons  && !mediaController.isLoading) && <>
                        {(mediaController.isPlaying) 
                            ? <Button size={useButtonSize} variant="warning" onClick={function() {mediaController.pause()}} >{tunebook.icons.pause}</Button>
                           
                            : <Button size={useButtonSize} variant="success"  onClick={function() {
                                    if (clickTimeout) {
                                        console.log('CCdouble')
                                        // double click
                                        clearTimeout(clickTimeout)
                                        clickTimeout = null
                                        mediaController.setClickSeek(0); 
                                        mediaController.setCurrentTime(0); 
                                        mediaController.play()
                                    } else {
                                        console.log('CCsingle start')
                                         clickTimeout = setTimeout(function() {
                                            console.log('CCsingle run')
                                            mediaController.play()
                                            clearTimeout(clickTimeout)
                                            clickTimeout = null
                                        },800)
                                    }
                                    //clearTimeout(clickTimeout)
                                    //clickTimeout = null
                                    
                             
                                
                            }} >{tunebook.icons.play}</Button>}
                    </>}
                    <MediaPlayerOptionsModal currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} />
                </>
            </ButtonGroup>
    } else {
        return <ButtonGroup><Button size={useButtonSize} variant="success" onClick={function() { tunebook.fillAnyPlaylist(currentTuneBook,selected,tagFilter , navigate)}} >{tunebook.icons.play}</Button>
        <MediaPlayerOptionsModal variant="success" currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} /></ButtonGroup>
    }
}
//{!mediaController.src && <>
            //<Button size={useButtonSize} variant="secondary"  >{tunebook.icons.play}</Button>
        //</>}

 //<Button size={useButtonSize} variant="danger" onClick={function() {mediaController.stop()}} >{tunebook.icons.stopsmall}</Button></ButtonGroup> 
