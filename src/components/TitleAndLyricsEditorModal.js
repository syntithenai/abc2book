import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Form} from 'react-bootstrap'
import { toast } from 'react-toastify'
import useMusicBrainz from '../useMusicBrainz'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {useParams, useNavigate} from 'react-router-dom'
import AsyncCreatableSelect from 'react-select/async-creatable';
import { lyricLinesToText, setPlainLyricLines } from '../wLinesUtils'
import LyricsSearchButton from './LyricsSearchButton'
import ComposerSearchButton from './ComposerSearchButton'
import NoteAlignedLyricsModal from './NoteAlignedLyricsModal'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import TuneAliasesField from './TuneAliasesField'

function getFirstSelectedLine(textValue, selectionStart, selectionEnd) {
  const text = String(textValue || '')
  const start = Number.isFinite(selectionStart) ? selectionStart : 0
  const end = Number.isFinite(selectionEnd) ? selectionEnd : 0
  if (end <= start) return ''
  const selected = text.slice(start, end).trim()
  if (!selected) return ''
  const firstNonEmpty = selected
    .split(/\r?\n/)
    .map(function(line) { return line.trim() })
    .find(function(line) { return !!line })
  return firstNonEmpty || ''
}

export default function TitleAndLyricsEditorModal({tune, tunebook, token, setBlockKeyboardShortcuts}) {
  const [show, setShow] = useState(false)
  const [showNoteAlignedLyrics, setShowNoteAlignedLyrics] = useState(false)
  const lyricsTextareaRef = useRef(null)
  const responsiveModalProps = useResponsiveModalProps()
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()
  const navigate = useNavigate()
  const handleClose = () => {
      setShow(false);
  }
  const handleShow = () => setShow(true);

  useEffect(function() {
    if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(show || showNoteAlignedLyrics)
    return function() {
      if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(false)
    }
  }, [show, showNoteAlignedLyrics, setBlockKeyboardShortcuts])
  var musicBrainz = useMusicBrainz()
  var abcjsParser = useAbcjsParser()
  let params = useParams();

  function saveLyrics(lines) {
    setPlainLyricLines(tune, lines)
    tune.id = params.tuneId
    tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
  }

  function acceptSuggestedGenre(genre) {
    if (!tune || !genre) return
    tune.genre = genre
    tune.id = params.tuneId
    tunebook.saveTune(tune, false, { historyLabel: 'Apply suggested genre', immediate: true })
  }

  function openLookupToolsFromSelection() {
    const textarea = lyricsTextareaRef.current
    if (!textarea) {
      toast.warning('Select lyrics text first to open tools.')
      return
    }

    const firstLine = getFirstSelectedLine(textarea.value, textarea.selectionStart, textarea.selectionEnd)
    if (!firstLine) {
      toast.warning('Select at least one line in the lyrics editor to open tools.')
      return
    }

    handleClose()
    navigate('/lyrics?tab=lookup&q=' + encodeURIComponent(firstLine))
  }

  return (
    <>
        <button type="button" className="title-lyrics-edit-trigger" onClick={handleShow}>{tune ? tune.name : ''}</button>

        <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>Edit</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button  style={{float:'right'}} variant="success" onClick={handleClose} >OK</Button>


             <Form.Group className="mb-3" controlId="title">
                        <Form.Label>Title</Form.Label>
                        <Form.Control type="text" placeholder="" value={tune.name ? tune.name : ''} onChange={function(e) {tune.name = e.target.value;  tune.id = params.tuneId; tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })  }} />
                      </Form.Group>

                      <Form.Group className="mb-3" controlId="composer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                          <Form.Label style={{ marginBottom: 0 }}>Artist</Form.Label>
                          <ComposerSearchButton
                            title={tune.name || ''}
                            composer={tune && tune.composer ? tune.composer : ''}
                            titleHint={tune.name || ''}
                            token={token}
                            tunebook={tunebook}
                            disabled={!(tune && tune.name && String(tune.name).trim())}
                            inline={true}
                            onComposer={function(result) {
                              if (result && result.artist) {
                                tune.composer = result.artist
                                tune.id = params.tuneId
                                tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                              }
                            }}
                          />
                        </div>
                      <AsyncCreatableSelect
                            value={tune && tune.composer ? {value:tune.composer, label:tune.composer} : {value:'', label:''}}
                            onChange={function(val) {if (val) {tune.composer = val.label; tune.id = params.tuneId; tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })  }}}
                            defaultOptions={[]} loadOptions={musicBrainz.artistOptions}
                            isClearable={false}
                            blurInputOnSelect={true}
                            createOptionPosition={"first"}
                            allowCreateWhileLoading={true}
                            loadingMessage ="Loading ..."
                            controlShouldRenderValue={true}
                          />

                      </Form.Group>
                      <TuneAliasesField
                        value={tune.aliases}
                        onChange={function(aliases) {
                          tune.aliases = aliases
                          tune.id = params.tuneId
                          tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                        }}
                      />
                    <Form.Group className="mb-3" controlId="key">
                        <div className="abc-editor-lyrics-toolbar">
                        <LyricsSearchButton
                          title={tune.name}
                          artist={tune.composer || ''}
                          rhythm={tune.rhythm || ''}
                          currentGenre={tune.genre || ''}
                          onGenreAccept={acceptSuggestedGenre}
                          token={token}
                          tunebook={tunebook}
                          onLyrics={function(result) { saveLyrics(result.lines) }}
                        />
                        <Button variant="info" style={{display: 'inline-flex', alignItems: 'center', gap: '0.35em'}} onClick={function() {
                            var start = lyricLinesToText(tune)
                            var clean = abcjsParser.cleanupLyrics(start)
                            saveLyrics(clean.split('\n'))
                        }} >{tunebook.icons.wizard} Clean</Button>
                        {resolverChecked && resolverAvailable ? (
                          <Button
                            variant="outline-primary"
                            onClick={openLookupToolsFromSelection}
                          >
                            Tools
                          </Button>
                        ) : null}
                        <Button
                          variant="outline-secondary"
                          style={{ marginLeft: 'auto' }}
                          onClick={function() { setShowNoteAlignedLyrics(true) }}
                        >
                          Note-aligned lyrics
                        </Button>
                        </div>
                        <textarea ref={lyricsTextareaRef} value={lyricLinesToText(tune)} onChange={function(e) {saveLyrics(e.target.value.split('\n'))  }} className="title-lyrics-editor-textarea" style={{width:'100%', minHeight:'12em', maxHeight:'50vh'}}  />
                    </Form.Group>

        </Modal.Body>


      </Modal>
      <NoteAlignedLyricsModal
        show={showNoteAlignedLyrics}
        onHide={function() { setShowNoteAlignedLyrics(false) }}
        tune={tune}
        tunebook={tunebook}
        onSaved={function(savedTune) {
          savedTune.id = params.tuneId
          tunebook.saveTune(savedTune, false, { historyLabel: 'Edit note-aligned lyrics', immediate: true })
        }}
      />
    </>
  );
}
