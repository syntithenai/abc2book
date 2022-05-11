import React, { useEffect, useState, useRef } from "react";
import {useParams} from 'react-router-dom'
import abcjs from "abcjs";
import {Tabs, Tab, Form} from 'react-bootstrap'
import BookMultiSelectorModal from './BookMultiSelectorModal'
import Abc from './Abc'

export default function AbcEditor(props) {
  const [abcText, setAbcText] = useState(props.abc);
  //var abcTune = props.abc
  let params = useParams();
  const inputEl = useRef(null);
  
  //function setAbcTune(abc) {
    //setAbcTuneInner(abc)
    //var tune = props.tunebook.abcTools.abc2json(abc)
    //setAbcTuneNotes(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
    //setAbcTuneComments(Array.isArray(tune.abcomments) ? tune.abcomments.join("\n") : '')
    //setAbcTuneWords(Array.isArray(tune.words) ? tune.words.join("\n") : '')
    //setTitle(tune.name)
    //setKey(tune.key)
    //setMeter(tune.meter)
    //setNoteLength(tune.noteLength)
    //setRhythmInner(tune.rhythm)
    ////updateErrorCount()
  //}
  var tune = props.tunebook.abcTools.abc2json(props.abc)
  //const [abcTuneNotes, setAbcTuneNotes] = useState(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
  //const [abcTuneComments, setAbcTuneComments] = useState(Array.isArray(tune.abccomments) ? tune.abccomments.join("\n") : '');
  //const [abcTuneWords, setAbcTuneWords] = useState(Array.isArray(tune.words) ? tune.words.join("\n") : '');
  //const [title, setTitle] = useState(props.tunebook.abcTools.ensureText(tune.name))
  //const [key, setKey] = useState(props.tunebook.abcTools.ensureText(tune.key))
  //const [meter, setMeter] = useState(props.tunebook.abcTools.ensureText(tune.meter))
  //const [tempo, setTempo] = useState(props.tunebook.abcTools.ensureText(tune.tempo))
  //const [noteLength, setNoteLengthInner] = useState(props.tunebook.abcTools.ensureText(tune.noteLength,'1/8'))
  //function setNoteLength(val) {
    //setNoteLengthInner(val ? val : '1/8')
  //}
  //const [rhythm, setRhythmInner] = useState(props.tunebook.abcTools.ensureText(tune.rhythm))
  //function setRhythm(val) {
    //setRhythmInner(val)
  //}
  
  const [warnings, setWarnings] = useState([])
  //function updateErrorCount() {
    //var warnings = parseInt(document.getElementById('warnings').children.length / 2)
    //setErrorCount(warnings)
  //}
  //useEffect(function() {
    //updateErrorCount()
  //},[abcTuneNotes])
  
  //useEffect(function() {
    //updateErrorCount()
  //},[])
  
  //useEffect(() => {
    
      ////abcjs.renderAbc(inputEl.current, abcTune, {
        ////add_classes: true,
        ////responsive: "resize",
        ////generateDownload: true
      ////});
      //inputEl && new abcjs.Editor('abc', {
          //canvas_id: "paper",
          //warnings_id: "warnings",
          //synth: {
            //el: "#audio",
            ////options: { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true }
          //},
          //abcjsParams: {
            //add_classes: true,
            //scale: props.isMobile ? '0.4' : '1.2',
            ////clickListener: clickListener
          //},
          ////selectionChangeCallback: selectionChangeCallback
        //});
        //updateErrorCount()
  //}, [abcTune]);

  useEffect(() => {
    console.log('EDITRO UPDATE ABC')
    setAbcText(props.abc);
  }, [props.abc]);
  
  function onWarnings(warnings) {
    //console.log('wwww',warnings)
    setWarnings(warnings)
  }

  var [saveTimeout, setSaveTimeout] = useState(null)
  
  function saveTune(tune) {
    //console.log('save',tune)
      //if (saveTimeout) clearTimeout(saveTimeout)
      //setSaveTimeout(setTimeout(function() {
        //console.log('real save',tune)
        props.tunebook.saveTune(tune)
      //},1000))
  }

//onBlur={handleBlur}
  // blur for most items
  //function handleBlur(e) {
    //var tune = props.tunebook.abcTools.abc2json(abcTune)
    //tune.id = params.tuneId; 
    //saveTune(tune)
  //} 
  
  //function forceAbc(e) { 
    //tune = props.tunebook.abcTools.abc2json(e.target.value);  
    //tune.id = params.tuneId; 
    //saveTune(tune)
  //}
  
  //var tune = props.tunebook.abcTools.abc2json(abcTune)
  var abcForDisplay = []
  //abcForDisplay.push('X: 0')
  //if (tune.key) abcForDisplay.push('K: '+tune.key)
  //if (tune.meter) abcForDisplay.push('M: '+tune.meter)
  //if (tune.noteLength) abcForDisplay.push('L: '+tune.noteLength)
  abcForDisplay.push(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
  
  var [noteSaveTimeout, setNoteSaveTimeout] = useState(null)
  function tuneNotesChanged(e) {
    var v = props.tunebook.abcTools.justNotes(e.target.value); 
    console.log('SAVE NOTES',e.target.value, v)
    //setAbcTuneNotes(v); 
    tune.notes = v.split("\n") 
    tune.id = params.tuneId
    //setAbcTune(props.tunebook.abcTools.json2abc(tune)) ; 
    //if (noteSaveTimeout) clearTimeout(noteSaveTimeout)
    //setNoteSaveTimeout(setTimeout(function() {
      //console.log('SAVE NOTES TIMEOUT')
      props.tunebook.saveTune(tune) 
    //}, 500))
  }
  //<span style={{fontSize:'0.5em'}} >{tune.key ? <>Key: <b>{tune.key}</b></> : null} {tune.meter ? <>Time Signature: <b>{tune.meter}</b></> : null}</span>
  
  //tempo={tune.tempo > 0 ? tune.tempo : 100} meter={tune.meter}
  
  return (
    <div>
      <div style={{display: 'none'}}  id="audio">Player</div>
      <Tabs defaultActiveKey="musiceditor" id="uncontrolled-tab-example" className="mb-3">
              <Tab eventKey="musiceditor" title="Music">
                <div style={{width:(props.isMobile ? '20%' : '30%'), float:'left'}} >
                  <textarea  id="abc" ref={inputEl} value={abcForDisplay.join("\n")} style={{fontSize:(props.isMobile?'0.5em':'0.7em'), width:'100%', minHeight: '25em'}} onChange={tuneNotesChanged}   />
                </div>
                <div style={{paddingLeft:'0.2em',width:(props.isMobile ? '78%' : '68%'), float:'left'}} >
                   
                   <Abc tunebook={props.tunebook}  abc={props.abc}  onWarnings={onWarnings} />
                </div>
                <div id="lyrics" >{tune.words ? tune.words.map(function(wordLine) {
                  return <div>{wordLine}</div> 
                }) : ''}</div>
                
              </Tab>
              
              <Tab eventKey="info" title="Info">
                <Form>
                  <Form.Group className="mb-3" controlId="title">
                    <Form.Label>Title</Form.Label>
                    <Form.Control type="text" placeholder="" value={tune.name} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; saveTune(tune)  }} />
                  </Form.Group>

                  <Form.Group className="mb-3" controlId="key">
                    <Form.Label>Key</Form.Label>
                    <Form.Control type="text" value={tune.key} onChange={function(e) {tune.key = e.target.value;tune.id = params.tuneId; saveTune(tune)  }}/>
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="rhythm">
                    <Form.Label>Rhythm</Form.Label>
                    <Form.Select value={tune.rhythm} onChange={function(e) {tune.rhythm = e.target.value; tune.meter = props.tunebook.abcTools.timeSignatureFromTuneType(e.target.value); tune.id = params.tuneId; saveTune(tune)  }} >
                      <option value=""></option>
                      {Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type,key) {
                        return <option value={type} key={key} >{type}</option>
                      })}
                    </Form.Select>
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="meter">
                    <Form.Label>Meter</Form.Label>
                    <Form.Control type="text" placeholder="eg 4/4" value={tune.meter} onChange={function(e) {tune.meter = e.target.value; tune.id = params.tuneId; saveTune(tune)  }}  />
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="tempo">
                    <Form.Label>Tempo</Form.Label>
                    <Form.Control type="text" placeholder="eg 100" value={tune.tempo} onChange={function(e) {tune.tempo = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                  </Form.Group>
                  
                  <Form.Group className="mb-3" controlId="noteLength">
                    <Form.Label>Note Length</Form.Label>
                    <Form.Select value={tune.noteLength} onChange={function(e) { tune.noteLength = e.target.value; tune.id = params.tuneId; saveTune(tune)  }} >
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
                <textarea value={Array.isArray(tune.words) ? tune.words.join("\n") : ''} onChange={function(e) {tune.words = e.target.value.split("\n"); tune.id = params.tuneId; saveTune(tune)  }} style={{width:'100%', height:'20em'}}  />
              </Tab>
              <Tab eventKey="comments" title="Comments" >
                <textarea value={Array.isArray(tune.abcomments) ? tune.abcomments.join("\n") : ''} onChange={function(e) {tune.abccomments = e.target.value.split("\n"); tune.id = params.tuneId; saveTune(tune)  }} style={{width:'100%', height:'20em'}}  />
              </Tab>
              <Tab eventKey="errors" title={<span>Errors {(warnings && warnings.length > 0 ? warnings.length+' !!' : '')} </span>} >
                <div style={{}} id="warnings">
                {warnings ? warnings.map(function(warning,wk) {
                  var pos = warning.indexOf('<span')
                  return <div key={wk} >{warning.slice(0,pos)}</div>
                }) : null}
                </div>
              </Tab>
              <Tab eventKey="abc" title="ABC">
                <textarea value={abcText} onChange={function(e) {setAbcText(e.target.value)}} onBlur={function(e) {var tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; saveTune(tune)}}   style={{width:'100%', height:'20em'}}  />
              </Tab>
            
            </Tabs> 
    </div>
  );
}
//
//value={abc} onChange={function(e) {saveTune(params.tuneId, props.tunebook.abcTools.abc2json(e.target.value))}}
  //<Tab eventKey="books" title="Books">
                //<span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; saveTune(tune);} } /></span>
              //</Tab>
