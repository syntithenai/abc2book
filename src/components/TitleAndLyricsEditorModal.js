import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Form, Alert} from 'react-bootstrap'
import { toast } from 'react-toastify'
import { networkUnavailableMessage } from '../offlineNetwork'
import useMusicBrainz from '../useMusicBrainz'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {useParams} from 'react-router-dom'
import AsyncCreatableSelect from 'react-select/async-creatable';
import { lyricLinesToText, setPlainLyricLines } from '../wLinesUtils'
import { hasLyricEmbeddedChords, stripChordsFromLyricLines } from '../chordSheetUtils'
import { noteLinesHaveRealMelody } from '../timedImportFinalizer'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import { StripChordsWarningBody } from '../stripChordsConfirmContent'
import LyricsSearchButton from './LyricsSearchButton'
import ComposerSearchButton from './ComposerSearchButton'
import CapitalizeTitleButton from './CapitalizeTitleButton'
import VoiceFillInput from './VoiceFillInput'
import NoteAlignedLyricsModal from './NoteAlignedLyricsModal'
import LyricsToolsModal from './LyricsToolsModal'
import LyricsSectionsDropdown from './LyricsSectionsDropdown'
import LyricsEditorChordsPreview from './LyricsEditorChordsPreview'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import TuneAliasesField from './TuneAliasesField'
import TuneArtistsField from './TuneArtistsField'
import { allGenres, mergeBibliographicList } from '../tuneBibliographicUtils'
import EditorAddFromToolbar from './EditorAddFromToolbar'
import useAbcjsParser from '../useAbcjsParser'
import { commitChordSearchResultToTune } from '../commitChordSearchResultToTune'

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

export default function TitleAndLyricsEditorModal({tune, tunebook, token, setBlockKeyboardShortcuts, tunes, forceRefresh}) {
  void tunes
  void forceRefresh
  const [show, setShow] = useState(false)
  const [showNoteAlignedLyrics, setShowNoteAlignedLyrics] = useState(false)
  const [showLyricsTools, setShowLyricsTools] = useState(false)
  const [showStripChordsConfirm, setShowStripChordsConfirm] = useState(false)
  const [lyricsToolsQuery, setLyricsToolsQuery] = useState('')
  const [lyricsText, setLyricsText] = useState(function() { return lyricLinesToText(tune) })
  const lyricsSaveTimeout = useRef(null)
  const lyricsTextareaRef = useRef(null)
  const responsiveModalProps = useResponsiveModalProps()
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()
  const handleClose = () => {
      if (lyricsSaveTimeout.current) {
        clearTimeout(lyricsSaveTimeout.current)
        lyricsSaveTimeout.current = null
        saveLyrics(String(lyricsText || '').split('\n'))
      }
      setShow(false);
  }
  const handleShow = () => setShow(true);

  useEffect(function() {
    if (!show) return
    setLyricsText(lyricLinesToText(tune))
  }, [show])

  useEffect(function() {
    if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(show || showNoteAlignedLyrics || showLyricsTools || showStripChordsConfirm)
    return function() {
      if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(false)
    }
  }, [show, showNoteAlignedLyrics, showLyricsTools, showStripChordsConfirm, setBlockKeyboardShortcuts])
  var musicBrainz = useMusicBrainz()
  const abcjsParser = useAbcjsParser()
  let params = useParams();

  function acceptSuggestedTitle(suggestion) {
    if (!suggestion || !suggestion.title || !tune) return
    tune.name = suggestion.title
    tune.id = params.tuneId
    tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
  }

  function saveLyrics(lines) {
    setPlainLyricLines(tune, lines)
    tune.id = params.tuneId
    tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
  }

  function applyLyricsText(next) {
    const text = next == null ? '' : String(next)
    setLyricsText(text)
    if (lyricsSaveTimeout.current) clearTimeout(lyricsSaveTimeout.current)
    lyricsSaveTimeout.current = setTimeout(function() {
      lyricsSaveTimeout.current = null
      saveLyrics(text.split('\n'))
    }, 500)
  }

  function applyLyricsNow(lines) {
    const text = Array.isArray(lines) ? lines.join('\n') : String(lines || '')
    if (lyricsSaveTimeout.current) {
      clearTimeout(lyricsSaveTimeout.current)
      lyricsSaveTimeout.current = null
    }
    setLyricsText(text)
    saveLyrics(text.split('\n'))
  }

  useEffect(function() {
    return function() {
      if (lyricsSaveTimeout.current) clearTimeout(lyricsSaveTimeout.current)
    }
  }, [])

  function acceptSuggestedGenre(genre) {
    if (!tune || !genre) return
    if (!Array.isArray(tune.genres)) tune.genres = []
    tune.genres = mergeBibliographicList(tune.genres, [genre])
    tune.id = params.tuneId
    tunebook.saveTune(tune, false, { historyLabel: 'Apply suggested genre', immediate: true })
  }

  function openLyricsToolsFromSelection() {
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

    if (resolverChecked && !resolverAvailable) {
      toast.warning(networkUnavailableMessage('Lyrics tools are unavailable because the local resolver is not running.'))
      return
    }

    setLyricsToolsQuery(firstLine)
    setShowLyricsTools(true)
  }

  function tuneHasNotationForStripWarning() {
    if (!tune || !tune.voices) return false
    const voiceKey = resolvePrimaryVoiceKey(tune.voices)
    const voice = tune.voices[voiceKey]
    const notes = voice && Array.isArray(voice.notes) ? voice.notes : []
    if (noteLinesHaveRealMelody(notes)) return true
    return notes.some(function(line) { return String(line || '').trim().length > 0 })
  }

  function requestStripChordsFromLyrics() {
    const lines = String(lyricsText || '').split('\n')
    if (!hasLyricEmbeddedChords(lines)) {
      toast.info('No chords to strip')
      return
    }
    setShowStripChordsConfirm(true)
  }

  function confirmStripChordsFromLyrics() {
    const lines = String(lyricsText || '').split('\n')
    applyLyricsNow(stripChordsFromLyricLines(lines))
    setShowStripChordsConfirm(false)
    toast.success('Chords stripped from lyrics')
  }

  function stripChordsFromLyrics() {
    requestStripChordsFromLyrics()
  }

  return (
    <>
        <button type="button" className="title-lyrics-edit-trigger" onClick={handleShow}>{tune ? tune.name : ''}</button>

        <Modal
          show={show}
          onHide={handleClose}
          {...responsiveModalProps}
          dialogClassName="title-lyrics-editor-modal--chords-preview"
        >
        <Modal.Header closeButton>
          <Modal.Title>Edit</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button  style={{float:'right'}} variant="success" onClick={handleClose} >OK</Button>

          <EditorAddFromToolbar
            tune={tune}
            currentTuneId={params.tuneId || (tune && tune.id)}
            tunebook={tunebook}
            token={token}
            abcjsParser={abcjsParser}
            resolverAvailable={resolverAvailable}
            onApplyTune={function(importedTune) {
              if (!importedTune || !tune) return
              if (importedTune.name) tune.name = importedTune.name
              if (importedTune.composer) tune.composer = importedTune.composer
              if (importedTune.artists) {
                tune.artists = mergeBibliographicList(tune.artists, importedTune.artists)
              }
              if (importedTune.aliases) {
                tune.aliases = mergeBibliographicList(tune.aliases, importedTune.aliases)
              }
              if (Array.isArray(importedTune.wLines) && importedTune.wLines.length) {
                applyLyricsNow(importedTune.wLines)
              } else if (Array.isArray(importedTune.words) && importedTune.words.length) {
                applyLyricsNow(importedTune.words)
              }
              if (importedTune.key) tune.key = importedTune.key
              if (importedTune.genre || (Array.isArray(importedTune.genres) && importedTune.genres.length)) {
                if (!Array.isArray(tune.genres)) tune.genres = []
                if (importedTune.genre) {
                  tune.genres = mergeBibliographicList(tune.genres, importedTune.genre)
                }
                if (Array.isArray(importedTune.genres)) {
                  tune.genres = mergeBibliographicList(tune.genres, importedTune.genres)
                }
              }
              tune.id = params.tuneId
              tunebook.saveTune(tune, false, { historyLabel: 'Add From import' })
              toast.success('Imported into this tune')
            }}
          />

             <Form.Group className="mb-3" controlId="title">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                          <Form.Label style={{ marginBottom: 0 }}>Title</Form.Label>
                          <CapitalizeTitleButton
                            value={tune.name}
                            onCapitalize={function(next) {
                              tune.name = next
                              tune.id = params.tuneId
                              tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                            }}
                          />
                        </div>
                        <VoiceFillInput
                          type="text"
                          placeholder=""
                          value={tune.name ? tune.name : ''}
                          onChange={function(e) {
                          tune.name = e.target.value
                          tune.id = params.tuneId
                          tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                        }}
                          fieldKind="title"
                          token={token}
                          setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
                        />
                      </Form.Group>

                      <Form.Group className="mb-3" controlId="composer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                          <Form.Label style={{ marginBottom: 0 }}>Composer</Form.Label>
                          <ComposerSearchButton
                            tuneId={params.tuneId || (tune && tune.id)}
                            title={tune.name || ''}
                            composer={tune && tune.composer ? tune.composer : ''}
                            titleHint={tune.name || ''}
                            token={token}
                            tunebook={tunebook}
                            disabled={!(tune && tune.name && String(tune.name).trim())}
                            inline={true}
                            existingArtists={tune.artists}
                            onComposer={function(result) {
                              if (result && result.artist) {
                                tune.composer = result.artist
                                tune.id = params.tuneId
                                tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                              }
                            }}
                            onAddArtist={function(artistName) {
                              tune.artists = mergeBibliographicList(tune.artists, [artistName])
                              tune.id = params.tuneId
                              tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                            }}
                            onSuggestedTitle={acceptSuggestedTitle}
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
                      <TuneArtistsField
                        value={tune.artists}
                        onChange={function(artists) {
                          tune.artists = artists
                          tune.id = params.tuneId
                          tunebook.saveTune(tune, false, { historyLabel: 'Edit title/lyrics' })
                        }}
                      />
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
                        <LyricsSectionsDropdown
                          lyricsText={lyricsText}
                          textareaRef={lyricsTextareaRef}
                          tunebook={tunebook}
                          onChange={function(text) { applyLyricsNow(String(text || '').split(/\r?\n/)) }}
                        />
                        <LyricsSearchButton
                          tuneId={params.tuneId || (tune && tune.id)}
                          title={tune.name}
                          artist={tune.composer || ''}
                          rhythm={tune.rhythm || ''}
                          currentGenres={allGenres(tune)}
                          onGenreAccept={acceptSuggestedGenre}
                          token={token}
                          tunebook={tunebook}
                          resolverAvailable={resolverAvailable}
                          existingLyrics={lyricsText}
                          onLyrics={function(result) { applyLyricsNow(result.lines) }}
                          onChords={function(result) {
                            const committed = commitChordSearchResultToTune({
                              result: result,
                              tune: tune,
                              tunebook: tunebook,
                              abcjsParser: abcjsParser,
                              updateLyrics: true,
                              // Lyrics editor: keep chords in the lyrics field.
                              skipAbcMerge: true,
                              historyLabel: 'Search chords and lyrics',
                            })
                            if (!committed.ok) {
                              toast.error(
                                (committed.error && committed.error.message)
                                  ? committed.error.message
                                  : 'Could not apply chord search result'
                              )
                              return
                            }
                            if (committed.updateLyrics && Array.isArray(committed.lyricLines)) {
                              applyLyricsNow(committed.lyricLines)
                            }
                            toast.success('Chords and lyrics updated from search')
                          }}
                        />
                        <Button
                          variant="outline-primary"
                          style={{display: 'inline-flex', alignItems: 'center', gap: '0.35em'}}
                          title="Remove chord lines and inline ChordPro chords"
                          onClick={stripChordsFromLyrics}
                        >
                          {tunebook.icons.eraser} Strip chords
                        </Button>
                        <Button
                          variant="outline-primary"
                          style={{display: 'inline-flex', alignItems: 'center', gap: '0.35em'}}
                          title="Open lyrics tools with selected text"
                          onClick={openLyricsToolsFromSelection}
                        >
                          {tunebook.icons.quillpen} Tools
                        </Button>
                        <Button
                          variant="outline-secondary"
                          style={{ marginLeft: 'auto' }}
                          onClick={function() { setShowNoteAlignedLyrics(true) }}
                        >
                          Note-aligned lyrics
                        </Button>
                        </div>
                        <div className="abc-editor-lyrics-split title-lyrics-editor-split">
                          <div className="abc-editor-lyrics-split-editor">
                            <textarea
                              ref={lyricsTextareaRef}
                              value={lyricsText}
                              onChange={function(e) { applyLyricsText(e.target.value) }}
                              className="title-lyrics-editor-textarea"
                              style={{width:'100%', minHeight:'12em'}}
                            />
                          </div>
                          <LyricsEditorChordsPreview
                            tune={tune}
                            tunebook={tunebook}
                            lyricsText={lyricsText}
                          />
                        </div>
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
      <LyricsToolsModal
        show={showLyricsTools}
        onHide={function() { setShowLyricsTools(false) }}
        query={lyricsToolsQuery}
        token={token}
      />
      <Modal
        show={showStripChordsConfirm}
        onHide={function() { setShowStripChordsConfirm(false) }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Strip chords from lyrics?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="mb-0">
            <StripChordsWarningBody hasNotation={tuneHasNotationForStripWarning()} />
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowStripChordsConfirm(false) }}>
            Cancel
          </Button>
          <Button variant="warning" onClick={confirmStripChordsFromLyrics}>
            Strip chords
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
