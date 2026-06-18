import {useEffect,useState, useRef} from 'react'
import ExternalMediaPitchTempo from './externalMediaPitchTempo'
import { getPlaybackSettings } from './pitchTempoUtils'
import { isPlaybackLoopEnabled, parseMsToSeconds } from './mediaPlaybackUtils'
import { downloadAndCacheExternalMedia } from './externalMediaAudioCache'
    
export default function useTuneBookMediaController(props) {
    const [currentTime, setCurrentTime] = useState(0) 
    const [clickSeek, setClickSeek] = useState(0)
    const [duration, setDuration] = useState(0) 
    var durationRef = null
    
    const [tune, setTuneState] = useState(null)
    var [mediaLinkNumber, setMediaLinkNumber] = useState(0)
    const [tapToPlay, setTapToPlay] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)
    
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isReady, setIsReady] = useState(false)
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    
    var playerRef = useRef()
    var ytPlayerRef = useRef()
    
    var youtubeProgressInterval = useRef()
    var applyPlaybackSettingsLiveRef = useRef(null)
    var externalMediaRef = useRef(null)
    var externalLoadToken = useRef(0)
    var externalLoadingRef = useRef(false)
    var externalMediaActiveRef = useRef(false)
    var playingIntentRef = useRef(false)
    
    function cleanupTimers() {
        //console.log('CLEANUP TIMERS')
        clearInterval(youtubeProgressInterval.current)
        youtubeProgressInterval.current = null
    }

    function getGoogleAccessToken() {
        return props.token && props.token.access_token ? props.token.access_token : null
    }

    function usesExternalPitchTempo() {
        if (mediaLinkNumber === null || !tune) return false
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        return srcType === 'audio' || srcType === 'youtube'
    }

    function destroyExternalMedia() {
        externalLoadToken.current++
        externalLoadingRef.current = false
        externalMediaActiveRef.current = false
        if (externalMediaRef.current) {
            externalMediaRef.current.destroy()
            externalMediaRef.current = null
        }
    }

    function getLinkStartAt() {
        if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber]) {
            const startAt = parseMsToSeconds(tune.links[mediaLinkNumber].startAt)
            return startAt > 0 ? startAt : 0
        }
        return 0
    }

    function getLinkEndAt() {
        if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber]) {
            const endAt = parseMsToSeconds(tune.links[mediaLinkNumber].endAt)
            return endAt > 0 ? endAt : 0
        }
        return 0
    }

    function getLinkPlaybackLoop() {
        if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber]) {
            return isPlaybackLoopEnabled(tune.links[mediaLinkNumber])
        }
        return false
    }

    function loopCurrentRegion() {
        const startAt = getLinkStartAt()
        if (duration > 0) {
            const ratio = startAt / duration
            setCurrentTime(startAt)
            if (externalMediaRef.current) {
                externalMediaRef.current.seek(ratio)
                if (!isPlaying) {
                    playingIntentRef.current = true
                    setIsPlaying(true)
                    playExternalMedia()
                }
            } else {
                seek(ratio)
                if (!isPlaying) {
                    playingIntentRef.current = true
                    setIsPlaying(true)
                    playNativeMedia(getSrcType(getSrc(tune, mediaLinkNumber)))
                }
            }
        }
    }

    function handlePlaybackRegionEnd() {
        if (getLinkPlaybackLoop()) {
            loopCurrentRegion()
            return true
        }
        stop()
        onEnded()
        return false
    }

    function updateLinkPlaybackRegion(linkIndex, startAt, endAt, playbackLoop) {
        if (!tune || !Array.isArray(tune.links) || !tune.links[linkIndex]) return
        const links = tune.links.map(function(link, idx) {
            if (idx !== linkIndex) return link
            return Object.assign({}, link, {
                startAt: startAt > 0 ? String(startAt) : '',
                endAt: endAt > 0 ? String(endAt) : '',
                playbackLoop: playbackLoop,
            })
        })
        const updated = Object.assign({}, tune, { links: links })
        setTuneState(updated)
        if (mediaLinkNumber === linkIndex && duration > 0) {
            const ratio = (startAt > 0 ? startAt : 0) / duration
            if (externalMediaRef.current) {
                externalMediaRef.current.seek(ratio)
            } else if (playerRef.current) {
                playerRef.current.currentTime = startAt > 0 ? startAt : 0
            } else if (ytPlayerRef.current) {
                try {
                    ytPlayerRef.current.seekTo(startAt > 0 ? startAt : 0)
                } catch (e) {}
            }
            setCurrentTime(startAt > 0 ? startAt : 0)
        }
    }

    async function downloadExternalMedia(linkIndex) {
        if (!tune) throw new Error('No tune loaded')
        const idx = linkIndex !== undefined && linkIndex !== null ? linkIndex : mediaLinkNumber
        if (idx === null || !tune.links || !tune.links[idx] || !tune.links[idx].link) {
            throw new Error('No media link available')
        }
        const src = tune.links[idx].link
        const srcType = getSrcType(src)
        if (srcType === 'abc') throw new Error('Nothing to download for ABC playback')
        const safeName = (tune.name ? tune.name.trim().replace(/[^\w\-]+/g, '_') : 'tune') || 'tune'
        return downloadAndCacheExternalMedia({
            tuneId: tune.id,
            linkIndex: idx,
            src: src,
            srcType: srcType,
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
            filename: safeName + '-link-' + (parseInt(idx, 10) + 1) + '.mp3',
            accessToken: getGoogleAccessToken(),
        })
    }

    function muteNativePlayers() {
        if (playerRef && playerRef.current) {
            playerRef.current.volume = 0
            playerRef.current.pause()
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.mute()
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
        }
    }

    function onExternalTimeUpdate(time) {
        if (isPlaying) setCurrentTime(time)
        const endAt = getLinkEndAt()
        if (endAt > 0 && time >= endAt) {
            handlePlaybackRegionEnd()
        }
    }

    function onExternalEnded() {
        if (getLinkPlaybackLoop()) {
            loopCurrentRegion()
            return
        }
        onEnded()
    }

    async function prepareExternalMedia(forceSrc) {
        if (!usesExternalPitchTempo()) {
            destroyExternalMedia()
            return false
        }
        const src = forceSrc || getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (!src || srcType === 'abc') return false

        const token = ++externalLoadToken.current
        externalLoadingRef.current = true
        setIsLoading(true)
        destroyExternalMedia()
        externalLoadToken.current = token

        try {
            const processor = new ExternalMediaPitchTempo(onExternalTimeUpdate, onExternalEnded)
            const youtubeGetId = props.tunebook.utils.YouTubeGetID
            const loadedDuration = await processor.load(src, srcType, youtubeGetId, {
                tuneId: tune.id,
                linkIndex: mediaLinkNumber,
                accessToken: getGoogleAccessToken(),
            })
            if (token !== externalLoadToken.current) {
                processor.destroy()
                return false
            }
            if (!loadedDuration) {
                processor.destroy()
                externalLoadingRef.current = false
                setIsLoading(false)
                return false
            }

            const settings = getPlaybackSettings(tune)
            processor.applySettings(settings.tempo, settings.pitch, settings.fineTune)
            if (loadedDuration > 0) {
                processor.seek(getLinkStartAt() / loadedDuration)
            }

            externalMediaRef.current = processor
            externalMediaActiveRef.current = true
            setDuration(loadedDuration)
            setCurrentTime(getLinkStartAt())
            setIsReady(true)
            setIsLoading(false)
            externalLoadingRef.current = false
            if (playingIntentRef.current) {
                playExternalMedia()
            }
            return true
        } catch (e) {
            console.log('External pitch/tempo load failed, using native playback', e)
            if (token === externalLoadToken.current) {
                externalMediaActiveRef.current = false
                externalLoadingRef.current = false
                setIsLoading(false)
                if (playingIntentRef.current) {
                    playNativeMedia(getSrcType(src))
                }
            }
            return false
        }
    }

    function playExternalMedia() {
        if (!externalMediaRef.current) return false
        muteNativePlayers()
        externalMediaRef.current.connect().catch(function(e) {
            console.log('External pitch/tempo play failed', e)
            setTapToPlay(true)
        })
        return true
    }
    
    var midiHash = useRef()
    function forceMidiChange() {
        midiHash.current = Math.random()* 1000000000
    }
    //forceMidiChange()
    useEffect(function() {
         //console.log('TTP',tapToPlay , playCancelled)
         if (mediaLinkNumber !== null) {
             if (isPlaying && !tapToPlay && !playCancelled) {
                 //console.log('TTP play') //,gaudioContext.current)
                 //if (gaudioContext.current && gaudioContext.current.state == "running") {
                     //console.log('TTP play OK')
                     play()
                 //} else {
                     //console.log('TTP play fail')
                     //stop()
                 //} 
                //startPlaying()
                //setPlayCancelled(false)
             } else {
                 //setPlayCancelled(false)
                 //setTapToPlay(false)
             }
         }
     },[tapToPlay])
    
    function getSrc(tune, mediaLinkNumber) {
        if (tune) {
            if (mediaLinkNumber !== null && parseInt(mediaLinkNumber) != NaN) {
                if (Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber] && tune.links[mediaLinkNumber].link) {
                    //console.log('GETSRC GOT ',mediaLinkNumber,tune.links[mediaLinkNumber].link)
                    return tune.links[mediaLinkNumber].link
                } else {
                    //console.log('GETSRC mediaLinkNumber not available',mediaLinkNumber,tune.links)
                    if (Array.isArray(tune.links) && tune.links.length > 0 && tune.links[0] && tune.links[0].link) {
                        //console.log('GETSRC fallback ',0,tune.links[0].link)
                        return tune.links[0].link
                    } else {
                        return ''
                    }
                }
            } else {
                //console.log('GETSRC mediaLinkNumber not a number',mediaLinkNumber)
                return ''
            }
        } else {
            //console.log('GETSRC no tune',mediaLinkNumber)
            return ''
        }
    }
    
    function getSrcType(src) {
        if (src && src.trim()) {
            return props.tunebook.utils.isYoutubeLink(src) ? 'youtube' : 'audio'
        } else {
            return 'abc'
        }
    }
    
    function setTune(t) {
        setTuneState(t)
        if (t) {
            const tempo = t.playbackTempo > 0 ? parseFloat(t.playbackTempo) : 1
            setPlaybackSpeed(tempo)
        }
    }

    function updateTunePlaybackSettings(tempo, pitch, fineTune) {
        if (!tune) return
        const updated = Object.assign({}, tune, {
            playbackTempo: tempo,
            playbackPitch: pitch,
            playbackFineTune: fineTune,
        })
        setTuneState(updated)
        setPlaybackSpeed(tempo)
        if (externalMediaRef.current) {
            externalMediaRef.current.applySettings(tempo, pitch, fineTune)
        } else {
            if (playerRef.current) {
                playerRef.current.playbackRate = parseFloat(tempo)
            }
            if (ytPlayerRef.current) {
                try {
                    ytPlayerRef.current.setPlaybackRate(parseFloat(tempo))
                } catch (e) {}
            }
        }
        if (applyPlaybackSettingsLiveRef.current) {
            applyPlaybackSettingsLiveRef.current({ tempo: tempo, pitch: pitch, fineTune: fineTune })
        }
    }

    function onAbcTimeUpdate(time) {
        //console.log('abcv time update',time)
        if (isPlaying) {
            setCurrentTime(time) 
        }
    }
  
    function onTimeUpdate() {
        //if (playerRef.current) 
        if (playerRef.current) {
            //console.log('onTimeUpdate2',playerRef.current, tune, mediaLinkNumber)
            if (isPlaying) setCurrentTime(playerRef.current.currentTime)
            //console.log('onTimeUpdate', playerRef.current, tune, mediaLinkNumber, playerRef.current.currentTime)
            
            if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber) {
                //console.log('onTimeUpdate have link', tune.links[mediaLinkNumber])
                if (tune.links[mediaLinkNumber] && getLinkEndAt() > 0 && playerRef.current.currentTime >= getLinkEndAt()) {
                    handlePlaybackRegionEnd()
                }
            } 
            
            //setCurrentTime(playerRef.current.currentTime)
            //console.log('onTimeUpdate2',playerRef.current.currentTime - tune.endAt * 1000, playerRef.current, tune)
            //console.log('media ready', playerRef.current, tune, mediaLinkNumber, playerRef.current.currentTime)
            
            // TODO AUTO START AT
            //if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber) {
                ////console.log('media raeddy have link', tune.links[mediaLinkNumber])
                //if (tune.links[mediaLinkNumber] && tune.links[mediaLinkNumber].startAt > 0 && ((tune.links[mediaLinkNumber].startAt) > playerRef.current.currentTime)) {
                    //console.log('jump startt',parseFloat(tune.links[mediaLinkNumber].startAt))
                    //setCurrentTime(parseFloat(tune.links[mediaLinkNumber].startAt))
                    ////seek(parseFloat(tune.links[mediaLinkNumber].startAt)/e.target.duration)
                //}
            //} 
            
        }
    }
   
    
    function onYtTimeUpdate() {
        if (ytPlayerRef.current && isPlaying) {
            setCurrentTime(ytPlayerRef.current.getCurrentTime())
            const endAt = getLinkEndAt()
            if (endAt > 0 && ytPlayerRef.current.getCurrentTime() >= endAt) {
                handlePlaybackRegionEnd()
            }
        }
    }
    
    
    function onEnded() { 
        //console.log('ENDED',props.onEnded)
        cleanupTimers()
        props.tunebook.navigateToNextSong(null,function() {
            //console.log('ENDED callback stop')
            stop()
            setIsPlaying(false)
            setIsLoading(false)
            setCurrentTime(0)
        })
        //if (props.onEnded) {
            ////stop()
            //props.onEnded(stop)
        //} else {
            //stop()
            //setIsPlaying(false)
            //setIsLoading(false)
            //setCurrentTime(0)
        //}
        //setIsPlaying(false)
        
        
    }
    
    function onError(e) {
        console.log('ERROR',e)
        setIsPlaying(false)
        setIsLoading(false)
        cleanupTimers()
    }
    
    
    function onMediaReady(e) {
        cleanupTimers()
        if (externalMediaActiveRef.current && externalMediaRef.current) {
            setIsReady(true)
            if (isPlaying) play()
            return
        }
        if (isPlaying && !externalMediaActiveRef.current) {
            play()
        }
        if (!externalMediaActiveRef.current) {
            setIsLoading(false)
            setIsReady(true)
            setDuration(e.target.duration)
            if (playerRef.current) playerRef.current.playbackRate = playbackSpeed
        }
    }

    function onYtReady(e) {
        if (ytPlayerRef.current) {
            cleanupTimers()
            ytPlayerRef.current = e.target
            if (externalMediaActiveRef.current && externalMediaRef.current) {
                setIsReady(true)
                if (isPlaying) play()
                return
            }
            if (isPlaying) {
                play()
            }
            setIsLoading(false)
            setIsReady(true)
            ytPlayerRef.current.setPlaybackRate(parseFloat(playbackSpeed))
            setDuration(e.target.getDuration())
            setCurrentTime(0)
        }
        ytPlayerRef.current = e.target
    }
    
    
    function onYtStateChange(e) {
         if (externalMediaActiveRef.current) {
             if (e.data === 3) setIsLoading(true)
             else setIsLoading(false)
             return
         }
         if (ytPlayerRef.current) {
             //console.log("SET SPEED", playbackSpeed, ytPlayerRef.current)
             ytPlayerRef.current.setPlaybackRate(playbackSpeed)
         }
         //console.log("c h newrate",ytPlayerRef.current.getAvailablePlaybackRates(),playbackSpeed, ytPlayerRef.current.getPlaybackRate())
         //document.getElementsByClassName("video-stream html5-main-video")[0].playbackRate = 2.5;
        // if playing
        if (e.data === 1) {
            //console.log('onYtStateChange set interval')
            cleanupTimers()
            youtubeProgressInterval.current = setInterval(function() {
                onYtTimeUpdate()
            }, 100)
            setIsLoading(false)
        // unstarted
        } else if (e.data === -1) {
            cleanupTimers()
            setIsLoading(false)
            //play()
            if (isPlaying) play()
        // ended
        } else if (e.data === 0) {
            cleanupTimers()
            if (!getLinkPlaybackLoop()) {
                onEnded()
            } else {
                loopCurrentRegion()
            }
        // paused
        } else if (e.data === 2) {
            cleanupTimers()
        // buffering
        } else if (e.data === 3) {
            cleanupTimers()
            setIsLoading(true)
        // cued
        } else if (e.data === 5) {
            cleanupTimers()
            setIsLoading(false)
            //setIsPlaying(false)
            if (isPlaying) play()
        }
        
    }
    

    // PLAYBACK CONTROLS

    function play() { //useMediaLinkNumber=null, forceTune = null, playType='' ) {
        const useTune =  tune //(forceTune && forceTune.id) ? forceTune : tune
        playingIntentRef.current = true
        setIsPlaying(true)
        if (props.forceRefresh) props.forceRefresh()
        const src = getSrc(useTune,mediaLinkNumber)
        const srcType = getSrcType(src)

        if (usesExternalPitchTempo()) {
            if (externalMediaRef.current) {
                playExternalMedia()
                return
            }
            if (externalLoadingRef.current) {
                return
            }
            prepareExternalMedia(src).then(function(loaded) {
                if (loaded && playingIntentRef.current) {
                    playExternalMedia()
                } else if (!loaded && playingIntentRef.current) {
                    playNativeMedia(srcType)
                }
            })
            return
        }

        playNativeMedia(srcType)
    }

    function playNativeMedia(srcType) {
        if (srcType === 'audio' && playerRef && playerRef.current) {
            //console.log('start audio')
            try {
                playerRef.current.play().then(
                    function() {
                        //console.log("play oinmg NOW")
                    }).catch(function(e) {
                        //console.log("play audio ERR")
                        setTapToPlay(true)
                    })
                //console.log("play audio done")
            } catch (e) {
                setIsPlaying(false)
                setIsLoading(false)
                console.log(e)
            }
        } else if (srcType === 'youtube') {
            // Be defensive: ytPlayerRef.current may not be initialized yet. If so,
            // fall back to requiring a user tap (tapToPlay) instead of throwing.
            if (ytPlayerRef && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
                try {
                    var res = ytPlayerRef.current.playVideo()
                    console.log('start yt called play')
                    setTimeout(function() {
                        try {
                            var state = typeof ytPlayerRef.current.getPlayerState === 'function' ? ytPlayerRef.current.getPlayerState() : null
                            console.log('start yt TO')
                            console.log(res, state)
                            if (state === -1) {
                                console.log('start yt set tap to play')
                                setTapToPlay(true)
                            }
                        } catch (e) {
                            console.log('YT state read err', e)
                        }
                    },4000)
                } catch (e) {
                    console.log("YT play err",e)
                }
            } else {
                console.log('YT player not ready, enabling tap-to-play')
                setTapToPlay(true)
                setIsLoading(false)
            }
        }
    }
    
    function pause() {
        playingIntentRef.current = false
        setIsPlaying(false)
        if (externalMediaRef.current) {
            externalMediaRef.current.disconnect()
        }
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
        } 
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
        }
    }

    function stop() {
        playingIntentRef.current = false
        setIsPlaying(false)
        const startAt = getLinkStartAt()
        if (externalMediaRef.current) {
            externalMediaRef.current.disconnect()
            if (duration > 0) {
                externalMediaRef.current.seek(startAt / duration)
            } else {
                externalMediaRef.current.seek(0)
            }
        }
        setCurrentTime(startAt)
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
            playerRef.current.currentTime = startAt
            playerRef.current.volume = 1
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
            try {
                ytPlayerRef.current.seekTo(startAt)
            } catch (e) {}
            try {
                ytPlayerRef.current.unMute()
            } catch (e) {}
        }
    }

    function seek(val) {
        if (parseFloat(val) >= 0 && parseFloat(duration) > 0) {
            setCurrentTime(duration * val) 
            const src = getSrc(tune,mediaLinkNumber)
            const srcType = getSrcType(src)

            if (externalMediaRef.current) {
                externalMediaRef.current.seek(parseFloat(val))
            } else if (srcType === 'audio' && playerRef && playerRef.current) {
                playerRef.current.currentTime = duration * val
            } else if (srcType === 'youtube' && ytPlayerRef && ytPlayerRef.current ) {
                try {
                    ytPlayerRef.current.seekTo(parseFloat(val * duration).toFixed(2)) 
                } catch (e) {
                    console.log(e,ytPlayerRef.current)
                }
            }
        }
    }
    
    function checkAudioContext() {
        // check if AudioContext is supported in the browser
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
          // create a temporary AudioContext to test if it's allowed
          var context = new (window.AudioContext || window.webkitAudioContext)();
          // check if the context was successfully created
          return (context.state === 'running') 
        } else {
          console.log('AudioContext is not supported in this browser.');
          return false
        }
    }
    
    
    return {play, stop, pause, seek, currentTime,setCurrentTime, duration, setDuration, playerRef,ytPlayerRef, onEnded, onError, onTimeUpdate,onAbcTimeUpdate, onYtTimeUpdate ,onYtStateChange,  onYtReady, onMediaReady, isPlaying, setIsPlaying, isLoading, setIsLoading, isReady, setIsReady,  tune, setTune, updateTunePlaybackSettings, applyPlaybackSettingsLiveRef, mediaLinkNumber, setMediaLinkNumber, getSrc, getSrcType, playbackSpeed, setPlaybackSpeed, clickSeek, setClickSeek, checkAudioContext, forceMidiChange, midiHash, cleanupTimers, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, prepareExternalMedia, destroyExternalMedia, updateLinkPlaybackRegion, downloadExternalMedia, getLinkStartAt, getLinkEndAt, getLinkPlaybackLoop}
   //srcSelection, setSrcSelection, src, setSrc,
}
 
