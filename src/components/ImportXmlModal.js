import {useState} from 'react'
import {Button, Modal, ButtonGroup, Alert, Spinner} from 'react-bootstrap'
import {useNavigate} from 'react-router-dom'
import BookSelectorModal from './BookSelectorModal'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { detectScoreFormat, importMusicXmlText, importScoreFile } from '../scoreImportClient'
import { openMidiImportWizard } from '../midiImportWizard'

const OFFLINE_ACCEPT = '.xml,.musicxml,.mxl,application/vnd.recordare.musicxml+xml,application/xml'
const MIDI_ACCEPT = ',.mid,.midi,audio/midi,audio/mid'

function ImportXmlModal(props) {
  const navigate = useNavigate()
  const [show, setShow] = useState(false);
  const [list, setList] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState(null);
  const accessToken = props.token && props.token.access_token ? props.token.access_token : null
  const { available: resolverAvailable } = useMediaResolverHealth()
  const scoreAccept = resolverAvailable ? OFFLINE_ACCEPT + MIDI_ACCEPT : OFFLINE_ACCEPT
  const handleClose = () => {
      setError(null)
      setStatusText('')
      setLoading(false)
      setList('')
      setShow(false);
      if (props.closeParent) props.closeParent()
  }
  const handleShow = () => setShow(true);
  var [tuneBook, setTuneBook] = useState('')

  function finishImport(importResults) {
    if (!props.tunebook.showImportWarning(importResults)) {
      props.tunebook.applyImportData(importResults).then(function() {
        if (props.currentTuneBook) {
          navigate("/blank")
          setTimeout(function() {
            navigate("/tunes")
          }, 200)
        } else {
          navigate("/books")
        }
      })
    }
    handleClose()
  }

  function doImportText(xmlText) {
    setError(null)
    setLoading(true)
    setStatusText('Converting MusicXML to ABC...')
    try {
      const result = importMusicXmlText(xmlText, 'pasted.musicxml')
      const importResults = props.tunebook.importAbc(result.abc, props.currentTuneBook)
      finishImport(importResults)
    } catch (e) {
      setError(e.message || 'Import failed')
      setLoading(false)
      setStatusText('')
    }
  }

  function doImportMidiFile(file) {
    setError(null)
    setLoading(true)
    setStatusText('Opening MIDI import wizard...')
    openMidiImportWizard({ file: file }).then(function(wizardResult) {
      const first = wizardResult.candidates && wizardResult.candidates[0]
      let abc = wizardResult.result && wizardResult.result.abc
      if (!abc && first && first.tune && props.tunebook && props.tunebook.abcTools) {
        abc = props.tunebook.abcTools.json2abc(first.tune)
      }
      if (!abc) {
        throw new Error('MIDI import produced no notation')
      }
      setStatusText('Importing tunes...')
      const importResults = props.tunebook.importAbc(abc, props.currentTuneBook)
      finishImport(importResults)
    }).catch(function(e) {
      if (e && e.message && e.message.indexOf('cancelled') === -1) {
        setError(e.message || 'Import failed')
      }
      setLoading(false)
      setStatusText('')
    })
  }

  function doImportFile(file) {
    if (detectScoreFormat(file.name) === 'midi' && !resolverAvailable) {
      setError('MIDI import needs the media resolver. Log in with an authorized Google account and make sure the resolver is running.')
      return
    }
    if (detectScoreFormat(file.name) === 'midi') {
      doImportMidiFile(file)
      return
    }
    setError(null)
    setLoading(true)
    setStatusText('Reading file...')
    importScoreFile({
      file: file,
      accessToken: accessToken,
      onProgress: setStatusText,
    }).then(function(result) {
      setStatusText('Importing tunes...')
      const importResults = props.tunebook.importAbc(result.abc, props.currentTuneBook)
      finishImport(importResults)
    }).catch(function(e) {
      setError(e.message || 'Import failed')
      setLoading(false)
      setStatusText('')
    })
  }
      
  function fileSelected (event) {
      const file = event.target.files && event.target.files[0]
      if (file) {
        doImportFile(file)
      }
      event.target.value = ''
  }
   
  return (
    <>
      <Button  style={{color:'black'}}  variant="primary" onClick={handleShow}>
        {props.tunebook.icons.folderin} Score
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import MusicXML / MXL / MIDI</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{backgroundColor:'lightblue', padding:'0.3em', minHeight:'7em'}} >
          <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} > 
            Import into &nbsp;&nbsp;
            <ButtonGroup variant="primary"  style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}>{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={tuneBook} onChange={function(val) { props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions}   triggerElement={<Button variant="primary" >{props.tunebook.icons.book} {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}</Button>}  /></ButtonGroup>
          </div>
          {(list.trim().length > 0 && !loading) ? <Button style={{float:'left', marginBottom:'0.5em'}} variant="primary" onClick={function() {doImportText(list)}}>Import</Button> : <Button style={{float:'left', marginBottom:'0.5em'}} variant="secondary" disabled={loading || list.trim().length === 0}>Import</Button>}
          <span style={{marginLeft:'0.5em',width:'30%', float:'left'}} >
            <input accept={scoreAccept} style={{float:'left'}} className='btn' variant="primary" type="file" onChange={fileSelected} disabled={loading} />
          </span>
          {loading && (
            <div style={{clear:'both', paddingTop:'0.5em'}}>
              <Spinner animation="border" size="sm" /> {statusText || 'Working...'}
            </div>
          )}
          </div>
          <textarea placeholder="Paste MusicXML text here" value={list} onChange={function(e) {setList(e.target.value)}} style={{width:'100%', minHeight: '10em', clear:'both', marginTop:'0.5em'}} disabled={loading} />
          {error && <Alert variant="danger" style={{marginTop:'0.5em'}}>{error}</Alert>}
          <div style={{fontSize:'0.85em', color:'#444', marginTop:'0.5em'}}>
            {resolverAvailable
              ? 'MIDI import uses the media resolver to convert MIDI to MusicXML, then to ABC. Results may be approximate.'
              : 'MusicXML and MXL import work offline. MIDI import is unavailable until you log in and the media resolver is reachable.'}
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default ImportXmlModal
