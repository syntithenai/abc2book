import React, { useEffect, useState, useRef } from "react";
import {useParams} from 'react-router-dom'
import abcjs from "abcjs";
export default function AbcEditor(props) {
  const [abcTune, setAbcTune] = useState(props.abc);
  const inputEl = useRef(null);
  let params = useParams();
  useEffect(() => {
    
      //abcjs.renderAbc(inputEl.current, abcTune, {
        //add_classes: true,
        //responsive: "resize",
        //generateDownload: true
      //});
      inputEl && new abcjs.Editor('abc', {
          canvas_id: "paper",
          warnings_id: "warnings",
          synth: {
            el: "#audio",
            //options: { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true }
          },
          abcjsParams: {
            add_classes: true,
            //clickListener: clickListener
          },
          //selectionChangeCallback: selectionChangeCallback
        });
  }, [abcTune]);

  useEffect(() => {
    setAbcTune(props.abc);
  }, [props.abc]);

  function handleBlur(e) {
    var tune = props.tunebook.abcTools.abc2json(e.target.value)
    tune.id = params.tuneId
    props.tunebook.saveTune(tune)
  } 

  return (
    <div>
      <div style={{display: 'none'}}  id="audio">Player</div>
      <div style={{maxHeight:'4em', overflow: 'scroll'}} id="warnings"></div>
      <textarea  id="abc" ref={inputEl} value={abcTune} style={{width:'100%', minHeight: '7em'}} onChange={function(e) {setAbcTune(e.target.value); }}  onBlur={handleBlur} />
        
      <div id="paper" ></div>
      
    </div>
  );
}
//value={abc} onChange={function(e) {props.tunebook.saveTune(params.tuneId, props.tunebook.abcTools.abc2json(e.target.value))}}
