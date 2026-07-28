import React, { useEffect, useState, useRef, useCallback } from "react";
import abcjs from "abcjs";
import { getResourceBase } from '../resourceBase';
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
    
    function initMidi() {
        return new Promise(function(resolve,reject) {
            if (!isLoading.current) { 
                isLoading.current = true
        
                if (props.abc) {
                    var a = new Date().getTime()
                    var linkBase = getResourceBase()
                         
                    //var m = abcjs.synth.getMidiFile(props.abc, { chordsOff: false, midiOutputType: "encoded" });
                    
                    var audioContext = null
                    
                    var myContext = new AudioContext();
                    var visualObj = abcjs.renderAbc(null, props.abc, {});
                    var jsonAbc = props.tunebook.abcTools.abc2json(props.abc)
                    var tempo = jsonAbc.tempo > 20 ? jsonAbc.tempo : 100
                    var timingConfig = props.timing
                    timingConfig.qpm = visualObj[0].getBpm()
                    var timingCallbacks = new abcjs.TimingCallbacks(visualObj[0], props.timing);
                    var s = new abcjs.synth.CreateSynth()
                    
                    if (abcjs.synth.supportsAudio()) {
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
                          s.prime().then((response) => {
                              synth.current = s
                              isLoading.current = false
                              if (props.onReady) props.onReady(s, timingCallbacks, audioContext, response)
                               
                              //synth.start()
                              resolve()
                          });
                      });
                    } else {
                        reject()
                    }
                    
                } else {
                    reject()
                }
            } else {
                reject()
            }
        })
    }
    
    const startPlaying = useCallback(function() {
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
                    props.onLoading(true)
                    initMidi().then(function() {
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
            }
        //} else {
        //}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startPlaying uses initMidi/props; effect below keys on isPlaying
    }, [])
    
    function stopPlaying() {
        if (synth.current) synth.current.pause()
        //if (timingCallbacks.current) timingCallbacks.current.pause()
        //if (props.onPlaying) props.onPause()
    }
    
    
     useEffect(function() {
        if (props.isPlaying) {
            startPlaying()
        } else {
            stopPlaying()
        }
    },[props.isPlaying, startPlaying])
    
    //useEffect(function() {
        ////if (synth.current && props.currentTime < synth.current.duration) synth.current.seek(props.currentTime,"seconds")
        //if (timingCallbacks.current) timingCallbacks.current.setProgress(props.currentTime,"seconds")
    //},[props.currentTime])
    
    
    //useEffect(function() {
        //if (synth.current) synth.current.seek(props.currentTime,"seconds")
        //if (synth.current) synth.current.seek(props.currentTime,"seconds")
    //},[props.currentTime])
            
    //useEffect(function() {
        //initMidi().then(function() {
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
        if (props.isPlaying) {
            startPlaying()
        } else {
            stopPlaying()
        }
        //initMidi()
        return function shutdown() {
            //stopPlaying()
            //cleanup()
            //clearTimeout(abcProgressInterval.current)
            //abcProgressInterval.current = null
        }
    },[props.isPlaying, startPlaying])
    
    return <b style={{display: 'block'}} ref={playerRef} >abc player</b>
}
