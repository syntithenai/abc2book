import {Button, ButtonGroup} from 'react-bootstrap'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
import PlaylistModal from './PlaylistModal'
import {useNavigate, useLocation} from 'react-router-dom'
import {useEffect, useState, useRef} from 'react'

export default function MediaPlayerButtons({mediaController, tunebook, buttonSize, abcPlaylist,setAbcPlaylist,mediaPlaylist, setMediaPlaylist, currentTuneBook, tagFilter, selected, user}) {
   var useButtonSize=(buttonSize ? buttonSize : 'lg')
   const location = useLocation()
   const navigate = useNavigate()
   const [showButtons, setShowButtons] = useState(false)
   const clickTimeoutRef = useRef(null)

   function resolvePlaybackTarget(t) {
       const hasMusic = tunebook.hasNotesOrChords(t)
       const hasLinks = Array.isArray(t.links) && t.links.length > 0
       if (!hasMusic && !hasLinks) return null

       if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute() && hasMusic) {
           return { type: 'midi' }
       }
       if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute() && hasLinks) {
           const linkNum = mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
               ? mediaController.mediaLinkNumber : 0
           return { type: 'media', linkNum: linkNum }
       }
       if (location.pathname.indexOf('/playMidi') >= 0 && hasMusic) {
           return { type: 'midi' }
       }
       if (location.pathname.indexOf('/playMedia') >= 0 && hasLinks) {
           const parts = location.pathname.split('/playMedia/')
           const parsed = parts.length > 1 ? parseInt(parts[1], 10) : 0
           const linkNum = !isNaN(parsed) ? parsed : 0
           return { type: 'media', linkNum: linkNum }
       }
       if (hasLinks) {
           const linkNum = mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
               ? mediaController.mediaLinkNumber : 0
           return { type: 'media', linkNum: linkNum }
       }
       if (hasMusic) {
           return { type: 'midi' }
       }
       return null
   }

   function startPlayback() {
       const t = mediaController.tune
       if (!t) return
       const target = resolvePlaybackTarget(t)
       if (!target) return

       if (target.type === 'midi') {
           mediaController.setMediaLinkNumber(null)
           const path = '/tunes/' + t.id + '/playMidi'
           if (location.pathname !== path) navigate(path)
       } else {
           mediaController.setMediaLinkNumber(target.linkNum)
           const path = '/tunes/' + t.id + '/playMedia/' + target.linkNum
           if (location.pathname !== path) navigate(path)
       }
       if (mediaController.playFromUserGesture) {
           mediaController.playFromUserGesture()
       } else {
           mediaController.play()
       }
   }
   useEffect(function() {
       //console.log("BUTTON change",mediaController.tune)
           if (mediaController.tune && (tunebook.hasNotesOrChords(mediaController.tune) || (Array.isArray(mediaController.tune.links) && mediaController.tune.links.length > 0))) {
              setShowButtons(true)
              //console.log("BUTTON change true")
           } else {
               //console.log("BUTTON change false")
               setShowButtons(false)
           }
   },[mediaController.tune ? JSON.stringify(mediaController.tune) : null])
   
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
                    <MediaPlayerOptionsModal user={user} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} />
                </>
            </ButtonGroup>
    } else {
        return <ButtonGroup>
            <PlaylistModal isPlaying={mediaController.isPlaying} tunebook={tunebook} buttonSize={buttonSize} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
            <Button size={useButtonSize} variant="success" onClick={function() { tunebook.fillAnyPlaylist(currentTuneBook,selected,tagFilter , navigate)}} >{tunebook.icons.play}</Button>
            <MediaPlayerOptionsModal user={user} variant="success" currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} />
        </ButtonGroup>
    }
}
//{!mediaController.src && <>
            //<Button size={useButtonSize} variant="secondary"  >{tunebook.icons.play}</Button>
        //</>}

 //<Button size={useButtonSize} variant="danger" onClick={function() {mediaController.stop()}} >{tunebook.icons.stopsmall}</Button></ButtonGroup> 
