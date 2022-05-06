import React, { useEffect, useState, useRef } from "react";
import {useParams} from 'react-router-dom'
import abcjs from "abcjs";
import {Tabs, Tab, Form} from 'react-bootstrap'
import BookMultiSelectorModal from './BookMultiSelectorModal'

export default function AbcEditor(props) {
  const [abcTune, setAbcTuneInner] = useState(props.abc);
  function setAbcTune(abc) {
    setAbcTuneInner(abc)
    var tune = props.tunebook.abcTools.abc2json(abc)
    setAbcTuneNotes(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
    setAbcTuneComments(Array.isArray(tune.abcomments) ? tune.abcomments.join("\n") : '')
    setAbcTuneWords(Array.isArray(tune.words) ? tune.words.join("\n") : '')
    setTitle(tune.name)
    setKey(tune.key)
    setMeter(tune.meter)
    setNoteLength(tune.noteLength)
    setRhythmInner(tune.rhythm)
    //updateErrorCount()
  }
  var tune = props.tunebook.abcTools.abc2json(props.abc)
  const [abcTuneNotes, setAbcTuneNotes] = useState(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
  const [abcTuneComments, setAbcTuneComments] = useState(Array.isArray(tune.abccomments) ? tune.abccomments.join("\n") : '');
  const [abcTuneWords, setAbcTuneWords] = useState(Array.isArray(tune.words) ? tune.words.join("\n") : '');
  const [title, setTitle] = useState(props.tunebook.abcTools.ensureText(tune.name))
  const [key, setKey] = useState(props.tunebook.abcTools.ensureText(tune.key))
  const [meter, setMeter] = useState(props.tunebook.abcTools.ensureText(tune.meter))
  const [tempo, setTempo] = useState(props.tunebook.abcTools.ensureText(tune.tempo))
  const [noteLength, setNoteLengthInner] = useState(props.tunebook.abcTools.ensureText(tune.noteLength,'1/8'))
  function setNoteLength(val) {
    setNoteLengthInner(val ? val : '1/8')
  }
  const [rhythm, setRhythmInner] = useState(props.tunebook.abcTools.ensureText(tune.rhythm))
  function setRhythm(val) {
    setRhythmInner(val)
  }
  const [otherMeta, setOtherMeta] = useState('')
  const [errorCount,setErrorCount] = useState(0)
  
  function updateErrorCount() {
    var warnings = parseInt(document.getElementById('warnings').children.length / 2)
    setErrorCount(warnings)
  }
  useEffect(function() {
    updateErrorCount()
  },[abcTuneNotes])
  
  useEffect(function() {
    updateErrorCount()
  },[])
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
            scale: props.isMobile ? '0.4' : '1.2',
            //clickListener: clickListener
          },
          //selectionChangeCallback: selectionChangeCallback
        });
        updateErrorCount()
  }, [abcTune]);

  useEffect(() => {
    setAbcTune(props.abc);
  }, [props.abc]);


//onBlur={handleBlur}
  function handleBlur(e) {
    var tune = props.tunebook.abcTools.abc2json(abcTune)
    tune.id = params.tuneId; props.tunebook.saveTune(tune)
  } 
  
  //useEffect(() => {
    //if (isPlaying) {
      ////if (timingCallbacks) timingCallbacks.reset()
      ////setTimingCallbacks(new abcjs.TimingCallbacks(visualObj, {
        ////beatCallback: beatCallback,
        ////eventCallback: eventCallback,
        ////qpm: getTempo()
      ////}));
      //startPlaying()
    //} else {
      ////if (timingCallbacks) timingCallbacks.pause()
      ////setTimingCallbacks(null)
      //stopPlaying()
    //}
  //}, [isPlaying]); 

  
  var tune = props.tunebook.abcTools.abc2json(abcTune)
  var abcForDisplay = []
  //abcForDisplay.push('X: 0')
  //if (tune.key) abcForDisplay.push('K: '+tune.key)
  //if (tune.meter) abcForDisplay.push('M: '+tune.meter)
  //if (tune.noteLength) abcForDisplay.push('L: '+tune.noteLength)
  abcForDisplay.push(abcTuneNotes)
  
  return (
    <div>
      <div style={{display: 'none'}}  id="audio">Player</div>
      <Tabs defaultActiveKey="musiceditor" id="uncontrolled-tab-example" className="mb-3">
              <Tab eventKey="musiceditor" title="Music">
                <div style={{width:(props.isMobile ? '20%' : '30%'), float:'left'}} >
                  <textarea  id="abc" ref={inputEl} value={abcForDisplay.join("\n")} style={{fontSize:(props.isMobile?'0.5em':'1em'), width:'100%', minHeight: '25em'}} onChange={function(e) {var v = props.tunebook.abcTools.justNotes(e.target.value); setAbcTuneNotes(v); tune.notes = v.split("\n"); setAbcTune(props.tunebook.abcTools.json2abc(tune)) ; tune.id = params.tuneId; props.tunebook.saveTune(tune) }}   />
                </div>
                <div style={{paddingLeft:'0.2em',width:(props.isMobile ? '78%' : '68%'), float:'left'}} >
                  <div style={{height:'1.4em', fontSize:'0.6em'}}  >Key: <b>{tune.key}</b> Time Signature: <b>{tune.meter}</b></div>
                  <div id="paper" style={{width:'100%' }}></div>
                </div>
                <div id="lyrics" >{tune.words ? tune.words.map(function(wordLine) {
                  return <div>{wordLine}</div> 
                }) : ''}</div>
                
              </Tab>
              
              <Tab eventKey="info" title="Info">
                <Form>
                  <Form.Group className="mb-3" controlId="title">
                    <Form.Label>Title</Form.Label>
                    <Form.Control type="text" placeholder="" value={title} onChange={function(e) {setTitle(e.target.value);  tune.name = e.target.value; setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} />
                  </Form.Group>

                  <Form.Group className="mb-3" controlId="key">
                    <Form.Label>Key</Form.Label>
                    <Form.Control type="text" value={key} onChange={function(e) {setKey(e.target.value); tune.key = e.target.value; setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }}/>
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="rhythm">
                    <Form.Label>Rhythm</Form.Label>
                    <Form.Select value={rhythm} onChange={function(e) {setRhythm(e.target.value); setMeter(props.tunebook.abcTools.timeSignatureFromTuneType(e.target.value));  tune.rhythm = e.target.value; tune.meter = props.tunebook.abcTools.timeSignatureFromTuneType(e.target.value); setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} >
                      <option value=""></option>
                      {Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type) {
                        return <option value={type} >{type}</option>
                      })}
                    </Form.Select>
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="meter">
                    <Form.Label>Meter</Form.Label>
                    <Form.Control type="text" placeholder="eg 4/4" value={meter} onChange={function(e) {setMeter(e.target.value);   tune.meter = e.target.value; setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }}  />
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="tempo">
                    <Form.Label>Tempo</Form.Label>
                    <Form.Control type="text" placeholder="eg 100" value={tempo} onChange={function(e) {setTempo(e.target.value);   tune.tempo = e.target.value; setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId;  props.tunebook.saveTune(tune)  }}  />
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="noteLength">
                    <Form.Label>Note Length</Form.Label>
                    <Form.Select value={noteLength} onChange={function(e) {setNoteLength(e.target.value);   tune.noteLength = e.target.value;  setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} >
                      <option value=""></option>
                      <option value="1">1</option>
                      <option value="1/2">1/2</option>
                      <option value="1/3">1/3</option>
                      <option value="1/4">1/4</option>
                      <option value="1/6">1/6</option>
                      <option value="1/8">1/8</option>
                      <option value="1/12">1/12</option>
                      <option value="1/16">1/16</option>
                     </Form.Select> 
                   
                  </Form.Group>
                  
                </Form>
              </Tab>
              <Tab eventKey="lyrics" title="Lyrics" >
                <textarea value={abcTuneWords} onChange={function(e) {setAbcTuneWords(e.target.value);  tune.words = e.target.value.split("\n"); setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} style={{width:'100%', height:'20em'}}  />
              </Tab>
              <Tab eventKey="comments" title="Comments" >
                <textarea value={abcTuneComments} onBlur={handleBlur} onChange={function(e) {setAbcTuneComments(e.target.value);  tune.abccomments = e.target.value.split("\n"); setAbcTune(props.tunebook.abcTools.json2abc(tune)); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} style={{width:'100%', height:'20em'}}  />
              </Tab>
              <Tab eventKey="errors" title={<span>Errors {(errorCount > 0 ? errorCount+' !!' : '')} </span>} >
                <div style={{maxHeight:'4em', overflow: 'scroll'}} id="warnings"></div>
              </Tab>
              <Tab eventKey="abc" title="ABC">
                <textarea value={abcTune} onChange={function(e) {setAbcTune(e.target.value); tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune)}} style={{width:'100%', height:'20em'}}  />
              </Tab>
            
            </Tabs> 
    </div>
  );
}
//value={abc} onChange={function(e) {props.tunebook.saveTune(params.tuneId, props.tunebook.abcTools.abc2json(e.target.value))}}
  //<Tab eventKey="books" title="Books">
                //<span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; props.tunebook.saveTune(tune);} } /></span>
              //</Tab>
