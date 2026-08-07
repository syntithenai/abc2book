import YouTube from 'react-youtube';
import AbcPlayer from './AbcPlayer'
import PlaybackPromptModal from './PlaybackPromptModal'
import {useParams, Link, useLocation, useNavigate} from 'react-router-dom'
import {useState, useEffect, useMemo, useRef} from 'react'
import { applyStoredOutputDeviceToElement } from '../outputDeviceSupport'

export default function MediaPlayerMedia({mediaController, tunebook, tune, routePlayState, routeMediaLinkNumber, suppressAutostart, suppressTapModal, onMediaEngineReady, instanceId, compactPlayer, forceRefresh, token, googleDocumentId, login, onLinksSaved}) {
    const params = useParams()
    const location = useLocation()
    const playState = routePlayState != null ? routePlayState : params.playState
    const mediaLinkNumberParam = routeMediaLinkNumber != null ? routeMediaLinkNumber : params.mediaLinkNumber
    const isFirefox = false; //typeof InstallTrigger !== 'undefined';
                    
    
    const [src, setSrc] = useState('')
    
    const [lastPlayState, setLastPlayState] = useState('')
    const [lastTuneId, setLastTuneId] = useState('')
    const [lastMediaLinkNumber, setLastMediaLinkNumber] = useState('')
    const lastPreparedSrcRef = useRef(null)

    // The media controller hook returns a fresh object on every App render, so
    // it must NOT appear in the cleanup effect's deps: that would turn the
    // "unmount" cleanup into an every-render cleanup that pauses/mutes the
    // player continuously while it is playing. Read the latest controller
    // through a ref instead and run the cleanup only on true unmount.
    const mediaControllerRef = useRef(mediaController)
    mediaControllerRef.current = mediaController
    const instanceIdRef = useRef(instanceId)
    instanceIdRef.current = instanceId

    useEffect(function() {
        return function() {
            const mc = mediaControllerRef.current
            if (!mc) return
            if (instanceIdRef.current === 'practice' && mc.destroyExternalMedia) {
                mc.destroyExternalMedia()
            }
            const preserveHandoff = mc.shouldPreserveMediaEngineOnHostHandoff
                && mc.shouldPreserveMediaEngineOnHostHandoff()
            if (!preserveHandoff && mc.silencePlaybackOutputs) {
                mc.silencePlaybackOutputs()
            } else if (preserveHandoff && mc.pauseYoutubeOutputOnly) {
                mc.pauseYoutubeOutputOnly()
            }
            // Only drop the shared YouTube player reference when we are NOT
            // handing the engine off to another host/instance. Clearing it during
            // a preserved handoff (or a React StrictMode remount) nulls the ref of
            // the player that is meant to keep going, which stalls playback.
            if (!preserveHandoff && mc.clearYoutubePlayerRef) {
                mc.clearYoutubePlayerRef()
            }
        }
    }, [])
    
    // Src-change work must only run when src actually changes. mediaController
    // is a new object each render, so it must not be an effect dependency here
    // (it would tear down the external audio engine on every render).
    useEffect(function() {
        const mc = mediaControllerRef.current
        if (!src) {
            lastPreparedSrcRef.current = null
            if (mc.destroyExternalMedia) {
                mc.destroyExternalMedia()
            }
            return
        }
        const srcType = mc.getSrcType(src)
        if (srcType !== 'audio' && srcType !== 'youtube') {
            lastPreparedSrcRef.current = null
            if (mc.destroyExternalMedia) {
                mc.destroyExternalMedia()
            }
            return
        }
        if (src !== lastPreparedSrcRef.current) {
            const preserveEngine = src
                && mc.shouldPreserveMediaEngineOnHostHandoff
                && mc.shouldPreserveMediaEngineOnHostHandoff()
                && mc.getActivePreparedMediaSrc
                && src === mc.getActivePreparedMediaSrc()
            lastPreparedSrcRef.current = src
            if (!preserveEngine) {
                if (mc.notifyYoutubeSrcChanged) {
                    mc.notifyYoutubeSrcChanged()
                }
                if (mc.destroyExternalMedia) {
                    mc.destroyExternalMedia()
                }
            }
        }
        const needsExternal = mc.usesExternalPitchTempo && mc.usesExternalPitchTempo()
        const deferExternalPrep = suppressAutostart && instanceId === 'practice'
        if (!needsExternal || deferExternalPrep) {
            return
        }
        if (mc.prepareExternalMedia) {
            mc.prepareExternalMedia(src, undefined, { autoPlay: false, showLoading: false })
        }
    }, [
        src,
        mediaController.mediaResolverAvailable,
        instanceId,
    ])
    
    const tuneId = tune ? tune.id : null
    useEffect(function() {
        const mc = mediaControllerRef.current
        if (!tune || !mc || !mc.applyPlaybackRoute) return
        if (mc.flushPendingPlayRequest) {
            mc.flushPendingPlayRequest()
        }
        if (mc.requestedPlayState === 'playMidi') return
        if (mc.playbackRouteMode === 'midi') return
        if (mc.isMidiPlaybackRoute && mc.isMidiPlaybackRoute()) return
        if (playState !== 'playMedia' && playState !== 'playMidi') return

        const parsedLinkNum = parseInt(mediaLinkNumberParam, 10)
        const requestedLinkNum = !isNaN(parsedLinkNum) ? parsedLinkNum : 0
        const isFirstTuneLoad = !lastTuneId
        const tuneChanged = tune.id !== lastTuneId
        const linkChanged = requestedLinkNum !== lastMediaLinkNumber
        const playStateChanged = playState !== lastPlayState
        const kickoffPending = mc.needsPlaybackKickoff && mc.needsPlaybackKickoff()

        // tune/tunebook are new object references on most App renders; only
        // re-apply the route when the logical playback target actually changed.
        if (!isFirstTuneLoad && !tuneChanged && !linkChanged && !playStateChanged && !kickoffPending) {
            return
        }

        const route = mc.applyPlaybackRoute(
            playState,
            mediaLinkNumberParam,
            tune,
            tunebook
        )
        setSrc(route.src === null ? null : route.src)

        let changeType = null
        if (tuneChanged) {
            changeType = 'tune'
            mediaController.setTune(tune)
            if (mediaController.clearCachedNativePlaybackUrl) {
                mediaController.clearCachedNativePlaybackUrl()
            }
            let resumePos = null
            if (mediaController.consumeQueuePlaybackResume) {
                resumePos = mediaController.consumeQueuePlaybackResume(tune.id)
            }
            if (resumePos == null && mediaController.getPlaybackHandoffPosition) {
                resumePos = mediaController.getPlaybackHandoffPosition(tune.id)
            }
            if (resumePos != null) {
                if (mediaController.applyPreservedPlaybackPosition) {
                    mediaController.applyPreservedPlaybackPosition(resumePos)
                } else {
                    mediaController.setCurrentTime(resumePos)
                }
                if (mediaController.setIsPlaying) {
                    mediaController.setIsPlaying(false)
                }
            } else if (!kickoffPending) {
                mediaController.setCurrentTime(0)
                mediaController.setClickSeek(0)
            }
            mediaController.setDuration(0)
            if (!kickoffPending) {
                mediaController.cleanupTimers()
            }
            if (mediaController.hasActivePlaybackIntent && !mediaController.hasActivePlaybackIntent()) {
                mediaController.setIsLoading(false)
            }
        } else if (linkChanged) {
            changeType = 'link'
            const nextSrc = route.src
            const mediaInFlight = mediaController.isLinkedMediaPlaybackInFlight
                && mediaController.isLinkedMediaPlaybackInFlight()
            const activePreparedSrc = mediaController.getActivePreparedMediaSrc
                ? mediaController.getActivePreparedMediaSrc()
                : null
            if (!mediaInFlight
                && (!activePreparedSrc || nextSrc !== activePreparedSrc)
                && mediaController.clearCachedNativePlaybackUrl) {
                mediaController.clearCachedNativePlaybackUrl()
            }
            if (!mediaInFlight) {
                mediaController.setCurrentTime(0)
                mediaController.setClickSeek(0)
                mediaController.setDuration(0)
                mediaController.cleanupTimers()
            }
        } else if (playStateChanged) {
            changeType = 'playState'
        } else if (kickoffPending) {
            // Repeat-track / same-tune advance: armPlaybackIntent ran but tune id did not change.
            changeType = 'tune'
        }

        if (changeType === 'playState' && playState !== 'playMidi' && playState !== 'playMedia') {
            mc.stop()
        } else if (changeType && !suppressAutostart) {
            let consumed = false
            if (mc.consumePendingPlayRequest) {
                consumed = mc.consumePendingPlayRequest(
                    tune.id,
                    playState,
                    route.mediaLinkNumber
                )
            }
            if (!consumed && mc.maybeAutostart) {
                mc.maybeAutostart(playState, changeType, isFirstTuneLoad)
            }
        }

        setLastTuneId(tune ? tune.id : null)
        setLastMediaLinkNumber(route.mediaLinkNumber)
        setLastPlayState(playState)
    
    },[tuneId, mediaLinkNumberParam, playState, lastTuneId, lastMediaLinkNumber, lastPlayState, suppressAutostart])
    
    function handleControllerMediaReady(e) {
        if (mediaController.onMediaReady) {
            mediaController.onMediaReady(e)
        }
        if (onMediaEngineReady) {
            onMediaEngineReady()
        }
    }

    function assignPlayerRef(el) {
        const mc = mediaControllerRef.current
        if (mc && mc.playerRef) {
            mc.playerRef.current = el
        }
        if (el && mc && typeof mc.reapplyStoredOutputDevice === 'function') {
            mc.reapplyStoredOutputDevice().catch(function() {})
        } else if (el) {
            applyStoredOutputDeviceToElement(el).catch(function() {})
        }
    }

    function assignFilteredPlayerRef(el) {
        const mc = mediaControllerRef.current
        if (mc && mc.filteredPlayerRef) {
            mc.filteredPlayerRef.current = el
        }
        if (el && mc && typeof mc.reapplyStoredOutputDevice === 'function') {
            mc.reapplyStoredOutputDevice().catch(function() {})
        } else if (el) {
            applyStoredOutputDeviceToElement(el).catch(function() {})
        }
    }

    function renderTapToPlayModal() {
        if (suppressTapModal) return null
        if (!mediaController.tapToPlay) return null
        return (
            <PlaybackPromptModal
                show={true}
                reason={mediaController.tapToPlayReason || 'autoplay'}
                mediaController={mediaController}
                tune={tune}
                tunebook={tunebook}
                src={src}
                forceRefresh={forceRefresh}
                token={token}
                googleDocumentId={googleDocumentId}
                login={login}
                onLinksSaved={onLinksSaved}
            />
        )
    }

    function handleNativePlay() {
        if (mediaController.shouldIgnoreNativePlaybackEvents
            && mediaController.shouldIgnoreNativePlaybackEvents()) {
            return
        }
        if (mediaController.isLoading) {
            if (mediaController.hasActivePlaybackIntent
                && mediaController.hasActivePlaybackIntent()
                && mediaController.confirmPlayingStarted) {
                mediaController.confirmPlayingStarted()
            }
            return
        }
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
        if (mediaController.isLoading) {
            return
        }
        if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()
            && mediaController.hasActivePlaybackIntent
            && mediaController.hasActivePlaybackIntent()) {
            return
        }
        if (mediaController.shouldSuppressSpuriousPause && mediaController.shouldSuppressSpuriousPause()) {
            return
        }
        if (mediaController.shouldIgnoreNativePlaybackEvents
            && mediaController.shouldIgnoreNativePlaybackEvents()) {
            return
        }
        if (!mediaController.shouldIgnoreNativePlaybackEvents()) {
            if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
                const nativePlayer = mediaController.playerRef && mediaController.playerRef.current
                if (nativePlayer && nativePlayer.ended) {
                    return
                }
                if (mediaController.shouldAdvanceQueueOnPlaybackEnd
                    && mediaController.shouldAdvanceQueueOnPlaybackEnd()) {
                    return
                }
                if (mediaController.recoverUnexpectedNativePause) {
                    mediaController.recoverUnexpectedNativePause()
                }
                return
            }
            if (mediaController.pause) {
                mediaController.pause()
            } else {
                mediaController.setIsPlaying(false)
            }
        }
    }

    const playerDomSuffix = instanceId ? '-' + instanceId : ''
    const audioElementId = 'tunebookaudio' + playerDomSuffix
    const youtubeElementId = 'tunebookyoutube' + playerDomSuffix
    const mediaRootId = (src || 'media-player') + playerDomSuffix

    const youtubeOpts = useMemo(function() {
        const playerVars = {
            loop: 0,
            controls: 1,
            enablejsapi: 1,
        }
        return {
            width: compactPlayer ? '200' : '100%',
            height: compactPlayer ? '150' : '390',
            playerVars: playerVars,
        }
    }, [compactPlayer])

    function handleYoutubeReady(event) {
        if (mediaController.onYtReady) {
            mediaController.onYtReady(event)
        }
        if (onMediaEngineReady) {
            onMediaEngineReady()
        }
    }

    var content = null
    const cachedPlaybackSrc = mediaController.nativePlaybackSrcOverride
    const useCachedAudioPlayer = !!cachedPlaybackSrc
    const srcType = mediaController.getSrcType(src)
    const recordingAwaitingBlob = srcType === 'recording' && !useCachedAudioPlayer
    const suppressHtml5AudioSrc = typeof mediaController.shouldSuppressHtml5AudioSrc === 'function'
        && mediaController.shouldSuppressHtml5AudioSrc()
    const nativeAudioSrc = suppressHtml5AudioSrc
        ? ''
        : (useCachedAudioPlayer
            ? cachedPlaybackSrc
            : (recordingAwaitingBlob ? '' : src))
    // Keep the YouTube iframe mounted until the external stem/pitch engine is
    // actually outputting audio. usesExternalPitchTempo() becomes true as soon
    // as a stem slider moves off 100%, and unmounting the iframe immediately
    // stops native playback before the handoff can finish.
    const externalOutputActive = typeof mediaController.isExternalOutputActive === 'function'
        ? mediaController.isExternalOutputActive()
        : !!mediaController.externalMediaActive
    const suppressYoutubeEmbed = typeof mediaController.shouldSuppressYoutubeEmbed === 'function'
        && mediaController.shouldSuppressYoutubeEmbed()
    const showYoutubeEmbed = srcType === 'youtube'
        && !useCachedAudioPlayer
        && !suppressYoutubeEmbed
        && (instanceId === 'practice'
            || !externalOutputActive
            || (mediaController.nativePlaybackFallbackRequired && !externalOutputActive))

    if (useCachedAudioPlayer || srcType === 'audio' || srcType === 'recording') {
        content =  <audio 
           id={audioElementId} 
            onEnded={mediaController.onEnded} 
            onError={mediaController.onError} 
            onTimeUpdate={mediaController.onTimeUpdate} 
            onCanPlayThrough={handleControllerMediaReady} 
            ref={assignPlayerRef}
            src={nativeAudioSrc || undefined} 
            controls={!suppressHtml5AudioSrc}
            muted={suppressHtml5AudioSrc || undefined}
            playsInline
            {...{ 'x-webkit-airplay': 'allow' }}
            onPlay={handleNativePlay} 
            onPause={handleNativePause}  
        />
    } else if (showYoutubeEmbed) {
        content =  <YouTube  
            key={src}
            videoId={tunebook.utils.YouTubeGetID(src)} 
            id={youtubeElementId}
            opts={youtubeOpts}
            onStateChange={mediaController.onYtStateChange}
            onEnd={mediaController.onEnded}
            onError={mediaController.onError}
            onReady={handleYoutubeReady}
         />
    } else if (srcType === 'youtube' && suppressYoutubeEmbed) {
        content = <div className="tunebook-youtube-native-loading" aria-live="polite">Preparing playback…</div>
    }
    return <div id={mediaRootId} >
        <div style={{display:'none'}}>{src}</div>
        <audio
            ref={assignFilteredPlayerRef}
            style={{ display: 'none' }}
            playsInline
            {...{ 'x-webkit-airplay': 'allow' }}
            onEnded={mediaController.onEnded}
            onError={mediaController.onError}
            onTimeUpdate={mediaController.onTimeUpdate}
            onCanPlayThrough={handleControllerMediaReady}
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
            //if (!checkAudioContext()) {
                //setTapToPlay(true)
            //} else {
                //// cleanup
                ////if (mediaController.abcSynthRef.current) mediaController.abcSynthRef.current.stop()
                //////mediaController.abcSynthRef = null
                ////if (mediaController.playerRef.current) mediaController.playerRef.current.stop()
                ////mediaController.playerRef = null
                //if (tunebook.hasLinks(tune)) {
                    //mediaController.setTune(tune)
                    ////mediaController.setSourceFromTune(tune,useMediaLinkNumber)
                    //mediaController.setMediaLinkNumber(useMediaLinkNumber)
                    //setSrc(mediaController.getSrc(tune, useMediaLinkNumber))
                    //mediaController.setCurrentTime(0)
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
