import React, { useEffect, useState, useRef } from "react";
import {useParams} from 'react-router-dom'
import abcjs from "abcjs";
import {Tabs, Tab, Form} from 'react-bootstrap'
import BookMultiSelectorModal from './BookMultiSelectorModal'
import Abc from './Abc'

export default function AbcEditor(props) {
  const [abcText, setAbcText] = useState(props.abc);
  let params = useParams();
  //const inputEl = useRef(null);
  //var inputRefs = []
  const [warnings, setWarnings] = useState([])
  var [saveTimeout, setSaveTimeout] = useState(null)
  //var [tune, setTune] = useState(null)
  //var [noteSaveTimeout, setNoteSaveTimeout] = useState(null)
  var tune = props.tune
  useEffect(() => {
    setAbcText(props.abc);
    //var tune = props.tunebook.abcTools.abc2json(props.abc)
    //setTune(tune)
    //if (tune.voices) {
      //Object.keys(tune.voices).map(function(voice) {
        //const inputEl = useRef(null);
        //inputRefs.push(useRef)
      //})
    //}
  }, [props.abc]);
  
  
  function onWarnings(warnings) {
    setWarnings(warnings)
  }

  //var abcForDisplay = []
  //abcForDisplay.push(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
  
  function tuneNotesChanged(voice,notes) {
    //console.log('change NOTES',voice,tune,tune.voices)
    if (tune && tune.voices && tune.voices.hasOwnProperty(voice)) {
      //console.log('change NOTES',voice,tune,tune.voices)
      var v = props.tunebook.abcTools.justNotes(notes); 
      tune.voices[voice].notes = v.split("\n")
      tune.id = params.tuneId
      props.tunebook.saveTune(tune) 
      //setTune(tune)
      //console.log('SAVE NOTES',tune, voice, notes, v)
    }
  }
    //setAbcTuneNotes(v); 
      //if (tune) {
        //tune.notes = v.split("\n") 
        //tune.id = params.tuneId
        ////setAbcTune(props.tunebook.abcTools.json2abc(tune)) ; 
        ////if (noteSaveTimeout) clearTimeout(noteSaveTimeout)
        ////setNoteSaveTimeout(setTimeout(function() {
          ////console.log('SAVE NOTES TIMEOUT')
          //props.tunebook.saveTune(tune) 
        //}
    //}, 500))
   //}
  //<span style={{fontSize:'0.5em'}} >{tune.key ? <>Key: <b>{tune.key}</b></> : null} {tune.meter ? <>Time Signature: <b>{tune.meter}</b></> : null}</span>
  
  //tempo={tune.tempo > 0 ? tune.tempo : 100} meter={tune.meter}
  if (!tune) {
    return null
  } else {
    return (
        <div>
          <div style={{display: 'none'}}  id="audio">Player</div>
          <Tabs defaultActiveKey="musiceditor" id="uncontrolled-tab-example" className="mb-3">
                  <Tab eventKey="musiceditor" title="Music">
                    <div style={{width:(props.isMobile ? '20%' : '30%'), float:'left'}} >
                      {tune && tune.voices ? <Tabs id="voices-tabs" className="mb-3">
                          {Object.keys(tune.voices).map(function(voice,vk) {
                            return <Tab eventKey={vk} title={vk} ><textarea  key={vk}  value={Array.isArray(tune.voices[voice].notes) ? tune.voices[voice].notes.join("\n") : ''} style={{fontSize:(props.isMobile?'0.8em':'1em'), width:'100%', minHeight: '25em'}} onChange={function(e) {tuneNotesChanged(voice, e.target.value)}}   /></Tab>
                          })}
                      </Tabs> : ''}
                    </div>
                    <div style={{paddingLeft:'0.2em',width:(props.isMobile ? '78%' : '68%'), float:'left'}} >
                       
                       <Abc tunebook={props.tunebook}  abc={props.abc}  onWarnings={onWarnings} tempo={tune && tune.tempo > 0 ? tune.tempo : null} meter={tune.meter} />
                    </div>
                    <div id="lyrics" >{tune.words ? tune.words.map(function(wordLine) {
                      return <div>{wordLine}</div> 
                    }) : ''}</div>
                    
                  </Tab>
                  
                  <Tab eventKey="info" title="Info">
                    <Form>
                      <Form.Group className="mb-3" controlId="title">
                        <Form.Label>Title</Form.Label>
                        <Form.Control type="text" placeholder="" value={tune.name} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} />
                      </Form.Group>

                      <Form.Group className="mb-3" controlId="key">
                        <Form.Label>Key</Form.Label>
                        <Form.Control type="text" value={tune.key} onChange={function(e) {tune.key = e.target.value;tune.id = params.tuneId; props.tunebook.saveTune(tune)  }}/>
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="transpose">
                        <Form.Label>Transpose</Form.Label>
                        <Form.Control type="number" value={tune.transpose ? tune.transpose : ''} onChange={function(e) {tune.transpose = e.target.value;tune.id = params.tuneId; props.tunebook.saveTune(tune)  }}/>
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="rhythm">
                        <Form.Label>Rhythm</Form.Label>
                        <Form.Select value={tune.rhythm} onChange={function(e) {tune.rhythm = e.target.value; tune.meter = props.tunebook.abcTools.timeSignatureFromTuneType(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} >
                          <option value=""></option>
                          {Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type,key) {
                            return <option value={type} key={key} >{type}</option>
                          })}
                        </Form.Select>
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="meter">
                        <Form.Label>Meter</Form.Label>
                        <Form.Control type="text" placeholder="eg 4/4" value={tune.meter} onChange={function(e) {tune.meter = e.target.value; tune.id = params.tuneId; props.tunebook.saveTune(tune)  }}  />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="tempo">
                        <Form.Label>Tempo</Form.Label>
                        <Form.Control type="text" placeholder="eg 100" value={tune.tempo} onChange={function(e) {tune.tempo = e.target.value; tune.id = params.tuneId;  props.tunebook.saveTune(tune)  }}  />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="noteLength">
                        <Form.Label>ABC Note Length</Form.Label>
                        <Form.Select value={tune.noteLength} onChange={function(e) { tune.noteLength = e.target.value; tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} >
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
                      
                      <Form.Group className="mb-3" controlId="tab">
                        <Form.Label>Tablature</Form.Label>
                        <Form.Select value={tune.tablature ? tune.tablature.trim() : ''} onChange={function(e) { tune.tablature = e.target.value ; tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} >
                          <option value=""></option>
                          <option value="guitar" >Guitar</option>
                          <option value="violin">Violin</option>
                          </Form.Select> 
                       
                      </Form.Group>
                      
                    </Form>
                  </Tab>
                  <Tab eventKey="lyrics" title="Lyrics" >
                    <textarea value={Array.isArray(tune.words) ? tune.words.join("\n") : ''} onChange={function(e) {tune.words = e.target.value.split("\n"); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} style={{width:'100%', height:'30em'}}  />
                  </Tab>
                  <Tab eventKey="comments" title="Comments" >
                    <textarea value={Array.isArray(tune.abccomments) ? tune.abccomments.join("\n") : ''} onChange={function(e) {tune.abccomments = e.target.value.split("\n"); tune.id = params.tuneId; props.tunebook.saveTune(tune)  }} style={{width:'100%', height:'30em'}}  />
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
                    <textarea value={abcText} onChange={function(e) {setAbcText(e.target.value)}} onBlur={function(e) {var tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune)}}   style={{width:'100%', height:'30em'}}  />
                  </Tab>
                  <Tab eventKey="help" title="Help">
                      <div>ABC notation uses letters and other symbols to represent music. </div>
                      <div>eg</div>
                      <i>a2bc a/4bc' | c,d,e, cde ||</i>
                      <div></div>
                      <br/>
                      <div>To get up to speed, have a look through a <a href='http://www.lesession.co.uk/abc/abc_notation.htm' target="_new" >tutorial</a></div>
                      <br/>
                      <div>A <a href='http://abc.sourceforge.net/standard/abc2-draft.html' target="_new" >detailed reference</a> is available  </div>
                      <div></div>
                  </Tab>
                
                </Tabs> 
        </div>
    );
    
  }
}
//
//value={abc} onChange={function(e) {saveTune(params.tuneId, props.tunebook.abcTools.abc2json(e.target.value))}}
  //<Tab eventKey="books" title="Books">
                //<span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; saveTune(tune);} } /></span>
              //</Tab>
