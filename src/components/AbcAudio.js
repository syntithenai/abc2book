import {useState, useEffect, cloneElement} from 'react'
import {Button} from 'react-bootstrap'
export default function AbcAudio(props) {
    console.log(props)
    let [isPlaying, setIsPlaying] = useState(false)
    let [isWaiting, setIsWaiting] = useState(false)
    let [seekTo, setSeekTo] = useState(false)
    let [prevent, setPrevent] = useState(false)
    var [ready, setReady] = useState(false)
    var [midiBuffer, setMidiBuffer] = useState(null)
    var [visualObj, setVisualObj] = useState(null)
    var [timingCallbacks, setTimingCallbacks] = useState(null)
    var [cursor,setCursor] = useState(null)
    var [repeat,setRepeat] = useState(null)
    //var [seekTo,setSeekTo] = useState(0)

  
    function setForceStop(val) {
        localStorage.setItem('bookstorage_forcestop',(val ? 'true' : 'false'))
    }
    function getForceStop() {
        return localStorage.getItem('bookstorage_forcestop') === 'true' ? true : false
    }
    setForceStop(false)

  
    var timer
    function onClickHandler() {
        if (timer) {
            clearTimeout(timer)
            timer = null
            if (midiBuffer) midiBuffer.stop()
            if (timingCallbacks) timingCallbacks.stop()
            setSeekTo(0)
            setIsWaiting(true); 
            setIsPlaying(true);
        } else {
            timer = setTimeout(() => {
                clearTimeout(timer)
                timer = null
                setIsWaiting(true); 
                setIsPlaying(true);
            }, 500)
        }
        
    };

        
    function audioCallback(event) {
        console.log('cab',event)
        if (event ==='ended' || event ==='error' || event === 'stop') {
            setIsPlaying(false)
            setIsWaiting(false)
        } else if (event === 'started') {
            setIsWaiting(false)
        } else if (event === 'ready') {
            setReady(true)
        } 
    }
    
    function getTempo(tune) {
        return (props.tunebook.tempo > 0 ? props.tunebook.tempo : (props.tunebook.abcTools.getTempo(tune) > 0 ? props.tunebook.abcTools.getTempo(tune) : 100))
    }
    
    
 
  function startPrimedTune(midiBuffer) {
    audioCallback('ready')
    setReady(true)
    // At this point, everything slow has happened. midiBuffer.start will return very quickly and will start playing very quickly without lag.
    var emergencyStop = getForceStop()
    if (!emergencyStop) {
      if (midiBuffer) {
          if (seekTo > 0) midiBuffer.seek(seekTo)
          midiBuffer.start()
          startPlayingHook()
      }
      if (props.audioCallback) props.audioCallback('started')
    } else {
      stopPlaying()
    }
  }
  
  
   
  function startPlaying() {
    
    if (getMidiBuffer()) {
      getMidiBuffer().start();
      if (getTimingCallbacks()) {
        //timingCallbacks.setProgress(0)
        getTimingCallbacks().start();
      } else {
        //if (visualObj) {
          //setTimingCallbacks(new abcjs.TimingCallbacks(visualObj, {
            //beatCallback: beatCallback,
            //eventCallback: eventCallback,
            //qpm: getTempo()
          //}));
        //}
      }
      if (props.audioCallback) props.audioCallback('started')
    } else {
      if (props.audioCallback) props.audioCallback('start')
      setForceStop(false)
      if (props.setSeekTo) props.setSeekTo(0)
      console.log('start',props.audioContext, getMidiBuffer())
      //props.tunebook.utils.primeAudio(props.audioCallback, props.setReady).then(function(audioContext) {
        //console.log('start audio primed')
      if (props.audioContext && getMidiBuffer()) {
          console.log('tune primed')
          startPrimedTune(getMidiBuffer())
      }
        //}).catch(function(e) {
        //console.log(e)
      //})
      
    }
  }
    
  function stopPlaying()  {
    if (timingCallbacks) timingCallbacks.pause();
    if (midiBuffer) midiBuffer.pause();
    audioCallback('stop')
    setForceStop(true)
  }
  
  function finishPlaying() {
    audioCallback('finished')
  }
  
  //function getTempo() {
    //return props.tempo > 0 ? props.tempo : 100
  //}
  
  
  function createCursor() {
    var svg = document.querySelector("#abc_music_viewer svg");
    cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
    cursor.setAttribute("class", "abcjs-cursor");
    cursor.setAttributeNS(null, 'x1', 0);
    cursor.setAttributeNS(null, 'y1', 0);
    cursor.setAttributeNS(null, 'x2', 0);
    cursor.setAttributeNS(null, 'y2', 0);
    svg.appendChild(cursor);
    setCursor(cursor)
    return cursor;
  }
  
  function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
    //console.log('BC',currentBeat,totalBeats,lastMoment,position, debugInfo, getMidiBuffer())
      var x1, x2, y1, y2;
      if (currentBeat === totalBeats) {
        x1 = 0;
        x2 = 0;
        y1 = 0;
        y2 = 0;
      } else {
        x1 = position.left - 2;
        x2 = position.left - 2;
        y1 = position.top;
        y2 = position.top + position.height;
      }
      cursor.setAttribute("x1", x1);
      cursor.setAttribute("x2", x2);
      cursor.setAttribute("y1", y1);
      cursor.setAttribute("y2", y2);
      colorElements([]);
    
  }
  
  var lastEls = [];
  
  function colorElements(els) {
    var i;
    var j;
    for (i = 0; i < lastEls.length; i++) {
      for (j = 0; j < lastEls[i].length; j++) {
        lastEls[i][j].classList.remove("color");
      }
    }
    for (i = 0; i < els.length; i++) {
      for (j = 0; j < els[i].length; j++) {
        els[i][j].classList.add("color");
      }
    }
    lastEls = els;
  }
  
  function eventCallback(ev) {
    if (!ev) {
      return;
    }
    //console.log('evcb',ev.milliseconds, getMidiBuffer())
    if (midiBuffer && midiBuffer.duration > 0) {
      var newSeek = ev.milliseconds/(midiBuffer.duration * 1000)
      setSeekTo(newSeek)
    }
    colorElements(ev.elements);
  }

  //function getMeasureNumber(abcNotes, line,lineMeasure) {
    //var tally = 0
    //var lines = abcNotes.split("\n")
    //var notes = abcjs.extractMeasures(abcNotes)
  //}

  function clickListener(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
    console.log('cclick',drag)
    //abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    ////  drag.index/drag.max, analysis, abcelem, 'M',midiBuffer,'T',timingCallbacks)
    var toProgress = drag.index/drag.max
    console.log('cclick',toProgress)
    //setSeekTo(toProgress)
    var notes = abcjs.extractMeasures(props.abc)
    console.log('notes',notes[0].measures, analysis.line, analysis.line, analysis.measure)
    ////var tally = notes.measures.map(function() 
    ////var measureNumber = analysis.line
    ////stopPlaying()
    //if (midiBuffer) {
      ////midiBuffer.pause();
      //midiBuffer.seek(toProgress);
    //}
    //if (timingCallbacks) {
      ////timingCallbacks.pause()
      //timingCallbacks.setProgress(toProgress)
    //}
  }
  
  
  function primeTune(audioContext, visualObj, milliSecondsPerMeasure) {
      return new Promise(function(resolve,reject) {
          //console.log('prime tune', milliSecondsPerMeasure)
          var midiBuffer
          if (midiBuffer) {
              midiBuffer.stop();
          } else {
              midiBuffer = new abcjs.synth.CreateSynth()
              setMidiBuffer(midiBuffer)
          }
        
          if (visualObj) {
            audioCallback('startok')
            var count = 0
            
            function onEnded(d) {
              if (audioCallback) audioCallback('ended')
              //if (repeat) {
                //getMidiBuffer().seek(0);
                //startPlaying()
              //} else {
                //// HACK onEnded is called twice so skip first invocation
                ////count = count + 1;
                //// TODO USE THIS HOOK TO START NEXT TRACK IF PLAY ALL trackId IS ACTIVE
                ////if (count > 1) {
                  ////console.log('dddf',getMidiBuffer().duration, audioContext.currrentTime, audioContext,  audioContext.state)
                  //finishPlaying()
                  //onEnded = null
                ////}
              //}
            }
            var mpm = milliSecondsPerMeasure ? milliSecondsPerMeasure  : visualObj.millisecondsPerMeasure()
            var initOptions = {
              visualObj: visualObj,
              audioContext: props.audioContext,
              millisecondsPerMeasure:  mpm,
              options: {
                onEnded: onEnded
              }
            }
            //console.log('prime tune', initOptions)
            if (midiBuffer) {
                return midiBuffer.init(initOptions).then(function (response) {
                  if (audioCallback) audioCallback('init')
                  //console.log('prime tune init')
                  // midiBuffer.prime actually builds the output buffer.
                    return midiBuffer.prime();
                }).then(function (response) {
                  console.log('prime tune inited')
                  audioCallback('ready')
                  resolve(midiBuffer)
                }).catch(function (error) {
                  audioCallback('error')
                  console.warn("synth error", error);
                });
            } else {
                resolve(null)
            }
          } else {
              resolve(null)
          }
      })
  }
    
    
  function createPlayer(visualObj) {
    console.log('tune update have visual obj', visualObj)
        
    if (visualObj) {
        console.log('add timingddd', getTempo(), props.tempo)
        if (props.audioContext) {
            var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
              beatCallback: beatCallback,
              eventCallback: eventCallback,
              qpm: getTempo()
            })
            var cursor = createCursor()
            console.log('tune update have audio context')
            setReady(false)
            renderActive = true
            
            console.log('PPPRIME', getTempo(), props.milliSecondsPerMeasure, props.repeat, props.audioCallback)
            
            primeTune(props.audioContext, visualObj).then(function(midiBuffer, timingCallbacks, cursor) {
                setMidiBuffer(midiBuffer)
                setTimingCallbacks(timingCallbacks)
                setCursor(cursor)
                renderActive = false
                setReady(true)
                console.log('tune update primed')
            }).catch(function(e) {
                console.log(e)
            })
        }
    }
  }
  
   // COMPONENT RENDER and UPDATE
  var renderActive = false  
  useEffect(() => {
        createPlayer(visualObj)
       //setSeekTo(0)
   }}, [visualObj, props.audioContext, props.tempo]);


    //useEffect(() => {
        //createPlayer()
        ////stopPlaying()
        ////setSeekTo(0)
    //}, [props.tempo]);

    function seekPlayerTo(seekTo) {
        setSeekTo(seekTo)
        if (midiBuffer) midiBuffer.seek(seekTo);
        if (timingCallbacks) {
          timingCallbacks.setProgress(seekTo)
        }
    }
    
    useEffect(() => {
        seekPlayerTo(seekTo)
    }, [seekTo]);

    useEffect(() => {
        if (isPlaying) {
          startPlaying()
        } else {
          stopPlaying()
        }
    }, [isPlaying]); 

    
    
    var buttons = <span>{!ready && <>
                    {!isPlaying && <Button  className='btn-secondary' style={{float:'right'}} >{props.tunebook.icons.timer}{props.tunebook.icons.start}</Button>}
                    {isPlaying && <Button className='btn-secondary' style={{float:'right'}}  >{isWaiting && <span  >{props.tunebook.icons.timer}</span>} {props.tunebook.icons.stop}</Button>}
                </>}
                {ready && <>
                    {!isPlaying && <Button  className='btn-success' style={{float:'right'}} onClick={function(e) {onClickHandler() }} >{props.tunebook.icons.start}</Button>}
                    {isPlaying && <Button className='btn-danger' style={{float:'right'}} onClick={function(e) {setIsPlaying(false)}} >{isWaiting && <span  >{props.tunebook.icons.timer}</span>} {props.tunebook.icons.stop}</Button>}
                </>}</span>
    
    
    return <div>
        {props.children ? cloneElement(props.children, Object.assign({},props,{audioProps:{buttons,getTempo,audioCallback, isPlaying, isWaiting, setIsPlaying, setIsWaiting, seekTo, setSeekTo, ready, setReady, midiBuffer, setMidiBuffer, visualObj, setVisualObj, timingCallbacks, setTimingCallbacks, cursor,setCursor, repeat, setRepeat}}))  : null}
    </div>
    
  
}
