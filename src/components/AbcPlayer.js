import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
//qpm	whatever is in the Q: field	Number of beats per minute.
//extraMeasuresAtBeginning	0	Don't start the callbacks right away, but insert this number of measures first.
//beatCallback	null	Called for each beat passing the beat number (starting at 0).
//eventCallback	null	Called for each event (either a note, a rest, or a chord, and notes in separate voices are grouped together.)
//lineEndCallback	null	Called at the end of each line. (This is useful if you want to be sure the music is scrolled into view at the right time.) See lineEndAnticipation for more details.
//lineEndAnticipation	0	The number of milliseconds for the lineEndCallback to anticipate end of the line. That is, if you want to get the callback half a second before the end of the line, use 500.
//beatSubdivisions


    
    

export default function AbcPlayer(props) {
    var synth = useRef()
    var playerRef = useRef()
    var isLoading = useRef(false) // protect from double page loads
    //var timingCallbacks = useRef()
    //console.log(props.timing)
    
    function initMidi() {
        //console.log('init midi',playerRef.current, synth.current, isLoading.current)
        return new Promise(function(resolve,reject) {
            if (!isLoading.current) { 
                isLoading.current = true
        
                if (props.abc) {
                    //console.log(props.abc)
                    var a = new Date().getTime()
                    var linkBase = process.env.NODE_ENV === "development" ? 'http://localhost:4000' : ''
                         
                    //var m = abcjs.synth.getMidiFile(props.abc, { chordsOff: false, midiOutputType: "encoded" });
                    
                    var audioContext = null
                    
                    var myContext = new AudioContext();
                    var visualObj = abcjs.renderAbc(null, props.abc, {});
                    //console.log(visualObj)
                    var jsonAbc = props.tunebook.abcTools.abc2json(props.abc)
                    var tempo = jsonAbc.tempo > 20 ? jsonAbc.tempo : 100
                    var timingConfig = props.timing
                    timingConfig.qpm = visualObj[0].getBpm()
                    var timingCallbacks = new abcjs.TimingCallbacks(visualObj[0], props.timing);
                    var s = new abcjs.synth.CreateSynth()
                    
                    if (abcjs.synth.supportsAudio()) {
                      //console.log('PRIMAUDIO support ok')
                      window.AudioContext = window.AudioContext ||
                        window.webkitAudioContext ||
                        navigator.mozAudioContext ||
                        navigator.msAudioContext;
                      audioContext = new window.AudioContext();
                      s.init({
                          soundFontUrl: linkBase + '/midi-js-soundfonts/abcjs',
                          audioContext: myContext,
                          visualObj: visualObj[0],
                          //options: {onEnded: props.onEnded}
                          
                      }).then(() => {
                          //console.log('init')
                          s.prime().then((response) => {
                              synth.current = s
                              isLoading.current = false
                              if (props.onReady) props.onReady(s, timingCallbacks, audioContext, response)
                               
                              //console.log('primed')
                              //console.log(response.status)
                              //synth.start()
                              resolve()
                          });
                      });
                    } else {
                        console.log('NOAUDIO')
                        reject()
                    }
                    
                } else {
                    console.log('NOABC')
                    reject()
                }
            } else {
                console.log('already loading')
                reject()
            }
        })
    }
    
    function startPlaying() {
        console.log('start', props.duration, synth.current)
         //if (props.currentTime > props.duration) {
            //props.setCurrentTime(0)
        //}
        //if (!isLoading) {
            try {
                if (synth.current) {
                    //synth.current.seek(props.currentTime,"seconds")
                    if (!isLoading) synth.current.resume()
                    //if (timingCallbacks.current) timingCallbacks.current.start()
                    //if (props.onPlay) props.onPlay()
                } else {
                    console.log('start no synth')
                    props.onLoading(true)
                    initMidi().then(function() {
                        console.log('start init ready')
                        if (synth.current)  {
                            props.setDuration(synth.current.duration)
                            //synth.current.seek(props.currentTime,"seconds")
                            synth.current.start()
                            //if (timingCallbacks.current) timingCallbacks.current.start()
                        }
                        props.onLoading(false)
                        //if (props.onPlay) props.onPlay()
                    })
                }
            } catch (e) {
                console.log(e,synth,playerRef,isLoading)
            }
        //} else {
            //console.log('synth still loading')
        //}
    }
    
    function stopPlaying() {
        console.log('ABCPLAYER STOP',synth.current) //, timingCallbacks.current)
        if (synth.current) synth.current.pause()
        //if (timingCallbacks.current) timingCallbacks.current.pause()
        //if (props.onPlaying) props.onPause()
    }
    
    
     useEffect(function() {
        console.log('abcplayer isplaying', props.isPlaying)
        if (props.isPlaying) {
            startPlaying()
        } else {
            stopPlaying()
        }
    },[props.isPlaying])
    
    //useEffect(function() {
         //console.log('abcplayer time update', props.currentTime, synth.current)
        ////if (synth.current && props.currentTime < synth.current.duration) synth.current.seek(props.currentTime,"seconds")
        //if (timingCallbacks.current) timingCallbacks.current.setProgress(props.currentTime,"seconds")
    //},[props.currentTime])
    
    
    //useEffect(function() {
        //console.log('abcplayer currentTime', props.currentTime)
        //if (synth.current) synth.current.seek(props.currentTime,"seconds")
        //if (synth.current) synth.current.seek(props.currentTime,"seconds")
    //},[props.currentTime])
            
    //useEffect(function() {
        //initMidi().then(function() {
            //console.log('abcplayer boot')
            ////if (props.isPlaying) {
                ////startPlaying()
            ////} else {
                ////stopPlaying()
            ////}
            
        //})
    //},[props.abc])
    
    function cleanup() {
        //delete synth.current
        //synth.current = null
        //delete timingCallbacks.current
        //timingCallbacks.current = null
    }
    
    useEffect(function() {
        console.log('ABC STARTUP')
        if (props.isPlaying) {
            startPlaying()
        } else {
            stopPlaying()
        }
        //initMidi()
        return function shutdown() {
            console.log('ABC PLAYER SHUTDOWN')
            //stopPlaying()
            //cleanup()
            //clearTimeout(abcProgressInterval.current)
            //abcProgressInterval.current = null
        }
    },[props.isPlaying])
    
    return <b style={{display: 'block'}} ref={playerRef} >abc player</b>
}
