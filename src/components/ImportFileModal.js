import {useState} from 'react'
import {Button, Modal, ButtonGroup, Alert, Spinner} from 'react-bootstrap'
import {useNavigate} from 'react-router-dom'
import BookSelectorModal from './BookSelectorModal'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAbcjsParser from '../useAbcjsParser'
import { detectScoreFormat, importMusicXmlText, importScoreFile } from '../scoreImportClient'
import { isMusicXmlText } from '../mxlExtract'
import {
  parseChordSheetText,
  createTuneFromChordSheet,
  isChordSheetFilename,
  detectChordSheetFormat,
} from '../chordProFormatUtils'

const OFFLINE_ACCEPT = '.abc,.txt,.xml,.musicxml,.mxl,.cho,.pro,.crd,.onsong,application/vnd.recordare.musicxml+xml,application/xml,text/plain'
const MIDI_ACCEPT = ',.mid,.midi,audio/midi,audio/mid'
const CHORD_SHEET_EXTENSIONS = ['.cho', '.pro', '.crd', '.onsong']

function isChordSheetExtension(fileName) {
  const lower = String(fileName || '').toLowerCase()
  return CHORD_SHEET_EXTENSIONS.some(function(ext) { return lower.endsWith(ext) })
}

function detectTextImportFormat(text, fileName) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  if (isMusicXmlText(trimmed)) return 'musicxml'
  if (isChordSheetExtension(fileName)) return 'chordsheet'
  if (/^X:\s*\d/m.test(trimmed)) return 'abc'
  const chordFormat = detectChordSheetFormat(trimmed)
  if (chordFormat === 'chordpro' || chordFormat === 'onsong') return 'chordsheet'
  if (chordFormat === 'chords-over-words') {
    try {
      parseChordSheetText(trimmed)
      return 'chordsheet'
    } catch (e) {
      return 'abc'
    }
  }
  if (String(fileName || '').toLowerCase().endsWith('.txt')) {
    try {
      parseChordSheetText(trimmed)
      return 'chordsheet'
    } catch (e) {
      return 'abc'
    }
  }
  if (isChordSheetFilename(fileName)) return 'chordsheet'
  return 'abc'
}

function readFileAsText(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onloadend = function() { resolve(String(reader.result || '')) }
    reader.onerror = function() { reject(new Error('Could not read file')) }
    reader.readAsText(file)
  })
}

function ImportFileModal(props) {
  const navigate = useNavigate()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  const [show, setShow] = useState(false)
  const [list, setList] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState(null)
  const accessToken = props.token && props.token.access_token ? props.token.access_token : null
  const { available: resolverAvailable } = useMediaResolverHealth()
  const fileAccept = resolverAvailable ? OFFLINE_ACCEPT + MIDI_ACCEPT : OFFLINE_ACCEPT

  const handleClose = function() {
    setError(null)
    setStatusText('')
    setLoading(false)
    setList('')
    setShow(false)
    if (props.closeParent) props.closeParent()
  }

  const handleShow = function() { setShow(true) }

  function finishImport(importResults) {
    if (!props.tunebook.showImportWarning(importResults)) {
      props.tunebook.applyImportData(importResults).then(function() {
        if (props.currentTuneBook) {
          navigate('/blank')
          setTimeout(function() {
            navigate('/tunes')
          }, 200)
        } else {
          navigate('/books')
        }
      })
    }
    handleClose()
  }

  function doImportAbc(abcText) {
    const importResults = props.tunebook.importAbc(abcText, props.currentTuneBook)
    finishImport(importResults)
  }

  function finishChordSheetImport(text) {
    const draft = parseChordSheetText(text)
    const tune = createTuneFromChordSheet({
      draft: draft,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      book: props.currentTuneBook,
    })
    props.tunebook.saveTune(tune)
    props.forceRefresh()
    if (props.currentTuneBook) {
      navigate('/blank')
      setTimeout(function() {
        navigate('/tunes')
      }, 200)
    } else {
      navigate('/books')
    }
    handleClose()
  }

  function doImportText(text, fileName) {
    setError(null)
    setLoading(true)
    const format = detectTextImportFormat(text, fileName)
    if (format === 'musicxml') {
      setStatusText('Converting MusicXML to ABC...')
      try {
        const result = importMusicXmlText(text, fileName || 'pasted.musicxml')
        doImportAbc(result.abc)
      } catch (e) {
        setError(e.message || 'Import failed')
        setLoading(false)
        setStatusText('')
      }
      return
    }
    if (format === 'chordsheet') {
      setStatusText('Importing chord sheet...')
      try {
        finishChordSheetImport(text)
      } catch (e) {
        setError(e.message || 'Import failed')
        setLoading(false)
        setStatusText('')
      }
      return
    }
    setStatusText('Importing ABC...')
    try {
      doImportAbc(text)
    } catch (e) {
      setError(e.message || 'Import failed')
      setLoading(false)
      setStatusText('')
    }
  }

  function doImportFile(file) {
    const scoreFormat = detectScoreFormat(file.name)
    if (scoreFormat === 'midi' && !resolverAvailable) {
      setError('MIDI import needs the media resolver. Log in with an authorized Google account and make sure the resolver is running.')
      return
    }
    if (isChordSheetExtension(file.name) || scoreFormat === 'abc') {
      setError(null)
      setLoading(true)
      setStatusText('Reading file...')
      readFileAsText(file).then(function(text) {
        if (text.trim()) {
          setList(text)
        }
        doImportText(text, file.name)
      }).catch(function(e) {
        setError(e.message || 'Import failed')
        setLoading(false)
        setStatusText('')
      })
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
      doImportAbc(result.abc)
    }).catch(function(e) {
      setError(e.message || 'Import failed')
      setLoading(false)
      setStatusText('')
    })
  }

  function fileSelected(event) {
    const file = event.target.files && event.target.files[0]
    if (file) {
      doImportFile(file)
    }
    event.target.value = ''
  }

  return (
    <>
      <Button style={{color: 'black'}} variant="primary" onClick={handleShow}>
        {props.tunebook.icons.folderin} Select A File
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import from file</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{backgroundColor: 'lightblue', padding: '0.3em', minHeight: '7em'}}>
            <div style={{borderBottom: '1px solid black', marginBottom: '1em', padding: '0.3em'}}>
              Import into &nbsp;&nbsp;
              <ButtonGroup variant="primary" style={{backgroundColor: '#3f81e3', borderRadius: '10px', width: 'fit-content'}}>
                {props.currentTuneBook
                  ? <Button onClick={function() { props.setCurrentTuneBook(''); props.forceRefresh() }}>{props.tunebook.icons.closecircle}</Button>
                  : ''}
                <BookSelectorModal
                  forceRefresh={props.forceRefresh}
                  title={'Select a Book'}
                  currentTuneBook={props.currentTuneBook}
                  setCurrentTuneBook={props.setCurrentTuneBook}
                  tunebook={props.tunebook}
                  value={''}
                  onChange={function(val) { props.setCurrentTuneBook(val) }}
                  defaultOptions={props.tunebook.getTuneBookOptions}
                  searchOptions={props.tunebook.getSearchTuneBookOptions}
                  triggerElement={
                    <Button variant="primary">
                      {props.tunebook.icons.book} {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}
                    </Button>
                  }
                />
              </ButtonGroup>
            </div>
            {(list.trim().length > 0 && !loading)
              ? <Button style={{float: 'left', marginBottom: '0.5em'}} variant="primary" onClick={function() { doImportText(list) }}>Import</Button>
              : <Button style={{float: 'left', marginBottom: '0.5em'}} variant="secondary" disabled={loading || list.trim().length === 0}>Import</Button>}
            <span style={{marginLeft: '0.5em', width: '30%', float: 'left'}}>
              <input accept={fileAccept} style={{float: 'left'}} className="btn" type="file" onChange={fileSelected} disabled={loading} />
            </span>
            {loading && (
              <div style={{clear: 'both', paddingTop: '0.5em'}}>
                <Spinner animation="border" size="sm" /> {statusText || 'Working...'}
              </div>
            )}
          </div>
          <textarea
            placeholder="Paste ABC, MusicXML, or ChordPro / OnSong text here"
            value={list}
            onChange={function(e) { setList(e.target.value) }}
            style={{width: '100%', minHeight: '10em', clear: 'both', marginTop: '0.5em'}}
            disabled={loading}
          />
          {error && <Alert variant="danger" style={{marginTop: '0.5em'}}>{error}</Alert>}
          <div style={{fontSize: '0.85em', color: '#444', marginTop: '0.5em'}}>
            Supports ABC, MusicXML, MXL, and chord sheet files (.cho, .pro, .crd, .onsong, .txt).
            {resolverAvailable
              ? ' MIDI files are converted via the media resolver and may be approximate.'
              : ' MIDI import is unavailable until you log in and the media resolver is reachable.'}
          </div>
        </Modal.Body>
      </Modal>
    </>
  )
}

export default ImportFileModal
