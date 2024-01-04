import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
//import {Link, useNavigate} from 'react-router-dom'
import {Button , Modal} from 'react-bootstrap'

export default function AbcPrint(props) {
    //const navigate = useNavigate()
    //var {metronomeTimeout, metronome, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor,  showTempo, setShowTempo,showTranspose, setShowTranspose, clickSeek, setClickSeek, lastPlaybackSpeed, setLastPlaybackSpeed, audioChangedHash, setAudioChangedHash, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, abcTune, setAbcTune, lastAbc, setLastAbc, lastTempo, setLastTempo, lastBoost, setLastBoost, isPlaying, setIsPlaying, playCount, setPlayCountInner, playCountRef, setPlayCount, incrementPlayCount, lastScrollTo, autoScroll, realProgress, seekTo, setSeekTo, forceSeekTo, setForceSeekTo, ready, setReady, started, setStarted, store, abcTools, inputEl, playTimerRef, setAudioContext, setMidiBuffer, setVisualObj, setTimingCallbacks, setCursor, setForceStop, getForceStop, getWarp, getWarpTempo, saveAudioToCache, getAudioFromCache, startPlaying, stopPlaying, assignStateOnCompletion, resetAudioState, seekPlayer, createPlayer, primeTune, primeAudio, startPrimedTune, tune, setTune, isLastPlaying, setIsLastPlaying} = abcSynth
    
        //console.log('ABC tune',tune) //, props.abc, metronomeTimeout, metronome, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor)
    const inputEl = useRef(null);
    
    function updateOnChange() {
         //, props.tempo, lastTempo,  props.abc , lastAbc )
        //var tune = props.tunebook.abcTools.abc2json(props.abc)
          //var abc = props.tunebook.abcTools.json2abc(tune)
          renderTune(props.abc)
    }


    // when abc changes, do a full update
    //useEffect(() => {
            //return updateOnChange()
    //}, [props.abc])
   
    useEffect(() => {
		 updateOnChange()        
    }, [])
    
   
  
  function renderTune(abcTune) {
    if (inputEl) { // && !renderActive) {
      //console.log('RENDER TUNE aa')
      try {
        var renderOptions = {
          add_classes: true,
          responsive: "resize",
        }
        //var tune = props.tunebook.abcTools.abc2json(abcTune)
        //if (tune.transpose > 0 || tune.transpose < 0 ) {
          //renderOptions.visualTranspose= tune.transpose
        //}
        //if (props.scale && props.scale > 0) {
          //renderOptions.scale = props.scale
        //}
        //if (tune && tune.tablature && props.tunebook.abcTools.tablatureConfig.hasOwnProperty(tune.tablature)) {
          //renderOptions.tablature = [props.tunebook.abcTools.tablatureConfig[tune.tablature]]
        //} 
        //var useWarp = props.warp >= 0.25 && props.warp <= 2 ? props.warp : 1
        //tune.tempo = tune.tempo * useWarp
        abcjs.renderAbc(inputEl.current, abcTune, renderOptions );
            
        
      } catch (e) {
        console.log('RENDER EXC',e)
      }
   }
  }
 
     return (
      <>
              <div id="abc_music_viewer" ref={inputEl} ></div>
      </>
      );
    
}


