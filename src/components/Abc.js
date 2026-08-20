import React, { useEffect, useState, useRef, useCallback } from "react";
import abcjs from "abcjs";
import { abcForAbcjs } from '../melodyBarlineNormalize';
import { isMobile } from 'react-device-detect';
import {Link, useNavigate} from 'react-router-dom'
import {Button , Modal} from 'react-bootstrap'
import ReactNoSleep from '../ReactNoSleep';
import AbcPlayButton from './AbcPlayButton'
import TempoControl from './TempoControl'
import TransposeModal from './TransposeModal'
import useAbcSynth from '../useAbcSynth'  
import { getSoundFontUrl } from '../soundFontConfig'
import RepeatsEditorModal from './RepeatsEditorModal'
import {
  NOTATION_FIT_VERTICAL,
  applyCompactScreenNotationMeta,
  clearNotationFit,
  findStaffWidthForVerticalFit,
  fitSingleViewVertical,
  measureSingleViewPaper,
  readNotationSvgDims,
} from '../gigNotationFit'
import { buildTablatureRenderOptions, shouldApplyTabOnlyDisplay, countActiveTabVoices } from '../tablatureConfig.js'
import { applyTabOnlyNotationDisplay, clearTabOnlyNotationDisplay } from '../notationTabDisplay'
export default function Abc(props) {
    const navigate = useNavigate()
    const abcSynth = useAbcSynth(Object.assign({},props,{onEnded: function(e) {
        if (props.onEnded) {
            props.onEnded(e)
            return
        }
        props.tunebook.navigateToNextSong(null,navigate)
    } }))
    var {metronomeTimeout, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor,  showTempo, setShowTempo,showTranspose, setShowTranspose, clickSeek, setClickSeek, lastPlaybackSpeed, setLastPlaybackSpeed, audioChangedHash, setAudioChangedHash, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, abcTune, setAbcTune, lastAbc, setLastAbc, lastTempo, setLastTempo, lastBoost, setLastBoost, isPlaying, setIsPlaying, playCount, setPlayCountInner, playCountRef, setPlayCount, incrementPlayCount, lastScrollTo, autoScroll, realProgress, seekTo, setSeekTo, forceSeekTo, setForceSeekTo, ready, setReady, started, setStarted, store, abcTools, inputEl, playTimerRef, setAudioContext, setMidiBuffer, setVisualObj, setPlaybackVisualObj, setTimingCallbacks, setCursor, setForceStop, getForceStop, getWarp, getWarpTempo, saveAudioToCache, getAudioFromCache, startPlaying, startPlayingFromIntent, stopPlaying, assignStateOnCompletion, resetAudioState, seekPlayer, createPlayer, primeTune, primeAudio, startPrimedTune, tune, setTune, isLastPlaying, setIsLastPlaying, getPlaybackGeneration, isPlaybackGenerationCurrent} = abcSynth
    const renderedAbcRef = useRef('')
    const fitMode = props.fitMode === NOTATION_FIT_VERTICAL ? NOTATION_FIT_VERTICAL : null
    const fitAppliedRef = useRef(false)

    function getTablatureDisplayTune(renderTune) {
      return props.tablatureSourceTune || renderTune
    }

    function finalizeTablatureDisplay(renderTune, tabOptions) {
      if (!inputEl || !inputEl.current || props.hideSvg) return
      const displayTune = getTablatureDisplayTune(renderTune)
      const root = inputEl.current
      if (!shouldApplyTabOnlyDisplay(displayTune, tabOptions)) {
        clearTabOnlyNotationDisplay(root)
        return
      }
      applyTabOnlyNotationDisplay(root, countActiveTabVoices(tabOptions))
    }

    function getVerticalFitOptions(renderTune, tabOptions, renderEl) {
      const displayTune = getTablatureDisplayTune(renderTune)
      const options = {}
      if (renderEl && typeof renderEl.closest === 'function'
          && renderEl.closest('.tune-layout-notation-lyrics')) {
        options.topAlign = true
      }
      if (shouldApplyTabOnlyDisplay(displayTune, tabOptions)) {
        return Object.keys(options).length > 0 ? options : null
      }
      if (countActiveTabVoices(tabOptions) > 0) {
        return Object.assign({ preferWidthFit: true }, options)
      }
      return Object.keys(options).length > 0 ? options : null
    }

    function refitVerticalAfterTablature(renderTune, tabOptions) {
      if (!inputEl || !inputEl.current || props.hideSvg || fitMode !== NOTATION_FIT_VERTICAL) return
      const svg = inputEl.current.querySelector('svg')
      if (!svg) return
      fitSingleViewVertical(svg, inputEl.current, null, getVerticalFitOptions(renderTune, tabOptions, inputEl.current))
      fitAppliedRef.current = true
    }

    function getTablatureRenderContext(renderTune) {
      return {
        sourceTune: props.tablatureSourceTune || renderTune,
        voiceKeys: props.tablatureVoiceKeys,
      }
    }

    function resolveTabOptions(renderTune) {
      if (props.disableTablature) return null
      return buildTablatureRenderOptions(renderTune, getTablatureRenderContext(renderTune))
    }

    function applyFitToRenderedSvg() {
      if (!inputEl || !inputEl.current || props.hideSvg) return
      const renderEl = inputEl.current
      const svg = renderEl.querySelector('svg')
      if (!svg) return
      if (fitMode !== NOTATION_FIT_VERTICAL) {
        if (fitAppliedRef.current) {
          clearNotationFit(svg, renderEl)
          fitAppliedRef.current = false
        }
        return
      }
      let verticalFitOptions = null
      let tabOptions = null
      let displayTune = null
      let tune = null
      if (props.abc) {
        tune = props.tunebook.abcTools.abc2json(props.abc)
        tabOptions = resolveTabOptions(tune)
        displayTune = getTablatureDisplayTune(tune)
        verticalFitOptions = getVerticalFitOptions(tune, tabOptions, renderEl)
      }
      fitSingleViewVertical(svg, renderEl, null, verticalFitOptions)
      if (displayTune && tabOptions && shouldApplyTabOnlyDisplay(displayTune, tabOptions)) {
        finalizeTablatureDisplay(tune, tabOptions)
        fitSingleViewVertical(svg, renderEl, null, verticalFitOptions)
      } else if (displayTune && tabOptions) {
        finalizeTablatureDisplay(tune, tabOptions)
      }
      fitAppliedRef.current = true
    }
    
    
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
           resetAudioState()
        }
    }


    // when abc changes, do a full update
    useEffect(() => {
        if (props.mediaController) {
            //if (props.mediaController.checkAudioContext()) {
                return updateOnChange()
                
            //} else {
                //stopPlaying()
            //}
        } else {
            return updateOnChange()
        }
    // updateOnChange calls renderTune (defined below); abc/staffwidth/fitMode/visualTranspose are the intentional triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.abc, props.playbackAbc, props.staffwidth, fitMode, props.visualTranspose])

    useEffect(function() {
      if (!inputEl || !inputEl.current || props.hideSvg || !props.abc) return
      renderTune(props.abc)
    // tablatureSourceTune carries enabled/display flags that require a full re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.tablatureSourceTune, props.tablatureVoiceKeys, props.hideSvg, fitMode])

    // Re-layout fit-height when the viewport/column size changes (staffwidth search).
    useEffect(function() {
      if (!inputEl || !inputEl.current || props.hideSvg) return undefined
      if (fitMode !== NOTATION_FIT_VERTICAL) {
        applyFitToRenderedSvg()
        return undefined
      }
      const renderEl = inputEl.current
      const lastPaperRef = { availW: 0, availH: 0 }
      let resizeTimer = null

      function paperChanged(paper) {
        return Math.abs(paper.availW - lastPaperRef.availW) >= 2
          || Math.abs(paper.availH - lastPaperRef.availH) >= 2
      }

      function relayoutVertical() {
        if (!inputEl.current) return
        const paper = measureSingleViewPaper(inputEl.current)
        if (!paperChanged(paper)) return
        lastPaperRef.availW = paper.availW
        lastPaperRef.availH = paper.availH
        // Full re-render so staffwidth matches the new viewport aspect ratio.
        renderTune(props.abc)
      }

      let raf2 = null
      // Two frames so toolbar / media spacer layout has settled, then re-search staffwidth.
      const raf1 = requestAnimationFrame(function() {
        raf2 = requestAnimationFrame(function() {
          const paper = measureSingleViewPaper(renderEl)
          lastPaperRef.availW = paper.availW
          lastPaperRef.availH = paper.availH
          renderTune(props.abc)
        })
      })

      function scheduleRelayout() {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(relayoutVertical, 80)
      }

      window.addEventListener('resize', scheduleRelayout)
      let observer = null
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(scheduleRelayout)
        const section = typeof renderEl.closest === 'function'
          ? renderEl.closest(
            '.tune-panel-notation, .music-body-notation, .music-notation-section, .music-view-notation, .gig-mode-notation-col, .music-view-main'
          )
          : null
        const footerRoot = typeof renderEl.closest === 'function'
          ? renderEl.closest('.music-single, .tune-single-view-dialog-content')
          : null
        const footerMeta = footerRoot && typeof footerRoot.querySelector === 'function'
          ? footerRoot.querySelector('.music-single-footer-meta')
          : null
        if (section) observer.observe(section)
        if (footerMeta) observer.observe(footerMeta)
      }
      return function() {
        cancelAnimationFrame(raf1)
        if (raf2) cancelAnimationFrame(raf2)
        if (resizeTimer) clearTimeout(resizeTimer)
        window.removeEventListener('resize', scheduleRelayout)
        if (observer) observer.disconnect()
      }
    // renderTune/applyFitToRenderedSvg close over fitMode; intentional deps only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitMode, props.hideSvg, props.abc, props.staffwidth, props.dragging, props.selectTypes])

    // autostart
    //useEffect(() => {
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
      autoScroll.current = props.autoScroll
    }, [props.autoScroll, autoScroll])

  
  function renderTune(abcTune) {
    if (!inputEl || !inputEl.current) {
      return
    }
    // && !renderActive) {
      try {
        var clickListener = abcSynth.clickListener
        if (props.onClick && props.suppressPlaybackSeek) {
          clickListener = function(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
            props.onClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent, renderedAbcRef.current)
          }
        }
        var renderOptions = {
          add_classes: true,
          generateDownload: true,
          synth: {el: "#audio"},
          clickListener: clickListener,
          // Screen-only: print/PDF uses TunePrintSheet, not this Abc path.
          paddingtop: 6,
          afterParsing: applyCompactScreenNotationMeta,
        }
        if (props.selectTypes === false) {
          renderOptions.selectTypes = false
        } else if (props.selectTypes === 'clickable') {
          // abcjs default (undefined): notes/rests fire clickListener but are not selectable/draggable
        } else if (Array.isArray(props.selectTypes)) {
          renderOptions.selectTypes = props.selectTypes
        } else {
          renderOptions.selectTypes = ['note','tempo','clef','keySignature']
        }
        if (props.dragging) {
          renderOptions.dragging = true
          renderOptions.selectionColor = props.selectionColor || '#0d6efd'
          renderOptions.dragColor = props.dragColor || '#0d6efd'
        }
        var tune = props.tunebook.abcTools.abc2json(abcTune)
        var effectiveVisualTranspose = props.visualTranspose != null ? props.visualTranspose : (tune ? (tune.transpose || 0) : 0)
        if (effectiveVisualTranspose > 0 || effectiveVisualTranspose < 0) {
          renderOptions.visualTranspose = effectiveVisualTranspose
        }
        if (props.scale && props.scale > 0) {
          renderOptions.scale = props.scale
        }
        const tabOptions = resolveTabOptions(tune)
        if (tabOptions) {
          renderOptions.tablature = tabOptions
        }
        if (fitMode !== NOTATION_FIT_VERTICAL) {
          if (!shouldApplyTabOnlyDisplay(getTablatureDisplayTune(tune), tabOptions)) {
            renderOptions.responsive = "resize"
          }
          if (props.staffwidth && props.staffwidth > 0) {
            renderOptions.staffwidth = props.staffwidth
          }
        }
        //var useWarp = props.warp >= 0.25 && props.warp <= 2 ? props.warp : 1
        //tune.tempo = tune.tempo * useWarp
        var abcForRender = abcForAbcjs(props.tunebook.abcTools.json2abc(tune))
        renderedAbcRef.current = abcForRender
        var res = null
        fitAppliedRef.current = false
        if (fitMode === NOTATION_FIT_VERTICAL && !props.hideSvg) {
          // Keep source line breaks (multi-line layout). Narrow staffwidth when
          // height-scaling would overflow width, then scale to fill height.
          var renderEl = inputEl.current
          var paper = measureSingleViewPaper(renderEl)
          var pageStaffWidth = (props.staffwidth && props.staffwidth > 0)
            ? props.staffwidth
            : Math.max(200, paper.availW - 16)
          var verticalFitOptions = getVerticalFitOptions(tune, tabOptions, renderEl)

          function renderAtStaffWidth(staffWidth, renderPass) {
            renderEl.innerHTML = ''
            var attempt = abcjs.renderAbc(renderEl, abcForRender, Object.assign({}, renderOptions, {
              staffwidth: staffWidth,
            }))
            var svg = renderEl.querySelector('svg')
            if (!svg) return null
            const displayTune = getTablatureDisplayTune(tune)
            if (renderPass === 'measure' && shouldApplyTabOnlyDisplay(displayTune, tabOptions)) {
              applyTabOnlyNotationDisplay(renderEl, countActiveTabVoices(tabOptions))
            }
            var dims = readNotationSvgDims(svg)
            if (!dims || !(dims.width > 0) || !(dims.height > 0)) return null
            return { svg: svg, dims: dims, visual: attempt && attempt.length > 0 ? attempt[0] : null }
          }

          var useStaffWidth = pageStaffWidth
          // topAlign alone must not skip the staffwidth search — otherwise
          // notation+lyrics layouts stay page-wide and fail to fill height.
          if (!(verticalFitOptions && verticalFitOptions.preferWidthFit)) {
            var staffFit = findStaffWidthForVerticalFit(function(staffWidth) {
              return renderAtStaffWidth(staffWidth, 'measure')
            }, paper.availW, paper.availH, pageStaffWidth)
            useStaffWidth = Math.min(pageStaffWidth, staffFit.staffWidth)
          }
          var rendered = renderAtStaffWidth(useStaffWidth, 'final')
          if (rendered) {
            const displayTune = getTablatureDisplayTune(tune)
            fitSingleViewVertical(rendered.svg, renderEl, null, verticalFitOptions)
            if (shouldApplyTabOnlyDisplay(displayTune, tabOptions)) {
              finalizeTablatureDisplay(tune, tabOptions)
              fitSingleViewVertical(rendered.svg, renderEl, null, verticalFitOptions)
            } else {
              finalizeTablatureDisplay(tune, tabOptions)
            }
            fitAppliedRef.current = true
            res = rendered.visual ? [rendered.visual] : null
          }
        } else {
          res = abcjs.renderAbc(inputEl.current, abcForRender, renderOptions)
          if (!props.hideSvg) {
            clearNotationFit(inputEl.current.querySelector('svg'), inputEl.current)
          }
          finalizeTablatureDisplay(tune, tabOptions)
        }
            
        var o = res && res.length > 0 ? res[0] : null
        if (o && props.onWarnings) props.onWarnings(o.warnings)
        setVisualObj(o)
        if (props.playbackAbc) {
          try {
            var playbackHolder = document.createElement('div')
            var playbackRes = abcjs.renderAbc(playbackHolder, props.playbackAbc, renderOptions)
            var playbackObj = playbackRes && playbackRes.length > 0 ? playbackRes[0] : null
            setPlaybackVisualObj(playbackObj)
          } catch (playbackErr) {
            setPlaybackVisualObj(null)
          }
        } else {
          setPlaybackVisualObj(null)
        }
               
        if (o) {
            setStarted(true)
            const tuneObj = tune || {}
            const onMidiRoute = !props.mediaController
                || (props.mediaController.isMidiPlaybackRoute && props.mediaController.isMidiPlaybackRoute())
            const practiceAutoPlay = !props.mediaController && (props.autoStart || props.practiceAutoPlay)
            // playbackEngine={false} marks a display-only notation view; the
            // App-level NowPlayingHost owns the midi engine in that case.
            // Mirror cursor builds TimingCallbacks from the on-screen visualObj
            // without priming a second audio player.
            const isPlaybackEngine = props.playbackEngine !== false
            const wantsBackgroundPrime = isPlaybackEngine && (
                props.autoStart
                || practiceAutoPlay
                || (props.mediaController && props.mediaController.hasPlayingIntent
                    && props.mediaController.hasPlayingIntent())
            )
            const hasPendingMidiPlay = !!(props.mediaController
                && props.mediaController.pendingMidiPlayRef
                && props.mediaController.pendingMidiPlayRef.current
                && props.mediaController.hasPlayingIntent
                && props.mediaController.hasPlayingIntent())
            if (isPlaybackEngine && onMidiRoute && hasPendingMidiPlay) {
                startPlayingFromIntent(true)
            } else if (props.autoPrime && onMidiRoute && wantsBackgroundPrime
                // When play intent is already armed (media-settings MIDI), do not
                // start a second createPlayer — that stacks count-ins after reload.
                && !(props.mediaController && props.mediaController.hasPlayingIntent
                    && props.mediaController.hasPlayingIntent())) {
                var primeHash = (tuneObj.transpose || 0) + '-' + (props.meter || tuneObj.meter || '4/4') + '-' + (tuneObj.tempo || 100) + '-' + (tuneObj.playbackFillStyle || 'boom-chick') + '-' + (tuneObj.playbackFillLevel != null ? tuneObj.playbackFillLevel : 100) + '-' + abcTools.getTuneHash(tuneObj)
                if (primeHash !== audioChangedHash) {
                    setAudioChangedHash(primeHash)
                    const autoPrimeGeneration = getPlaybackGeneration()
                    createPlayer(tune, o, { showUiLoading: false }).then(function(p) {
                        if (!isPlaybackGenerationCurrent(autoPrimeGeneration)) return
                        var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                        if (!midiBuffer) {
                            setReady(false)
                            setStarted(false)
                            if (props.mediaController && props.mediaController.hasActivePlaybackIntent
                                && props.mediaController.hasActivePlaybackIntent()) {
                                if (props.mediaController.setTapToPlay) {
                                    props.mediaController.setTapToPlay(true)
                                }
                            } else if (props.mediaController && props.mediaController.abortPlayingIntent) {
                                props.mediaController.abortPlayingIntent()
                            }
                            return
                        }
                        assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                        if (props.mediaController && props.mediaController.hasPlayingIntent && props.mediaController.hasPlayingIntent()
                            && props.mediaController.isMidiPlaybackRoute && props.mediaController.isMidiPlaybackRoute()) {
                            startPlaying(true)
                        } else if (practiceAutoPlay) {
                            startPlaying(true)
                        }
                    }).catch(function(e) {
                        if (e === 'cancelled' || !isPlaybackGenerationCurrent(autoPrimeGeneration)) return
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
      <div className={isMobile ? 'abcjs-large' : ''}>
       {!props.hidePlayer && !props.practiceAutoPlay ? (
         <TempoControl showTempo={showTempo} setShowTempo={setShowTempo} value={tune && tune.tempo != null ? tune.tempo : 100} onChange={function(e) {
          var parsedTune = props.tunebook.abcTools.abc2json(props.abc)
          if (parsedTune && parsedTune.id) {
            parsedTune.tempo = e
            props.tunebook.saveTune(parsedTune)
            updateOnChange()
            if (props.forceRefresh) props.forceRefresh()
          }
        }} />
       ) : null}
       <ReactNoSleep>
            {({ isOn, enable, disable }) => (
              <span >
                 {!props.hidePlayer && !props.practiceAutoPlay && tune ? (
                   <TransposeModal show={showTranspose} setShow={setShowTranspose} tune={tune} saveTune={props.tunebook.saveTune} forceRefresh={props.forceRefresh} />
                 ) : null}
               
                {props.showRepeats && !props.practiceAutoPlay && tune ? <span style={{float:'right'}} >  
                    <RepeatsEditorModal tunebook={props.tunebook} value={tune.repeats} onChange={function(value) {tune.repeats = value; props.tunebook.saveTune(tune)}} playCount={playCount} />
                </span> : null}
                {props.link && tune && tune.id ? <Link style={{color: 'black', textDecoration:'none'}}  to={"/tunes/"+tune.id} ><div id="abc_music_viewer" ref={inputEl} ></div></Link> : null}
                {!props.link ? (
                  <div
                    id={props.hideSvg ? undefined : 'abc_music_viewer'}
                    ref={inputEl}
                    aria-hidden={props.hideSvg ? true : undefined}
                    style={props.hideSvg ? {
                      position: 'absolute',
                      width: 0,
                      height: 0,
                      overflow: 'hidden',
                      opacity: 0,
                      pointerEvents: 'none',
                    } : undefined}
                  />
                ) : null}
              </span>
            )}
        </ReactNoSleep>
        {renderTapToPlayModal()}
      </div>
      );

}
    //function clickPlay(seekTo) {
        //if (playTimerRef && playTimerRef.current) {
            //clearTimeout(playTimerRef.current)
            //playTimerRef.current = null
            //setPlayCount(0)
            ////seekPlayer(0)
            //setSeekTo(seekTo > 0 ? parseInt(seekTo) : 0)
            ////setIsWaiting(true); 
            //setIsPlaying(true);
        //} else {
            //playTimerRef.current = setTimeout(() => {
                //clearTimeout(playTimerRef.current)
                ////setIsWaiting(true); 
                //setIsPlaying(true);
                //playTimerRef.current = null
                
            //}, 500)
        //}
        
    //};

      
  //function bodyClick(enable) { 
    //if (!started) {
      ////setStarted(true)
      //if (enable) enable() // enable no sleep 
      //clickInit()
    //}
  //}
    
  
  //function clickInit(playing) {
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
        //if (isPlaying) {
          //startPlaying()
        //} else {
          //stopPlaying()
        //}
    //}, [isPlaying]); 

  
  //useEffect(() => {
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
 

  //{(props.tempo) ? <span  >
              //{!props.hidePlayer && <AbcPlayButton forceRefresh={props.forceRefresh} tune={tune}  started={started} ready={ready}  isPlaying={isPlaying} setIsPlaying={setIsPlaying} clickInit={function(e) {clickInit(true) }} clickPlay={clickPlay}  clickRecord={clickRecord} clickStopPlaying={stopPlaying} tunebook={props.tunebook} />  }
            //</span> : null}

//{(gaudioContext && gaudioContext.current && !props.hidePlayer) && <input className="abcprogressslider" type="range" min='0' max='1' step='0.0001' value={seekTo} onChange={function(e) {setForceSeekTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}

        //style={{position:'fixed', top: 4, right: 4, zIndex: 66}}   
// onClick={function(e) {bodyClick(enable)}}
