import React, { useEffect, useState, useRef } from "react";
import {useParams} from 'react-router-dom'
import abcjs from "abcjs";
import {Container, Row, Col, Tabs, Tab, Form, Button} from 'react-bootstrap'
import BookMultiSelectorModal from './BookMultiSelectorModal'
import Abc from './Abc'
import ChordsWizard from './ChordsWizard'

export default function AbcEditor(props) {
  const [abcText, setAbcText] = useState(props.abc);
  const [currentVoice, setCurrentVoice] = useState(0);
  let params = useParams();
  // 10 voices supported in textarea selection by click
  const textareaRef_0 = useRef(null);
  const textareaRef_1 = useRef(null);
  const textareaRef_2 = useRef(null);
  const textareaRef_3 = useRef(null);
  const textareaRef_4 = useRef(null);
  const textareaRef_5 = useRef(null);
  const textareaRef_6 = useRef(null);
  const textareaRef_7 = useRef(null);
  const textareaRef_8 = useRef(null);
  const textareaRef_9 = useRef(null);
  var refs = {textareaRef_0, textareaRef_1, textareaRef_2, textareaRef_3, textareaRef_4, textareaRef_5, textareaRef_6, textareaRef_7, textareaRef_8, textareaRef_9}
  
  //var inputRefs = []
  const [warnings, setWarnings] = useState([])
  var [saveTimeout, setSaveTimeout] = useState(null)
  const [noteEditorWidth, setNoteEditorWidth] = useState(2)
  var [chordsChanged, setChordsChanged] = useState(false)
   
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
    //return function() {
        //console.log('UNLOAD',chordsChanged)
    //}
  }, [props.abc]);
  
  
  function onWarnings(warnings) {
    setWarnings(warnings)
  }

  function saveTune(tune) {
    //console.log('savetune',tune)
     try {
      props.pushHistory(tune)
     } catch (e) {
       console.log(e)
     }
     return props.tunebook.saveTune(tune)
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
      saveTune(tune) 
      //setTune(tune)
      //console.log('SAVEd NOTES',tune, voice, notes, v)
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
  
  function onAbcClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
    // relative to entire ABC file
    
    console.log('onabcclick select text', abcelem.startChar, abcelem.endChar,abcelem.currentTrackMilliseconds, "V",analysis.voice, 'line meas',analysis.line, analysis.measure,'Drag', drag.index, drag.max, abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    var voice = analysis.voice
    setCurrentVoice(voice)
    console.log('ddsetvoice',voice, tune)
    if (tune && tune.voices) {
      var voiceNames = Object.keys(tune.voices)
      var voiceName = voiceNames.length > voice ? voiceNames[voice] : null
      if (voiceName) {
        var voiceParts =  abcText.split("\nV:"+voiceName)
        console.log(voiceParts)
        if (voiceParts.length > 1) {
          var voiceInnerParts = voiceParts[1].split("\n")
          if (voiceInnerParts.length > 1) {
            var splitOffset = voiceName.length + 3
            var before = voiceParts[0].length + voiceInnerParts[0].length + splitOffset
            console.log('letter before start of voice',before, abcelem.startChar, abcelem.endChar)
            if (refs['textareaRef_'+voice] && refs['textareaRef_'+voice].current) {
              console.log(refs['textareaRef_'+voice].current)
              setTimeout(function() {
                refs['textareaRef_'+voice].current.setSelectionRange(abcelem.startChar - before , abcelem.endChar - before );
                refs['textareaRef_'+voice].current.focus();
              }, 200)
            } 
            //else console.log('noref')
          }
        }
      }
      //var startClickInWholeAbc = abcelem.startChar
      //var endClickInWholeAbc = abcelem.endChar
      //var keyLineStart = abcText.indexOf("\nK:")
    }
    
  }
  
  function addVoice() {
    var numVoices = Object.keys(tune.voices).length
    var key = (numVoices + 1) + ''
    tune.voices[key] = {meta:"", notes:''}
    //console.log('addvoice',numVoices,tune)
    saveTune(tune)
    props.forceRefresh()
  }


  function deleteVoice(key) {
    delete tune.voices[key]
    //var numVoices = Object.keys(tune.voices).length
    //var key = (numVoices + 1) + ''
    //tune.voices[key] = {meta:"", notes:''}
    //console.log('delvoice',key)
    saveTune(tune)
    props.forceRefresh()
  }
  
  //tempo={tune.tempo > 0 ? tune.tempo : 100} meter={tune.meter}
  if (!tune) {
    return null
  } else {
    return (
        <div style={{minHeight: '40em'}} >
          <div style={{display: 'none'}}  id="audio">Player</div>
          <Tabs defaultActiveKey="musiceditor" id="uncontrolled-tab-example" className="mb-3">
                  <Tab eventKey="musiceditor" title="Music">
                      <Row style={{width:'100%'}}>
                        <Col xs={12} md={6}>
                          <Abc audioRenderTimeout={30000}  tunebook={props.tunebook}  abc={props.abc}  onWarnings={onWarnings} distempo={tune && tune.tempo > 0 ? tune.tempo : null} showTempoSlider={true} editableTempo={true}  meter={tune.meter} onClick={onAbcClick} />
                        </Col>
                        <Col xs={12} md={6}>
                          <Button style={{float:'left', marginRight:'0.2em'}}  variant="success" size="sm" onClick={addVoice} >+</Button>
                          {tune && tune.voices ? <Tabs id="voices-tabs" className="mb-3" activeKey={currentVoice}
                          onSelect={(k) => setCurrentVoice(k)}>
                              {Object.keys(tune.voices).map(function(voice,vk) {
                                return <Tab  key={vk}  eventKey={vk}  title={voice} ><textarea onFocus={function() {setNoteEditorWidth('8')}} onBlur={function() {setNoteEditorWidth('2')}}  ref={refs['textareaRef_'+vk]} value={Array.isArray(tune.voices[voice].notes) ? tune.voices[voice].notes.join("\n") : ''} style={{resize:'both', fontSize:(props.isMobile?'0.8em':'1em'), minHeight: '25em', zIndex: '9999', backgroundColor: 'white', width:'100%'}} onChange={function(e) {tuneNotesChanged(voice, e.target.value)}}   /></Tab>
                              })}
                          </Tabs> : ''}
                        </Col>
                      </Row>
                    
                  
                    
                    
                    
                  </Tab>
                  
                  <Tab eventKey="info" title="Info">
                    <Form>
                      <Form.Group className="mb-3" controlId="title">
                        <Form.Label>Title</Form.Label>
                        <Form.Control type="text" placeholder="" value={tune.name ? tune.name : ''} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; saveTune(tune)  }} />
                      </Form.Group>
                      <Form.Group className="mb-3" controlId="title">
                        <Form.Label>Composer</Form.Label>
                        <Form.Control type="text" placeholder="" value={tune.composer ? tune.composer : ''} onChange={function(e) {tune.composer = e.target.value;  tune.id = params.tuneId; saveTune(tune)  }} />
                      </Form.Group>

                      <Form.Group className="mb-3" controlId="key">
                        <Form.Label>Key</Form.Label>
                        <Form.Control type="text" value={tune.key ? tune.key : ''} onChange={function(e) {tune.key = e.target.value;tune.id = params.tuneId; saveTune(tune)  }}/>
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="transpose">
                        <Form.Label>Transpose</Form.Label>
                        <Form.Control type="number" value={tune.transpose ? tune.transpose : ''} onChange={function(e) {tune.transpose = e.target.value;tune.id = params.tuneId; saveTune(tune)  }}/>
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="rhythm">
                        <Form.Label>Rhythm</Form.Label>
                        <Form.Select value={tune.rhythm ? tune.rhythm : ''} onChange={function(e) {tune.rhythm = e.target.value; tune.meter = props.tunebook.abcTools.timeSignatureFromTuneType(e.target.value); tune.id = params.tuneId; saveTune(tune)  }} >
                          <option value=""></option>
                          {Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type,key) {
                            return <option value={type} key={key} >{type}</option>
                          })}
                        </Form.Select>
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="meter">
                        <Form.Label>Time Signature</Form.Label>
                        <Form.Control type="text" placeholder="eg 4/4" value={tune.meter ? tune.meter : ''} onChange={function(e) {tune.meter = e.target.value; tune.id = params.tuneId; saveTune(tune)  }}  />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="tempo">
                        <Form.Label>Tempo</Form.Label>
                        <Form.Control type="text" placeholder="eg 100" value={tune.tempo ? tune.tempo : ''} onChange={function(e) {tune.tempo = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="tempo">
                        <Form.Label>Repeats</Form.Label>
                        <Form.Control type="text" placeholder="eg 100" value={tune.repeats ? tune.repeats : '1'} onChange={function(e) {tune.repeats = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="noteLength">
                        <Form.Label>ABC Note Length</Form.Label>
                        <Form.Select value={tune.noteLength ? tune.noteLength : ''} onChange={function(e) { tune.noteLength = e.target.value; tune.id = params.tuneId; saveTune(tune)  }} >
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
                        <Form.Select value={tune.tablature ? tune.tablature.trim() : ''} onChange={function(e) { tune.tablature = e.target.value ; tune.id = params.tuneId; saveTune(tune)  }} >
                          <option value=""></option>
                          <option value="guitar" >Guitar</option>
                          <option value="violin">Violin</option>
                          </Form.Select> 
                       
                      </Form.Group>
                      
                      <Form.Group className="mb-3" controlId="fonts">
                        <Form.Label>Sounds Fonts</Form.Label>
                        <Form.Select value={tune.soundFonts ? tune.soundFonts.trim() : ''} onChange={function(e) { tune.soundFonts = e.target.value ; tune.id = params.tuneId; saveTune(tune)  }} >
                          <option value="" >Local Sound Fonts Only (piano)</option>
                          <option value="online">Requires Online Sound Fonts</option>
                          </Form.Select> 
                       
                      </Form.Group>
                      
                    </Form>
                  </Tab>
                  <Tab eventKey="lyrics" title="Lyrics" >
                    <a target="_new" href={"https://www.google.com/search?q=lyrics "+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button>Search Lyrics</Button></a>
                    <a target="_new" href={"https://www.google.com/search?q=chords "+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button>Search Chords</Button></a>
                    <a target="_new" href={"https://www.youtube.com/results?search_query="+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button>Search YouTube</Button>
                    </a>
                    <textarea value={Array.isArray(tune.words) ? tune.words.join("\n") : ''} onChange={function(e) {tune.words = e.target.value.split("\n"); tune.id = params.tuneId; saveTune(tune)  }} style={{width:'100%', height:'30em'}}  />
                  </Tab>
                  <Tab eventKey="chords" title="Chords" >
                    <b>This tool is for scaffolding. Using it to edit chords in existing notation might work or it might break your music!!</b>
                    <br/><br/>
                    <ChordsWizard tunebook={props.tunebook} tune={tune} tuneId={tune.id}  saveTune={function(e) {saveTune(tune)}}  notes={tune.voices && Object.keys(tune.voices).length > 0 && Object.values(tune.voices)[0] ? Object.values(tune.voices)[0].notes : []} />
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
                    <textarea value={abcText} onChange={function(e) {setAbcText(e.target.value)}} onBlur={function(e) {var tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune, true)}}   style={{width:'100%', height:'30em'}}  />
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

  //<Tab eventKey="comments" title="Comments" >
    //<textarea value={Array.isArray(tune.abccomments) ? tune.abccomments.join("\n") : ''} onChange={function(e) {tune.abccomments = e.target.value.split("\n"); tune.id = params.tuneId; saveTune(tune)  }} style={{width:'100%', height:'30em'}}  />
  //</Tab>


//
//value={abc} onChange={function(e) {saveTune(params.tuneId, props.tunebook.abcTools.abc2json(e.target.value))}}
  //<Tab eventKey="books" title="Books">
                //<span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; saveTune(tune);} } /></span>
              //</Tab>
