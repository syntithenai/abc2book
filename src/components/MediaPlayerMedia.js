import {Button, Modal} from 'react-bootstrap'
import YouTube from 'react-youtube';
import AbcPlayer from './AbcPlayer'
import {useParams, Link, useLocation, useNavigate} from 'react-router-dom'
import {useState, useEffect} from 'react'

export default function MediaPlayerMedia({mediaController, tunebook, tune}) {
    const params = useParams()
    const location = useLocation()
    //console.log("MediaPlayerMedia")
    const isFirefox = false; //typeof InstallTrigger !== 'undefined';
                    
    
    const [src, setSrc] = useState('')
    
    const [lastPlayState, setLastPlayState] = useState('')
    const [lastTuneId, setLastTuneId] = useState('')
    const [lastMediaLinkNumber, setLastMediaLinkNumber] = useState('')
    
    function handleChange(useMediaLinkNumber) {
        var hasLinks = tune  && Array.isArray(tune.links)  && tune.links.length > 0 ? true : false
        //console.log("MEDIA PLAYER CHANGE",params.playState, useMediaLinkNumber, hasLinks, tunebook.hasNotesOrChords(tune))
        
        if (params.playState === 'playMidi' || useMediaLinkNumber === null) {
            if (tunebook.hasNotesOrChords(tune)) {
                //console.log("OK PLAY MIDI")
                setSrc('')
                mediaController.setMediaLinkNumber(null)
            } else {
                if (hasLinks) {
                    //console.log("ABC FALLBACK TO MEDIA")
                    var useMediaLinkNumber = (params.mediaLinkNumber > 0 && tune  && Array.isArray(tune.links)  && tune.links.length > (params.mediaLinkNumber))? params.mediaLinkNumber : 0
                    mediaController.setMediaLinkNumber(useMediaLinkNumber)
                    setSrc(mediaController.getSrc(tune, useMediaLinkNumber))
                } else {
                    //console.log("NO PLAY OPTION")
                    setSrc(null)
                    mediaController.setMediaLinkNumber(null)
                }
            }
        } else if (hasLinks) {
            var useMediaLinkNumber = (params.mediaLinkNumber > 0 && tune  && Array.isArray(tune.links)  && tune.links.length > (params.mediaLinkNumber))? params.mediaLinkNumber : 0
            //console.log("OK PLAY MEDIA", mediaController.getSrc(tune, useMediaLinkNumber))
            mediaController.setMediaLinkNumber(useMediaLinkNumber)
            setSrc(null)
            // hack to force reload of youtube video when click next/prev ??
            var to = null
            clearTimeout(to)
            to = setTimeout(function() {
                setSrc(mediaController.getSrc(tune, useMediaLinkNumber))
            },300)
        } else {
            if (tunebook.hasNotesOrChords(tune))  {
                //console.log("FALLBACK MIDI")
                setSrc('')
                mediaController.setMediaLinkNumber(null)
            } else {
                //console.log("NO PLAY OPTION")
                setSrc(null)
                mediaController.setMediaLinkNumber(null)
            }
        }
        
    }
    
    useEffect(function() {
        //console.log("MediaPlayerMedia CHANGE")
        //console.log("MEDIA PLAYER CHANGE",(tune ? tune.id : 'NOTUNE'), lastTuneId,'PLAYSTATE', params.playState, lastPlayState, "TAPTOPLAY",tapToPlay,"LINKNUM",params.mediaLinkNumber)
        mediaController.setPlayCancelled(false)
        //if (!mediaController.checkAudioContext()) {
            //setTapToPlay(true)
        //} else {
            var useMediaLinkNumber = (params.mediaLinkNumber > 0 && tune  && Array.isArray(tune.links)  && tune.links.length > (params.mediaLinkNumber))? params.mediaLinkNumber : 0
            if (params.playState === 'playMidi' || !(Array.isArray(tune.links) && tune.links.length > 0)) {
                useMediaLinkNumber = null
            }
            mediaController.setMediaLinkNumber(useMediaLinkNumber)
            // destroy synth if playState changes
            if (tune && JSON.stringify(tune) !== lastTuneId) {
                //console.log("MPLAYER TUNE ID CHANGE",mediaController.playbackRate, tune ? tune.id : null,lastTuneId)
                var useWarp = (mediaController.playbackRate > 0.1 && mediaController.playbackRate <= 2) ? parseFloat(mediaController.playbackRate) : 1
                tune.tempo = tune.tempo * useWarp
                //console.log("SET TUNE TEMPO TO ",tune.tempo, tune)
                mediaController.setTune(tune)
                mediaController.setCurrentTime(0)
                mediaController.setClickSeek(0)
                mediaController.setDuration(0)
                mediaController.cleanupTimers()
                //mediaController.durationRef.current = 0
                //mediaController.setMediaLinkNumber(useMediaLinkNumber)
                handleChange(useMediaLinkNumber)
                if (params.playState === 'playMidi' || params.playState === 'playMedia') {
                    //if (!mediaController.checkAudioContext()) {
                        //if (!isFirefox) {
                            //setTapToPlay(true)
                        //} else {
                            //mediaController.stop()
                        //}
                    //}
                    //mediaController.play()
                    // don't interfere with play status but force synth to update
                    //mediaController.forceMidiChange()
                    //if (mediaController.isPlaying) {
                        //mediaController.stop()
                        //setTimeout(function() {
                          //mediaController.play()  
                        //},300)
                        //
                        //mediaController.forceMidiChange()
                    //}
                     //else {
                        //mediaController.stop()
                    //}
                }
            } else if (useMediaLinkNumber !== lastMediaLinkNumber) {
                //console.log("link num change",useMediaLinkNumber,"old",lastMediaLinkNumber)
                //mediaController.setTune(tune)
                mediaController.setCurrentTime(0)
                mediaController.setClickSeek(0)
                mediaController.setDuration(0)
                //mediaController.durationRef.current = 0
                mediaController.cleanupTimers()
                //mediaController.setMediaLinkNumber(useMediaLinkNumber)
                handleChange(useMediaLinkNumber)
                if (params.playState === 'playMidi' || params.playState === 'playMedia') {
                    //if (!mediaController.checkAudioContext()) {
                        //if (!isFirefox) {
                            //setTapToPlay(true)
                            //mediaController.play()
                        //} else {
                            //mediaController.stop()
                        //}
                    //} else {
                        mediaController.play()
                    //}
                    //mediaController.forceMidiChange()
                    //if (mediaController.isPlaying) {
                        //mediaController.play()
                        //mediaController.forceMidiChange()
                    //} else {
                        //mediaController.stop()
                    //}
                }
            } 
            else if (params.playState !== lastPlayState) {
                //console.log("playstate change",params.playState, lastPlayState)
                //mediaController.setTune(tune)
                //mediaController.setMediaLinkNumber(useMediaLinkNumber)
                //handleChange(useMediaLinkNumber)
                if (params.playState === 'playMidi' || params.playState === 'playMedia') {
                    //if (!mediaController.checkAudioContext()) {
                        //if (!isFirefox) {
                            //setTapToPlay(true)
                            //mediaController.play()
                        //} else {
                            //mediaController.stop()
                        //}
                    //} else {
                        mediaController.play()
                    //}
                    //if (params.playState) {
                        //mediaController.play()
                        //mediaController.forceMidiChange()
                    //} else {
                        //mediaController.stop()
                    //}
                } else {
                    mediaController.stop()
                }
            }
            //console.log("CHANGE DONE",mediaController.mediaLinkNumber, src)
        //}    
        setLastTuneId(tune ? JSON.stringify(tune) : null)
        setLastMediaLinkNumber(useMediaLinkNumber)
        setLastPlayState(params.playState)
    
    },[(tune ? JSON.stringify(tune) : null), mediaController.tapToPlay, params.mediaLinkNumber, params.playState])
    
    useEffect(function() {
        //console.log("MediaPlayerMedia LOAD",params.playState)
        if (params.playState === 'playMidi' || params.playState === 'playMedia') {
            //if (!mediaController.checkAudioContext()) {
                //if (!isFirefox) {
                    //setTapToPlay(true)
                    //mediaController.play()
                //} else {
                    //mediaController.stop()
                //}
            //} else {
            
                mediaController.play()
            //}
        }
    },[])
    
    //// onEnded={mediaController.onEnded} 
    
    function isAbcOk(mediaController) {
        return (mediaController && mediaController.tune && tunebook.hasNotesOrChords(mediaController.tune))
    }
    
    
    var content = null
    const useMediaLinkNumber = params.mediaLinkNumber > 0 ? params.mediaLinkNumber : 0

    if (mediaController.tapToPlay) {
        content = <>
      <Modal   show={true} onHide={function() {mediaController.stop(); mediaController.setTapToPlay(false); mediaController.setPlayCancelled(true); }}>
            <Modal.Header closeButton>
              <Modal.Title>Click to allow autoplay</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Button variant="success"  onClick={function() {mediaController.setTapToPlay(false);}}  >Play</Button>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <Button variant="danger" onClick={function() {mediaController.stop(); mediaController.setPlayCancelled(true); mediaController.setTapToPlay(false)}} >Cancel</Button>
            </Modal.Body>
      </Modal>
      </>
    } else if (mediaController.getSrcType(src) === 'audio') {
        //autoPlay={mediaController.isPlaying}
            
        content =  <audio 
           id="tunebookaudio" 
            onEnded={mediaController.onEnded} 
            onError={mediaController.onError} 
            onTimeUpdate={mediaController.onTimeUpdate} 
            onCanPlayThrough={mediaController.onMediaReady} 
            ref={mediaController.playerRef} 
            src={src} 
            controls={true} 
            playbackspeed={mediaController.playbackSpeed}
            onPlay={function() {mediaController.setIsPlaying(true)}} 
            onPause={function() {mediaController.setIsPlaying(false)}}  
        />
    } else if (mediaController.getSrcType(src) === 'youtube') {
        //autoplay: mediaController.isPlaying,
                
        content =  <YouTube  
            videoId={tunebook.utils.YouTubeGetID(src)} 
            id="tunebookyoutube"
            opts={{
              width: '100%',
              playerVars: {
                loop : 1,
                controls: 1,
                enablejsapi: 1,
                autoplay: mediaController.isPlaying,
                start: (mediaController.tune && Array.isArray(mediaController.tune.links) && mediaController.tune.links[useMediaLinkNumber] && mediaController.tune.links[useMediaLinkNumber].startAt ? parseInt(mediaController.tune.links[useMediaLinkNumber].startAt) : 0),
                end: (mediaController.tune && Array.isArray(mediaController.tune.links) && mediaController.tune.links[useMediaLinkNumber] && mediaController.tune.links[useMediaLinkNumber].endAt ? parseInt(mediaController.tune.links[useMediaLinkNumber].endAt) : 0),
                playbackRate: mediaController.playbackSpeed
              },
            }} 
            onStateChange={mediaController.onYtStateChange}
            onEnd={mediaController.onEnded}
            onError={mediaController.onError}
            onPlay={function() {mediaController.setIsPlaying(true)}} 
            onPause={function() {mediaController.setIsPlaying(false)}} 
            onReady={mediaController.onYtReady}
         />
    }
    return <div id={src} >
        <div style={{display:'none'}}>{src}</div>
        {content}
    </div>
    
}
//<div id={src} >
    //<div style={{display:'nddone'}}>{src}</div>
        //{content}
    //</div>
//if (params.playState == "playMedia") {
            ////console.log("MPLAYER TUNE playMedia")
            //if (!checkAudioContext()) {
                //setTapToPlay(true)
            //} else {
                //// cleanup
                ////if (mediaController.abcSynthRef.current) mediaController.abcSynthRef.current.stop()
                //////mediaController.abcSynthRef = null
                ////console.log(mediaController.playerRef.current)
                ////if (mediaController.playerRef.current) mediaController.playerRef.current.stop()
                ////mediaController.playerRef = null
                //if (tunebook.hasLinks(tune)) {
                    ////console.log("play media")
                    //mediaController.setTune(tune)
                    ////mediaController.setSourceFromTune(tune,useMediaLinkNumber)
                    //mediaController.setMediaLinkNumber(useMediaLinkNumber)
                    //setSrc(mediaController.getSrc(tune, useMediaLinkNumber))
                    //mediaController.setCurrentTime(0)
                    ////console.log("should start play media", !playCancelled)
                    ////if (!playCancelled) mediaController.setIsPlaying(true) 
                    //if (!playCancelled) mediaController.play(useMediaLinkNumber, tune)
                //} else if (tunebook.hasNotesOrChords(tune)) {
                    //// fallback to midi
                    //mediaController.setTune(tune)
                    //mediaController.setMediaLinkNumber(null)
                    //setSrc('')
                    //if (!playCancelled) mediaController.play(null, tune, 'midi')
                //}
            //}
        //} else {
            //if (location && location.pathname &&location.pathname.startsWith("/editor/")) {
                //mediaController.setTune(tune)
                //mediaController.setMediaLinkNumber(null)
                //setSrc('')
                ////if (!playCancelled) mediaController.play(null, tune, 'midi')
            //} else {
                //mediaController.setTune(tune)
                //mediaController.setMediaLinkNumber(useMediaLinkNumber)
                //setSrc(mediaController.getSrc(tune, useMediaLinkNumber))
                //mediaController.setCurrentTime(0)
                //mediaController.setIsPlaying(false)
            //}
        //}
