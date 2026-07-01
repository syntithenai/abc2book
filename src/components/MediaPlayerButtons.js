import {Button, ButtonGroup} from 'react-bootstrap'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
import PlaylistModal from './PlaylistModal'
import {useNavigate, useLocation} from 'react-router-dom'
import {useEffect, useState, useRef} from 'react'
import { startTunePlayback } from '../tunePlaybackActions'

export default function MediaPlayerButtons({mediaController, tunebook, buttonSize, abcPlaylist,setAbcPlaylist,mediaPlaylist, setMediaPlaylist, currentTuneBook, tagFilter, selected, user}) {
   var useButtonSize=(buttonSize ? buttonSize : 'lg')
   const location = useLocation()
   const navigate = useNavigate()
   const [showButtons, setShowButtons] = useState(false)
   const clickTimeoutRef = useRef(null)

   function startPlayback() {
       startTunePlayback(mediaController, tunebook, navigate, location)
   }
   const mcTuneKey = mediaController.tune ? JSON.stringify(mediaController.tune) : null
   useEffect(function() {
       //console.log("BUTTON change",mediaController.tune)
           if (mediaController.tune && (tunebook.hasNotesOrChords(mediaController.tune) || (Array.isArray(mediaController.tune.links) && mediaController.tune.links.length > 0))) {
              setShowButtons(true)
              //console.log("BUTTON change true")
           } else {
               //console.log("BUTTON change false")
               setShowButtons(false)
           }
   },[mcTuneKey, mediaController.tune, tunebook])
   
   if (mediaController.tune && (location.pathname.indexOf("/blank") === 0 ||location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0)) { 
       return <ButtonGroup>
                <>
                    <PlaylistModal isPlaying={mediaController.isPlaying} tunebook={tunebook} buttonSize={buttonSize} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
                    {(showButtons && mediaController.isLoading) && <Button size={useButtonSize} variant="secondary" onClick={function() {mediaController.pause(); mediaController.setIsLoading(false); mediaController.setIsReady(false)}} >{tunebook.icons.waiting}</Button>}
                    {(showButtons  && !mediaController.isLoading) && <>
                        {(mediaController.isPlaying) 
                            ? <Button size={useButtonSize} variant="warning" data-testid="media-pause-button" onClick={function() {
                                    mediaController.pause()
                            }} >{tunebook.icons.pause}</Button>
                           
                            : <Button size={useButtonSize} variant="success" data-testid="media-play-button"  onClick={function() {
                                    if (clickTimeoutRef.current) {
                                        clearTimeout(clickTimeoutRef.current)
                                        clickTimeoutRef.current = null
                                        if (mediaController.restartPlaybackFromStart) {
                                            mediaController.restartPlaybackFromStart()
                                        }
                                    } else {
                                        startPlayback()
                                        clickTimeoutRef.current = setTimeout(function() {
                                            clickTimeoutRef.current = null
                                        }, 400)
                                    }
                            }} >{tunebook.icons.play}</Button>}
                    </>}
                    <MediaPlayerOptionsModal user={user} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} />
                </>
            </ButtonGroup>
    } else {
        return <ButtonGroup>
            <PlaylistModal isPlaying={mediaController.isPlaying} tunebook={tunebook} buttonSize={buttonSize} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
            <Button size={useButtonSize} variant="success" onClick={function() { tunebook.fillAnyPlaylist(currentTuneBook,selected,tagFilter , navigate)}} >{tunebook.icons.play}</Button>
            <MediaPlayerOptionsModal user={user} variant="success" currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} />
        </ButtonGroup>
    }
}
//{!mediaController.src && <>
            //<Button size={useButtonSize} variant="secondary"  >{tunebook.icons.play}</Button>
        //</>}

 //<Button size={useButtonSize} variant="danger" onClick={function() {mediaController.stop()}} >{tunebook.icons.stopsmall}</Button></ButtonGroup> 
