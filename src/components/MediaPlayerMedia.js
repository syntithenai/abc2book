import {Button, Modal} from 'react-bootstrap'
import YouTube from 'react-youtube';
import AbcPlayer from './AbcPlayer'
import {useParams, Link, useLocation, useNavigate} from 'react-router-dom'
import {useState, useEffect, useMemo, useRef} from 'react'

export default function MediaPlayerMedia({mediaController, tunebook, tune}) {
    const params = useParams()
    const location = useLocation()
    //console.log("MediaPlayerMedia")
    const isFirefox = false; //typeof InstallTrigger !== 'undefined';
                    
    
    const [src, setSrc] = useState('')
    
    const [lastPlayState, setLastPlayState] = useState('')
    const [lastTuneId, setLastTuneId] = useState('')
    const [lastMediaLinkNumber, setLastMediaLinkNumber] = useState('')
    const lastPreparedSrcRef = useRef(null)
    
    useEffect(function() {
        if (!src) {
            lastPreparedSrcRef.current = null
            if (mediaController.destroyExternalMedia) {
                mediaController.destroyExternalMedia()
            }
            return
        }
        const srcType = mediaController.getSrcType(src)
        if (srcType !== 'audio' && srcType !== 'youtube') {
            lastPreparedSrcRef.current = null
            if (mediaController.destroyExternalMedia) {
                mediaController.destroyExternalMedia()
            }
            return
        }
        if (src !== lastPreparedSrcRef.current) {
            lastPreparedSrcRef.current = src
            if (mediaController.notifyYoutubeSrcChanged) {
                mediaController.notifyYoutubeSrcChanged()
            }
            if (mediaController.destroyExternalMedia) {
                mediaController.destroyExternalMedia()
            }
        }
        const needsExternal = mediaController.usesExternalPitchTempo && mediaController.usesExternalPitchTempo()
        if (!needsExternal) {
            if (mediaController.destroyExternalMedia) {
                mediaController.destroyExternalMedia()
            }
            return
        }
        if (mediaController.prepareExternalMedia) {
            mediaController.prepareExternalMedia(src, undefined, { autoPlay: false, showLoading: false })
        }
    }, [
        src,
        mediaController,
        mediaController.mediaResolverAvailable,
    ])
    
    const tuneId = tune ? tune.id : null
    useEffect(function() {
        if (!tune || !mediaController.applyPlaybackRoute) return

        const isFirstTuneLoad = !lastTuneId
        const route = mediaController.applyPlaybackRoute(
            params.playState,
            params.mediaLinkNumber,
            tune,
            tunebook
        )
        setSrc(route.src === null ? null : route.src)

        let changeType = null
        if (tune.id !== lastTuneId) {
            changeType = 'tune'
            mediaController.setTune(tune)
            mediaController.setCurrentTime(0)
            mediaController.setClickSeek(0)
            mediaController.setDuration(0)
            mediaController.cleanupTimers()
            if (mediaController.hasActivePlaybackIntent && !mediaController.hasActivePlaybackIntent()) {
                mediaController.setIsLoading(false)
            }
        } else if (route.mediaLinkNumber !== lastMediaLinkNumber) {
            changeType = 'link'
            mediaController.setCurrentTime(0)
            mediaController.setClickSeek(0)
            mediaController.setDuration(0)
            mediaController.cleanupTimers()
        } else if (params.playState !== lastPlayState) {
            changeType = 'playState'
        }

        if (changeType === 'playState' && params.playState !== 'playMidi' && params.playState !== 'playMedia') {
            mediaController.stop()
        } else if (changeType && mediaController.maybeAutostart) {
            mediaController.maybeAutostart(params.playState, changeType, isFirstTuneLoad)
        }

        setLastTuneId(tune ? tune.id : null)
        setLastMediaLinkNumber(route.mediaLinkNumber)
        setLastPlayState(params.playState)
    
    },[tuneId, params.mediaLinkNumber, params.playState, tune, tunebook, mediaController, lastTuneId, lastMediaLinkNumber, lastPlayState])
    
    function renderTapToPlayModal() {
        if (!mediaController.tapToPlay) return null
        return (
      <Modal show={true} data-testid="tap-to-play-modal" onHide={function() {
                mediaController.setTapToPlay(false)
                if (mediaController.canResumePlayback && mediaController.canResumePlayback()) {
                    return
                }
                mediaController.stop()
                mediaController.setPlayCancelled(true)
            }}>
            <Modal.Header closeButton>
              <Modal.Title>Click to allow autoplay</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Button variant="success" onClick={function() {
                    if (mediaController.resumeAudioContextAndPlay) {
                        mediaController.resumeAudioContextAndPlay()
                    } else {
                        mediaController.setTapToPlay(false)
                        mediaController.play()
                    }
                }}>Play</Button>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <Button variant="danger" onClick={function() {mediaController.stop(); mediaController.setPlayCancelled(true); mediaController.setTapToPlay(false)}} >Cancel</Button>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                {src && <a href={src} target="_new" rel="noreferrer"><Button variant="primary">Open Link</Button></a>}
            </Modal.Body>
      </Modal>
        )
    }

    function handleNativePlay() {
        if (!mediaController.shouldIgnoreNativePlaybackEvents()) {
            if (mediaController.confirmPlayingStarted) {
                mediaController.confirmPlayingStarted()
            } else {
                mediaController.setTapToPlay(false)
                mediaController.setIsPlaying(true)
            }
        }
    }

    function handleNativePause() {
        if (mediaController.shouldSuppressSpuriousPause && mediaController.shouldSuppressSpuriousPause()) {
            return
        }
        if (!mediaController.shouldIgnoreNativePlaybackEvents()) {
            if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
                return
            }
            mediaController.setIsPlaying(false)
        }
    }

    const youtubeOpts = useMemo(function() {
        const playerVars = {
            loop: 0,
            controls: 1,
            enablejsapi: 1,
        }
        return {
            width: '100%',
            playerVars: playerVars,
        }
    }, [])

    var content = null

    if (mediaController.getSrcType(src) === 'audio') {
        content =  <audio 
           id="tunebookaudio" 
            onEnded={mediaController.onEnded} 
            onError={mediaController.onError} 
            onTimeUpdate={mediaController.onTimeUpdate} 
            onCanPlayThrough={mediaController.onMediaReady} 
            ref={mediaController.playerRef} 
            src={src} 
            controls={true} 
            onPlay={handleNativePlay} 
            onPause={handleNativePause}  
        />
    } else if (mediaController.getSrcType(src) === 'youtube') {
        content =  <YouTube  
            key={src}
            videoId={tunebook.utils.YouTubeGetID(src)} 
            id="tunebookyoutube"
            opts={youtubeOpts}
            onStateChange={mediaController.onYtStateChange}
            onEnd={mediaController.onEnded}
            onError={mediaController.onError}
            onReady={mediaController.onYtReady}
         />
    }
    return <div id={src || 'media-player'} >
        <div style={{display:'none'}}>{src}</div>
        <audio
            ref={mediaController.filteredPlayerRef}
            style={{ display: 'none' }}
            onEnded={mediaController.onEnded}
            onError={mediaController.onError}
            onTimeUpdate={mediaController.onTimeUpdate}
            onCanPlayThrough={mediaController.onMediaReady}
            onPlay={handleNativePlay}
            onPause={handleNativePause}
        />
        {content}
        {renderTapToPlayModal()}
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
