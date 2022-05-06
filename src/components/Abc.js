import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Button } from 'react-bootstrap'
import useAbcTools from '../useAbcTools'
// TODO multiple clicks on play/stop then leaving state in playing results in multiple playback
import ReactNoSleep from 'react-no-sleep';

export default function Abc(props) {
  const [abcTune, setAbcTune] = useState(props.abc);
  var abcTools = useAbcTools()
  const inputEl = useRef(null);
  
  useEffect(() => {
    setAbcTune(props.abc);
    //if (props.setReady) props.setReady(false)
    //setMidiBuffer(new abcjs.synth.CreateSynth())
  }, [props.abc]);
  
  
  return (
   <ReactNoSleep>
        {({ isOn, enable, disable }) => (
          
          <div onClick={function(e) {console.log('nosleep active'); enable()}}>
          
            <div id="abc_music_viewer" ref={inputEl}></div>
          </div>
        )}
    </ReactNoSleep>
  );
}
