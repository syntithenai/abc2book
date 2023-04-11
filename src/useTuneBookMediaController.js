import {useEffect,useState, useRef} from 'react'
    
export default function useTuneBookMediaController(props) {
    const [currentTime, setCurrentTime] = useState(0) 
    const [clickSeek, setClickSeek] = useState(0)
    const [duration, setDuration] = useState(0) 
    var durationRef = null
    
    const [tune, setTune] = useState(null)
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
    
    function cleanupTimers() {
        console.log('CLEANUP TIMERS')
        clearInterval(youtubeProgressInterval.current)
        youtubeProgressInterval.current = null
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
                if (tune.links[mediaLinkNumber] && tune.links[mediaLinkNumber].endAt > 0 && ((tune.links[mediaLinkNumber].endAt) < playerRef.current.currentTime)) {
                    //console.log('foirce stop on timeupdate past end setting')
                    if (isPlaying) stop()
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
        //if (ytPlayerRef.current) console.log('onYtTimeUpdate',isPlaying,ytPlayerRef.current.getCurrentTime())
        if (ytPlayerRef.current && isPlaying) setCurrentTime(ytPlayerRef.current.getCurrentTime())
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
        //console.log('media ready',e, playerRef.current)
        cleanupTimers()
        //setIsPlaying(false)
        if (isPlaying) {
            play()
        } 
        //ytPlayerRef.current = null
        setIsLoading(false)
        setIsReady(true)
        setDuration(e.target.duration)
        playerRef.current.playbackRate = playbackSpeed
        //setCurrentTime(0)
        
    }

    function onYtReady(e) {
        //console.log('yt ready',e,e.target.getDuration(),e.target.getPlayerState(),ytPlayerRef.current,e.target,e.target.getPlayerState())
        // second time ??
        if (ytPlayerRef.current) {
            //e.target
            
            //console.log("newrate",e.target.getAvailablePlaybackRates(),playbackSpeed, e.target.getPlaybackRate())
            //console.log('yt ready real')
            cleanupTimers()
            //setIsPlaying(false)
            if (isPlaying) {
                play()
            }
            setIsLoading(false)
            setIsReady(true)
            //playerRef.current = null
            ytPlayerRef.current = e.target
            ytPlayerRef.current.setPlaybackRate(parseFloat(playbackSpeed))
            setDuration(e.target.getDuration())
            setCurrentTime(0)
        }
        ytPlayerRef.current = e.target
        
        //play()
        //stop()
        //stop()
        //ytPlayerRef.current.onStateChange = onYtStateChange
        
    }
    
    
    function onYtStateChange(e) {
        //console.log('onYtStateChange',playbackSpeed, e.data, e.target)
         //e.target.setPlaybackRate(playbackSpeed)
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
            onEnded()
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
        setIsPlaying(true)
        if (props.forceRefresh) props.forceRefresh()
        //forceMidiChange()
        const src = getSrc(useTune,mediaLinkNumber)
        const srcType = getSrcType(src)
        //console.log("CONTROLLER play", src, srcType, useTune ,mediaLinkNumber,playerRef.current,ytPlayerRef.current )
        
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
        } else if (srcType === 'youtube' && ytPlayerRef && ytPlayerRef.current) {
            //console.log('start yt',ytPlayerRef.current)
            
            try {
                //console.log('start yt try')
                var res = ytPlayerRef.current.playVideo()
                //console.log('start yt called play')
                setTimeout(function() {
                    //console.log('start yt TO')
                    //console.log(res, ytPlayerRef.current.getPlayerState())
                    if (ytPlayerRef.current.getPlayerState() === -1) {
                        //console.log('start yt set tap to play')
                        setTapToPlay(true)
                    }
                },300)
            } catch (e) {
                console.log("YT play err",e)
                //setIsPlaying(false)
                //setIsLoading(false)
                //console.log(e,ytPlayerRef.current)
            }
        } 
    }
    
    function pause() {
        //console.log("CONTROLLER pause", playerRef.current,ytPlayerRef.current)
        setIsPlaying(false)
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
        } 
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {
                //console.log(e,ytPlayerRef.current)
            }
        }
    }

    function stop() {
        //console.log("CONTROLLER stop", playerRef.current,ytPlayerRef.current)
        setIsPlaying(false)
        setCurrentTime(0)
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
            playerRef.current.currentTime = 0
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {
                //console.log(e,ytPlayerRef.current)
            }
            try {
                ytPlayerRef.current.seekTo(0)
            } catch (e) {
                //console.log(e,ytPlayerRef.current)
            }
        }
    }

    function seek(val) {
        //console.log("CONTROLLER seek",val, duration, playerRef.current,ytPlayerRef.current)
        //console.log("CONTROLLER seek src ",duration,val,src,"||  ",srcType,"||||",tune,mediaLinkNumber)

        if (parseFloat(val) >= 0 && parseFloat(duration) > 0) {
            setCurrentTime(duration * val) 
            const src = getSrc(tune,mediaLinkNumber)
            const srcType = getSrcType(src)
                
                
            if (srcType === 'audio' && playerRef && playerRef.current) {
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
    
    
    return {play, stop, pause, seek, currentTime,setCurrentTime, duration, setDuration, playerRef,ytPlayerRef, onEnded, onError, onTimeUpdate,onAbcTimeUpdate, onYtTimeUpdate ,onYtStateChange,  onYtReady, onMediaReady, isPlaying, setIsPlaying, isLoading, setIsLoading, isReady, setIsReady,  tune, setTune, mediaLinkNumber, setMediaLinkNumber, getSrc, getSrcType, playbackSpeed, setPlaybackSpeed, clickSeek, setClickSeek, checkAudioContext, forceMidiChange, midiHash, cleanupTimers, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled}
   //srcSelection, setSrcSelection, src, setSrc,
}
 
