import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Link, useNavigate} from 'react-router-dom'
import {Button , Modal} from 'react-bootstrap'
import ReactNoSleep from '../ReactNoSleep';
import AbcPlayButton from './AbcPlayButton'
import TempoControl from './TempoControl'
import TransposeModal from './TransposeModal'
import useAbcSynth from '../useAbcSynth'  
import { getSoundFontUrl } from '../soundFontConfig'
import RepeatsEditorModal from './RepeatsEditorModal'

export default function Abc(props) {
    const navigate = useNavigate()
    const abcSynth = useAbcSynth(Object.assign({},props,{onEnded: function(e) {
        //console.log("ABC END")
        props.tunebook.navigateToNextSong(null,navigate)
    } }))
    var {metronomeTimeout, metronome, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor,  showTempo, setShowTempo,showTranspose, setShowTranspose, clickSeek, setClickSeek, lastPlaybackSpeed, setLastPlaybackSpeed, audioChangedHash, setAudioChangedHash, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, abcTune, setAbcTune, lastAbc, setLastAbc, lastTempo, setLastTempo, lastBoost, setLastBoost, isPlaying, setIsPlaying, playCount, setPlayCountInner, playCountRef, setPlayCount, incrementPlayCount, lastScrollTo, autoScroll, realProgress, seekTo, setSeekTo, forceSeekTo, setForceSeekTo, ready, setReady, started, setStarted, store, abcTools, inputEl, playTimerRef, setAudioContext, setMidiBuffer, setVisualObj, setTimingCallbacks, setCursor, setForceStop, getForceStop, getWarp, getWarpTempo, saveAudioToCache, getAudioFromCache, startPlaying, stopPlaying, assignStateOnCompletion, resetAudioState, seekPlayer, createPlayer, primeTune, primeAudio, startPrimedTune, tune, setTune, isLastPlaying, setIsLastPlaying} = abcSynth
    
        //console.log('ABC tune',tune) //, props.abc, metronomeTimeout, metronome, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor)
    
    function updateOnChange() {
         //, props.tempo, lastTempo,  props.abc , lastAbc )
        var tune = props.tunebook.abcTools.abc2json(props.abc)
        var abc = props.tunebook.abcTools.json2abc(tune)
          renderTune(abc)
          setSeekTo(0)
          setPlayCount(0)
          setReady(false)
          setLastAbc(abc)
          setLastTempo(tune.tempo)
          setAbcTune(abc);
          setTune(tune)
          
        //} else {
          //setStarted(false)
          //setReady(false)
          ////setIsPlaying(false)
        //}
        
        return function cleanup() {
           //console.log('ABC CLEANUP')
           resetAudioState()
        }
    }


    // when abc changes, do a full update
    useEffect(() => {
    //console.log(props.abc)
        if (props.mediaController) {
            //if (props.mediaController.checkAudioContext()) {
                return updateOnChange()
                
            //} else {
                //stopPlaying()
            //}
        } else {
            return updateOnChange()
        }
    }, [props.abc])
   
    useEffect(() => {
        //if (props.mediaController && props.mediaController.checkAudioContext()) {
            return updateOnChange()
        //} else {
            //stopPlaying()
        //}
    }, [])
    
   

    // autostart
    //useEffect(() => {
        //console.log('autostart change', props.autoStart)
        //if (props.autoStart) {
          //if (props.autoStart) {
           //setIsPlaying(true)
           //if (props.onStarted) props.onStarted()
          //}
        //}  else {
           //setIsPlaying(false)
        //}
    //}, [props.autoStart]); 

    // save autoscroll prop to ref
    useEffect(() => {
      //console.log('set AS,',props.autoScroll)
      autoScroll.current = props.autoScroll
    }, [props.autoScroll])

  
  function renderTune(abcTune) {
    if (inputEl) { // && !renderActive) {
      //console.log('RENDER TUNE aa')
      try {
        var renderOptions = {
          add_classes: true,
          responsive: "resize",
          generateDownload: true,
          synth: {el: "#audio"},
          clickListener:abcSynth.clickListener,
          selectTypes: ['note','tempo','clef','keySignature']
        }
        var tune = props.tunebook.abcTools.abc2json(abcTune)
        if (tune.transpose > 0 || tune.transpose < 0 ) {
          renderOptions.visualTranspose= tune.transpose
        }
        if (props.scale && props.scale > 0) {
          renderOptions.scale = props.scale
        }
        if (tune && tune.tablature && props.tunebook.abcTools.tablatureConfig.hasOwnProperty(tune.tablature)) {
          renderOptions.tablature = [props.tunebook.abcTools.tablatureConfig[tune.tablature]]
        } 
        //var useWarp = props.warp >= 0.25 && props.warp <= 2 ? props.warp : 1
        //tune.tempo = tune.tempo * useWarp
        var res = abcjs.renderAbc(inputEl.current, props.tunebook.abcTools.json2abc(tune), renderOptions );
            
        var o = res && res.length > 0 ? res[0] : null
        setVisualObj(o)
               
        //console.log('RENDERED TUNE ',o, tune) //props.tempo,'pickup', o.getPickupLength(), 'beatlenght',o.getBeatLength(), 'beats per measure',o.getBeatsPerMeasure(), 'bar length',o.getBarLength(), 'bpm',o.getBpm(), 'mspermeasure',o.millisecondsPerMeasure(), o.getTotalBeats(), o.getTotalTime())
        if (o) {
            setStarted(true)
            const onMidiRoute = !props.mediaController
                || (props.mediaController.isMidiPlaybackRoute && props.mediaController.isMidiPlaybackRoute())
            if (props.autoPrime && onMidiRoute) {
                var primeHash = tune.transpose + '-' + props.meter + '-' + tune.tempo + '-' + abcTools.getTuneHash(tune)
                if (primeHash !== audioChangedHash) {
                    setAudioChangedHash(primeHash)
                    createPlayer(tune, o).then(function(p) {
                        var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                        if (!midiBuffer) {
                            console.log('autoPrime failed: soundfont or synth prime returned null', getSoundFontUrl())
                            setReady(false)
                            setStarted(false)
                            if (props.mediaController && props.mediaController.abortPlayingIntent) {
                                props.mediaController.abortPlayingIntent()
                            }
                            return
                        }
                        assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                        if (props.mediaController && props.mediaController.hasPlayingIntent && props.mediaController.hasPlayingIntent()
                            && props.mediaController.isMidiPlaybackRoute && props.mediaController.isMidiPlaybackRoute()) {
                            startPlaying(true)
                        }
                    }).catch(function(e) {
                        console.log('autoPrime REJECT CREATE PLAYER', e, getSoundFontUrl())
                        setReady(false)
                        setStarted(false)
                        if (props.mediaController && props.mediaController.abortPlayingIntent) {
                            props.mediaController.abortPlayingIntent()
                        }
                    })
                }
            }
        }
         //setSeekTo(0)
      } catch (e) {
        console.log('RENDER EXC',e)
      }
   }
  }
 
  function renderTapToPlayModal() {
    if (props.mediaController && props.mediaController.isMidiPlaybackRoute
        && !props.mediaController.isMidiPlaybackRoute()) {
      return null
    }
    const showTap = props.mediaController ? props.mediaController.tapToPlay : tapToPlay
    if (!showTap) return null
    return (
      <Modal show={true} onHide={function() {
        if (props.mediaController) {
          props.mediaController.setPlayCancelled(true)
          props.mediaController.setTapToPlay(false)
        } else {
          setPlayCancelled(true)
          setTapToPlay(false)
        }
      }}>
            <Modal.Header closeButton>
              <Modal.Title>Click to allow autoplay</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Button variant="success" onClick={function() {
                    if (props.mediaController && props.mediaController.resumeAudioContextAndPlay) {
                        props.mediaController.resumeAudioContextAndPlay()
                    } else {
                        setTapToPlay(false)
                        startPlaying(true)
                    }
                }}>Play</Button>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <Button variant="danger" onClick={function() {
                    if (props.mediaController) {
                      props.mediaController.setPlayCancelled(true)
                      props.mediaController.setTapToPlay(false)
                    } else {
                      setPlayCancelled(true)
                      setTapToPlay(false)
                    }
                }} >Cancel</Button>
            </Modal.Body>
      </Modal>
    )
  }

  return (
      <>
       <TempoControl showTempo={showTempo} setShowTempo={setShowTempo} value={tune.tempo} onChange={function(e) {
          var tune = props.tunebook.abcTools.abc2json(props.abc)
          if (tune) {
            tune.tempo = e
            props.tunebook.saveTune(tune)
            updateOnChange()
            if (props.forceRefresh) props.forceRefresh()
          }
        }} />
       <ReactNoSleep>
            {({ isOn, enable, disable }) => (
              <span >
                 <TransposeModal show={showTranspose} setShow={setShowTranspose} tune={tune} saveTune={props.tunebook.saveTune} forceRefresh={props.forceRefresh} />
               
                {props.showRepeats && <span style={{float:'right'}} >  
                    <RepeatsEditorModal tunebook={props.tunebook} value={tune.repeats} onChange={function(value) {tune.repeats = value; props.tunebook.saveTune(tune)}} playCount={playCount} />
                </span>}
                {props.link && <Link style={{color: 'black', textDecoration:'none'}}  to={"/tunes/"+tune.id} ><div id="abc_music_viewer" ref={inputEl} ></div></Link>}
                {(!props.link && !props.hideSvg) && <div id="abc_music_viewer" ref={inputEl} ></div>}
              </span>
            )}
        </ReactNoSleep>
        {renderTapToPlayModal()}
      </>
      );

}
    //function clickPlay(seekTo) {
        //console.log('onClickHandler PLAY',seekTo)
        //if (playTimerRef && playTimerRef.current) {
          ////console.log('onClickHandler DOUBLE')
            //clearTimeout(playTimerRef.current)
            //playTimerRef.current = null
            //setPlayCount(0)
            ////seekPlayer(0)
            //setSeekTo(seekTo > 0 ? parseInt(seekTo) : 0)
            ////setIsWaiting(true); 
            //setIsPlaying(true);
        //} else {
          ////console.log('onClickHandler start')
            //playTimerRef.current = setTimeout(() => {
              ////console.log('onClickHandler TIMEOUT TO SINGLE')
                //clearTimeout(playTimerRef.current)
                ////setIsWaiting(true); 
                //setIsPlaying(true);
                //playTimerRef.current = null
                
            //}, 500)
        //}
        
    //};

      
  //function bodyClick(enable) { 
    //if (!started) {
      //console.log('BODYCLICK')
      ////setStarted(true)
      //if (enable) enable() // enable no sleep 
      //clickInit()
    //}
  //}
    
  
  //function clickInit(playing) {
      //console.log('CLICK INIT', gvisualObj)
      //if (gvisualObj && gvisualObj.current) {
        //setReady(false)
        //setStarted(true)
        ////setIsPlaying(false)
        //if (props.mediaController) props.mediaController.setIsLoading(true)
        //createPlayer(gvisualObj.current).then(function(p) {
          //var [audioContext, midiBuffer, timingCallbacks, cursor] = p
           //if (props.mediaController) props.mediaController.setIsLoading(false)
           //assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
           //if (playing) setIsPlaying(true)
        //})
      //}
  //}
   
  
    
    //useEffect(() => {
        //setSeekTo(forceSeekTo)
        //seekPlayer(forceSeekTo)
    //}, [forceSeekTo]);

    // start stop synth when isPlaying changes
    //useEffect(() => {
        //console.log("CHANGE isplaying ",isPlaying)
        //if (isPlaying) {
          //startPlaying()
        //} else {
          //stopPlaying()
        //}
    //}, [isPlaying]); 

  
  //useEffect(() => {
    ////console.log('tempo change',props.tempo, props.abc)
      //if (props.tunes) {
        //var tuneLocal = props.tunebook.abcTools.abc2json(props.abc)
        //var tune = props.tunes[tuneLocal.id]
        //if (tune) {
          //tune.tempo = props.tempo
          //props.tunebook.saveTune(tune)
        //}
      //}
      //return updateOnChange()
      ////props.forceRefresh()
   //}, [props.tempo]) 
 
//console.log('abc',props.tunebook)

  //{(props.tempo) ? <span  >
              //{!props.hidePlayer && <AbcPlayButton forceRefresh={props.forceRefresh} tune={tune}  started={started} ready={ready}  isPlaying={isPlaying} setIsPlaying={setIsPlaying} clickInit={function(e) {clickInit(true) }} clickPlay={clickPlay}  clickRecord={clickRecord} clickStopPlaying={stopPlaying} tunebook={props.tunebook} />  }
            //</span> : null}

//{(gaudioContext && gaudioContext.current && !props.hidePlayer) && <input className="abcprogressslider" type="range" min='0' max='1' step='0.0001' value={seekTo} onChange={function(e) {setForceSeekTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}

        //style={{position:'fixed', top: 4, right: 4, zIndex: 66}}   
// onClick={function(e) {bodyClick(enable)}}
