import React, { useEffect, useState, useRef } from "react";
import {useParams, Link} from 'react-router-dom'
import abcjs from "abcjs";
import {Container, Row, Col, Tabs, Tab, Form, Button} from 'react-bootstrap'
import BookMultiSelectorModal from './BookMultiSelectorModal'
import Abc from './Abc'
import ChordsWizard from './ChordsWizard'
import { lyricLinesToText, setLyricLines } from '../wLinesUtils'
import LinksEditor from './LinksEditor'
//import ImagesEditor from './ImagesEditor'
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import AsyncCreatableSelect from 'react-select/async-creatable';
import useAbcjsParser from '../useAbcjsParser'
import SelectInput from './SelectInput'
import useMusicBrainz from '../useMusicBrainz'
import MediaPlayerMedia from '../components/MediaPlayerMedia'
import LyricsSearchButton from './LyricsSearchButton'
import TuneBackgroundSearchButton from './TuneBackgroundSearchButton'
import MarkdownContent from './MarkdownContent'
import { FormLabelWithHelp } from './FormFieldHelp'
import { EDITOR_INFO_FIELD_HELP } from '../formFieldHelpText'


export default function AbcEditor(props) {
  const [abcText, setAbcText] = useState(props.abc);
  const [currentVoice, setCurrentVoice] = useState(0);
  let params = useParams();
  var musicBrainz = useMusicBrainz()
  const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
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
  var tune = props.tune
  
  //var inputRefs = []
  const [warnings, setWarnings] = useState([])
  var [saveTimeout, setSaveTimeout] = useState(null)
  const [noteEditorWidth, setNoteEditorWidth] = useState(2)
  var [chordsChanged, setChordsChanged] = useState(false)
  const [wLinesText, setWLinesText] = useState('')
  const [pendingChordImport, setPendingChordImport] = useState('')
  const wLinesSaveTimeout = useRef(null)
  const [backgroundInfoText, setBackgroundInfoText] = useState('')
  const [backgroundInfoPreview, setBackgroundInfoPreview] = useState(false)
  const backgroundInfoSaveTimeout = useRef(null)
  
  const tuneId = tune && tune.id
  useEffect(function() {
    setWLinesText(lyricLinesToText(tune))
    setBackgroundInfoText(tune && typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : '')
    setBackgroundInfoPreview(false)
  }, [props.abc, tune, tuneId])
  
  useEffect(function() {
    return function() {
      if (wLinesSaveTimeout.current) clearTimeout(wLinesSaveTimeout.current)
      if (backgroundInfoSaveTimeout.current) clearTimeout(backgroundInfoSaveTimeout.current)
    }
  }, [])
  const [artistOptions, setArtistOptions] = useState([])
  var artistLoadTimeout = useRef()
  const tuneComposer = tune && tune.composer ? tune.composer : null
  useEffect(function() {
      //console.log("COMPOSER CHANGE", tune)
      if (tune && tune.composer) {
          clearTimeout(artistLoadTimeout.current)
          artistLoadTimeout.current = setTimeout(function() {
              //console.log("load artists "+tune.composer)
              musicBrainz.artistOptions(tune.composer).then(function(o) {
                  //console.log("loaded artists "+tune.composer, o)
                setArtistOptions(o.map(function(v) {return v.label}))
              })
          },500)
      }
  }, [tune, tuneComposer, musicBrainz])
   
  //var [tune, setTune] = useState(null)
  //var [noteSaveTimeout, setNoteSaveTimeout] = useState(null)
  useEffect(() => {
	  //console.log('abcedit abc change',props.abc)
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
    //props.mediaController.setTune(props.tune)
    //props.mediaController.setSrc('')
  }, [props.abc]);
  
  
  
  
  function onWarnings(warnings) {
    setWarnings(warnings)
  }

  function saveTune(tune, options) {
     return props.tunebook.saveTune(tune, false, options)
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
      //console.log('SAVEd NOTES',tune, "V",voice,"N", notes, "JN",v)
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
    
    //console.log('onabcclick select text', abcelem.startChar, abcelem.endChar,abcelem.currentTrackMilliseconds, "V",analysis.voice, 'line meas',analysis.line, analysis.measure,'Drag', drag.index, drag.max, abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    var voice = analysis.voice
    setCurrentVoice(voice)
    //console.log('ddsetvoice',voice, tune)
    if (tune && tune.voices) {
      var voiceNames = Object.keys(tune.voices)
      var voiceName = voiceNames.length > voice ? voiceNames[voice] : null
      if (voiceName) {
        var voiceParts =  abcText.split("\nV:"+voiceName)
        //console.log(voiceParts)
        if (voiceParts.length > 1) {
          var voiceInnerParts = voiceParts[1].split("\n")
          if (voiceInnerParts.length > 1) {
            var splitOffset = voiceName.length + 3
            var before = voiceParts[0].length + voiceInnerParts[0].length + splitOffset
            //console.log('letter before start of voice',before, abcelem.startChar, abcelem.endChar)
            if (refs['textareaRef_'+voice] && refs['textareaRef_'+voice].current) {
              //console.log(refs['textareaRef_'+voice].current)
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
          <Tabs defaultActiveKey="musiceditor" id="abc-editor-tabs" className="mb-3">
                  <Tab eventKey="musiceditor" title="Music">
                      <Row style={{width:'100%'}}>
                        <Col xs={12} md={6}>
                          <Abc showRepeats={true} mediaController={props.mediaController} audioRenderTimeout={30000}  tunebook={props.tunebook}  abc={props.abc}  onWarnings={onWarnings} distempo={tune && tune.tempo > 0 ? tune.tempo : null} showTempoSlider={true} editableTempo={true}  meter={tune.meter} onClick={onAbcClick} />
                        </Col>
                        <Col xs={12} md={6}>
                          <Button style={{float:'left', marginRight:'0.2em'}}  variant="success" size="sm" onClick={addVoice} >+</Button>
                          {tune && tune.voices ? <Tabs id="voices-tabs" className="mb-3" activeKey={currentVoice}
                          onSelect={(k) => setCurrentVoice(k)}>
                              {Object.keys(tune.voices).map(function(voice,vk) {
                                return <Tab  key={vk}  eventKey={vk}  title={voice} ><textarea onFocus={function() {setNoteEditorWidth('8')}} onBlur={function() {setNoteEditorWidth('2')}}  ref={refs['textareaRef_'+vk]} value={Array.isArray(tune.voices[voice].notes) ? tune.voices[voice].notes.join("\n") : ''} style={{resize:'both', fontSize:'1em', minHeight: '25em', zIndex: '9999', backgroundColor: 'white', width:'100%'}} onChange={function(e) {tuneNotesChanged(voice, e.target.value)}}   /></Tab>
                              })}
                          </Tabs> : ''}
                        </Col>
                      </Row>
                    
                  
                    
                    
                    
                  </Tab>
                  
                  <Tab eventKey="info" title="Info">
                    <Form className="abc-editor-info-form">
                      <div className="abc-editor-info-section">
                      <Row>
                        <Col xs={12} md={6}>
                          <Form.Group className="mb-3" controlId="title">
                            <Form.Label>Title</Form.Label>
                            <Form.Control type="text" placeholder="" value={tune.name ? tune.name : ''} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; saveTune(tune)  }} />
                          </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                          <Form.Group className="mb-3" controlId="composer">
                            <Form.Label>Artist</Form.Label>
                            <SelectInput 
                              onChange={function(val) { tune.composer = val; tune.id = params.tuneId; saveTune(tune)  }} 
                              value={tune && tune.composer ? tune.composer : ''}  
                              options={artistOptions} 
                            />  
                          </Form.Group>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section abc-editor-info-section-primary">
                      <Row className="abc-editor-info-primary-row">
                        <Col className="abc-editor-info-field-primary" xs={12} md={5}>
                          <Form.Group className="mb-3" controlId="key">
                            <Form.Label>Key</Form.Label>
                            <Form.Control type="text" value={tune.key ? tune.key : ''} onChange={function(e) {tune.key = e.target.value;tune.id = params.tuneId; saveTune(tune)  }}/>
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary" xs={4} md={2}>
                          <Form.Group className="mb-3" controlId="tuning">
                            <FormLabelWithHelp label="Tuning" htmlFor="tuning" helpBody={EDITOR_INFO_FIELD_HELP.tuning.body} helpTitle={EDITOR_INFO_FIELD_HELP.tuning.title} />
                            <Form.Control type="text" value={tune.tuning ? tune.tuning : ''} onChange={function(e) {tune.tuning = e.target.value;tune.id = params.tuneId; saveTune(tune)  }}/>
                            {params.tuneId ? (
                              <Link to={'/tuner?tuneId=' + encodeURIComponent(params.tuneId)} className="small">Open tuner</Link>
                            ) : null}
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary" xs={4} md={3}>
                          <Form.Group className="mb-3" controlId="transpose">
                            <FormLabelWithHelp label="Transpose" htmlFor="transpose" helpBody={EDITOR_INFO_FIELD_HELP.transpose.body} helpTitle={EDITOR_INFO_FIELD_HELP.transpose.title} />
                            <Form.Control   value={tune.transpose ? tune.transpose : ''} onChange={function(e) {tune.transpose = e.target.value; tune.id = params.tuneId; saveTune(tune)  }}/>
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                          <Form.Group className="mb-3" controlId="capo">
                            <FormLabelWithHelp label="Capo" htmlFor="capo" helpBody={EDITOR_INFO_FIELD_HELP.capo.body} helpTitle={EDITOR_INFO_FIELD_HELP.capo.title} />
                            <Form.Control type="number" min="0" max="12" value={tune.capo !== undefined && tune.capo !== null ? tune.capo : ''} onChange={function(e) {
                              var value = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                              tune.capo = Number.isFinite(value) ? value : 0
                              tune.id = params.tuneId
                              saveTune(tune)
                            }} />
                          </Form.Group>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section abc-editor-info-section-primary">
                      <Row className="abc-editor-info-primary-row">
                        <Col className="abc-editor-info-field-primary" xs={12} md={5}>
                          <Form.Group className="mb-3" controlId="meter">
                            <Form.Label>Time Signature</Form.Label>
                            <CreatableSelect
                                value={tune.meter ? {value:tune.meter, label:tune.meter} : {value:'', label:''}}
                                onChange={function(val) {tune.meter = val.label; tune.id = params.tuneId; saveTune(tune)  }}
                                options={props.tunebook.abcTools.getTimeSignatureTypes().map(function(type,key) {
                                    return {value:type, label: type}
                                })}
                                isClearable={false}
                                blurInputOnSelect={true}
                                createOptionPosition={"first"}
                                allowCreateWhileLoading={true}
                              />
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary" xs={4} md={3}>
                          <Form.Group className="mb-3" controlId="rhythm">
                            <FormLabelWithHelp label="Rhythm" helpBody={EDITOR_INFO_FIELD_HELP.rhythm.body} helpTitle={EDITOR_INFO_FIELD_HELP.rhythm.title} />
                            <CreatableSelect
                                value={tune.rhythm ? {value:tune.rhythm, label:tune.rhythm} : {value:'', label:''}}
                                onChange={function(val) {tune.rhythm = val.label; if(props.tunebook.abcTools.timeSignatureFromTuneType(val.label)) {tune.meter = props.tunebook.abcTools.timeSignatureFromTuneType(val.label)};   tune.id = params.tuneId; saveTune(tune)  }}
                                options={Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type,key) {
                                    return {value:type, label: type}
                                })}
                                isClearable={false}
                                blurInputOnSelect={true}
                                createOptionPosition={"first"}
                                allowCreateWhileLoading={true}
                              />
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                          <Form.Group className="mb-3" controlId="tempo">
                            <Form.Label>Tempo</Form.Label>
                            <Form.Control  type='number' placeholder="eg 100" value={tune.tempo ? tune.tempo : ''} onChange={function(e) {tune.tempo = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                          <Form.Group className="mb-3" controlId="repeats">
                            <FormLabelWithHelp label="Repeats" htmlFor="repeats" helpBody={EDITOR_INFO_FIELD_HELP.repeats.body} helpTitle={EDITOR_INFO_FIELD_HELP.repeats.title} />
                            <Form.Control  type='number' placeholder="eg 3" value={tune.repeats ? tune.repeats : ''} onChange={function(e) {tune.repeats = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section abc-editor-info-section-details">
                      <Row className="abc-editor-info-compact-row g-2 align-items-end">
                        <Col xs="auto" className="abc-editor-info-compact-field">
                          <Form.Group className="mb-3" controlId="boost">
                            <FormLabelWithHelp label="Boost" htmlFor="boost" helpBody={EDITOR_INFO_FIELD_HELP.boost.body} helpTitle={EDITOR_INFO_FIELD_HELP.boost.title} />
                            <Form.Control  type='number' min="0" max="20" placeholder="" value={tune.boost ? tune.boost : ''} onChange={function(e) {tune.boost = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                        <Col xs="auto" className="abc-editor-info-compact-field">
                          <Form.Group className="mb-3" controlId="difficulty">
                            <FormLabelWithHelp label="Difficulty" htmlFor="difficulty" helpBody={EDITOR_INFO_FIELD_HELP.difficulty.body} helpTitle={EDITOR_INFO_FIELD_HELP.difficulty.title} />
                            <Form.Control  type='number' min="0" max="20" placeholder="" value={tune.difficulty ? tune.difficulty : ''} onChange={function(e) {tune.difficulty = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                        <Col xs="auto" className="abc-editor-info-compact-field">
                          <Form.Group className="mb-3" controlId="noteLength">
                            <FormLabelWithHelp label="ABC Note Length" helpBody={EDITOR_INFO_FIELD_HELP.noteLength.body} helpTitle={EDITOR_INFO_FIELD_HELP.noteLength.title} />
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
                        </Col>
                        <Col xs="auto" className="abc-editor-info-compact-field">
                          <Form.Group className="mb-3" controlId="tab">
                            <FormLabelWithHelp label="Tablature" helpBody={EDITOR_INFO_FIELD_HELP.tablature.body} helpTitle={EDITOR_INFO_FIELD_HELP.tablature.title} />
                            <Form.Select value={tune.tablature ? tune.tablature.trim() : ''} onChange={function(e) { tune.tablature = e.target.value ; tune.id = params.tuneId; saveTune(tune)  }} >
                              <option value=""></option>
                              <option value="guitar" >Guitar</option>
                              <option value="violin">Violin</option>
                              </Form.Select> 
                          </Form.Group>
                        </Col>
                        <Col xs={12} md={5} className="abc-editor-info-compact-field-wide">
                          <Form.Group className="mb-3" controlId="fonts">
                            <FormLabelWithHelp label="Sounds Fonts" helpBody={EDITOR_INFO_FIELD_HELP.soundFonts.body} helpTitle={EDITOR_INFO_FIELD_HELP.soundFonts.title} />
                            <Form.Select value={tune.soundFonts ? tune.soundFonts.trim() : ''} onChange={function(e) { tune.soundFonts = e.target.value ; tune.id = params.tuneId; saveTune(tune)  }} >
                              <option value="" >Local Sound Fonts Only (piano)</option>
                              <option value="online">Requires Online Sound Fonts</option>
                              </Form.Select> 
                          </Form.Group>
                        </Col>
                        <Col xs={12} md className="abc-editor-info-compact-field-grow">
                          <Form.Group className="mb-3" controlId="srcUrl">
                            <FormLabelWithHelp label="Source URL" htmlFor="srcUrl" helpBody={EDITOR_INFO_FIELD_HELP.srcUrl.body} helpTitle={EDITOR_INFO_FIELD_HELP.srcUrl.title} />
                            <Form.Control   value={tune.srcUrl ? tune.srcUrl : ''} onChange={function(e) {tune.srcUrl = e.target.value; tune.id = params.tuneId; saveTune(tune)  }}/>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Form.Group className="mb-3 abc-editor-info-background-group" controlId="backgroundInfo">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <FormLabelWithHelp
                            label="Background information (Markdown)"
                            helpBody={EDITOR_INFO_FIELD_HELP.backgroundInfo.body}
                            helpTitle={EDITOR_INFO_FIELD_HELP.backgroundInfo.title}
                          />
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            disabled={!backgroundInfoText}
                            onClick={function() { setBackgroundInfoPreview(!backgroundInfoPreview) }}
                          >
                            {backgroundInfoPreview ? 'Edit' : 'Preview'}
                          </Button>
                        </div>
                        <div style={{ margin: '0.5em 0' }}>
                          <TuneBackgroundSearchButton
                            title={tune.name}
                            artist={tune.composer || ''}
                            lyrics={wLinesText}
                            token={props.token}
                            existingBackgroundInfo={backgroundInfoText}
                            onBackgroundInfo={function(result) {
                              setBackgroundInfoText(result.text)
                              setBackgroundInfoPreview(true)
                              tune.backgroundInfo = result.text
                              tune.id = params.tuneId
                              saveTune(tune)
                            }}
                          />
                        </div>
                        {backgroundInfoPreview
                          ? <div className="abc-editor-markdown-preview">
                              <MarkdownContent text={backgroundInfoText} />
                            </div>
                          : <Form.Control
                              as="textarea"
                              rows={16}
                              placeholder={'Performers, alternative names, first recording date, who popularized the tune, record labels, anecdotes, musical structure, YouTube links... (Markdown supported)'}
                              value={backgroundInfoText}
                              onChange={function(e) {
                                var next = e.target.value
                                setBackgroundInfoText(next)
                                if (backgroundInfoSaveTimeout.current) clearTimeout(backgroundInfoSaveTimeout.current)
                                backgroundInfoSaveTimeout.current = setTimeout(function() {
                                  tune.backgroundInfo = next
                                  tune.id = params.tuneId
                                  saveTune(tune)
                                }, 500)
                              }}
                            />}
                      </Form.Group>
                      </div>
                      
                    </Form>
                  </Tab>
                  <Tab eventKey="lyrics" title="Lyrics" >
                    <LyricsSearchButton
                      title={tune.name}
                      artist={tune.composer || ''}
                      token={props.token}
                      onLyrics={function(result) {
                        setWLinesText(result.text)
                        setLyricLines(tune, result.lines)
                        tune.id = params.tuneId
                        saveTune(tune, { historyLabel: 'Search lyrics', immediate: true })
                      }}
                    />
                    <a style={{marginRight:'0.2em'}}  target="_new" href={"https://www.youtube.com/results?search_query="+props.tune.name + ' '+(props.tune.composer ? props.tune.composer : '')+ ' lyrics'} ><Button>{props.tunebook.icons.externallink}</Button>
            </a>
                    <Button variant="info" style={{marginLeft:'2em'}} onClick={function() {
                        var clean = abcjsParser.cleanupLyrics(wLinesText)
                        setWLinesText(clean)
                        setLyricLines(tune, clean.split('\n'))
                        tune.id = params.tuneId
                        saveTune(tune)
                    }} >{props.tunebook.icons.wizard} Clean</Button>
                    <div style={{ marginTop: '0.5em', marginBottom: '0.5em', fontSize: '0.9em' }}>
                      One line per music line (ABC <code>w:</code> lyrics).
                    </div>
                    <textarea
                      value={wLinesText}
                      onChange={function(e) {
                        var next = e.target.value
                        setWLinesText(next)
                        if (wLinesSaveTimeout.current) clearTimeout(wLinesSaveTimeout.current)
                        wLinesSaveTimeout.current = setTimeout(function() {
                          setLyricLines(tune, next.split('\n'))
                          tune.id = params.tuneId
                          saveTune(tune)
                        }, 500)
                      }}
                      style={{width:'100%', height:'30em'}}
                    />
                  </Tab>
                  
                  
                  <Tab eventKey="chords" title="Chords" >
                    <ChordsWizard
                      tunebook={props.tunebook}
                      tune={tune}
                      tuneId={tune.id}
                      token={props.token}
                      abc={props.abc}
                      saveTune={function() {saveTune(tune)}}
                      notes={tune.voices && Object.keys(tune.voices).length > 0 && Object.values(tune.voices)[0] ? Object.values(tune.voices)[0].notes : []}
                      pendingChordImport={pendingChordImport}
                      onConsumePendingChordImport={function() { setPendingChordImport('') }}
                      onLyricsImport={function(lines) {
                        setWLinesText(lines.join('\n'))
                        setLyricLines(tune, lines)
                        tune.id = params.tuneId
                        saveTune(tune, { historyLabel: 'Search chords and lyrics', immediate: true })
                      }}
                    />
                  </Tab>
                  
                 
                  
                  <Tab eventKey="abc" title="ABC">
                    <Tabs defaultActiveKey="abc-text" id="abc-editor-abc-tabs" className="mb-3">
                      <Tab eventKey="abc-text" title="ABC">
                        <textarea value={abcText} onChange={function(e) {setAbcText(e.target.value)}} onBlur={function(e) {var tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune, true)}}   style={{width:'100%', height:'30em'}}  />
                      </Tab>
                      <Tab eventKey="errors" title={<span>Errors {(warnings && warnings.length > 0 ? warnings.length+' !!' : '')} </span>}>
                        <div style={{}} id="warnings">
                        {warnings ? warnings.map(function(warning,wk) {
                          var pos = warning.indexOf('<span')
                          return <div key={wk} >{warning.slice(0,pos)}</div>
                        }) : null}
                        </div>
                      </Tab>
                    </Tabs>
                  </Tab>
                
                </Tabs>
                 <MediaPlayerMedia mediaController={props.mediaController} tunebook={props.tunebook} tune={tune} />
        </div>
    );
    
  }
}
 //{<Tab eventKey="files" title="Images" >
                        //<Form.Group className="mb-3" controlId="images">
                            //<Form.Label style={{paddingBottom:'1em'}} ></Form.Label>
                            //<ImagesEditor logout={props.logout} login={props.login} token={props.token} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} forceRefresh={props.forceRefresh} tunebook={props.tunebook} tune={tune} />
                        //</Form.Group>
                  //</Tab>}
                  
  //<Tab eventKey="audio" title="Links" >
		//<Form.Group className="mb-3" controlId="audio">
			//<Form.Label style={{paddingBottom:'1em'}} ></Form.Label>
			//<LinksEditor links={tune.links} tune={tune} onChange={function(links) {tune.links = links; props.tunebook.saveTune(tune)}} tunebook={props.tunebook} />
		//</Form.Group>
  //</Tab>
                  
                  
//localStorage.getItem('bookstorage_inlineaudio') === "true" && 
  //<Tab eventKey="comments" title="Comments" >
    //<textarea value={Array.isArray(tune.abccomments) ? tune.abccomments.join("\n") : ''} onChange={function(e) {tune.abccomments = e.target.value.split("\n"); tune.id = params.tuneId; saveTune(tune)  }} style={{width:'100%', height:'30em'}}  />
  //</Tab>


//
//value={abc} onChange={function(e) {saveTune(params.tuneId, props.tunebook.abcTools.abc2json(e.target.value))}}
  //<Tab eventKey="books" title="Books">
                //<span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; saveTune(tune);} } /></span>
              //</Tab>
