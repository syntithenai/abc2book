import React, { useEffect, useState, useRef } from "react";
import {useParams} from 'react-router-dom'
import abcjs from "abcjs";
import {Container, Row, Col, Tabs, Tab, Form, Button, ButtonGroup, Modal} from 'react-bootstrap'
import { toast } from 'react-toastify'
import Abc from './Abc'
import NotationEditor from './NotationEditor'
import { nextVoiceKey, reorderVoicesObject, orderedVoiceKeys } from '../voiceKeyOrder'
import { lyricLinesToText, wLinesEditorText, setPlainLyricLines, setNoteAlignedLyricLines } from '../wLinesUtils'
import LinksEditor from './LinksEditor'
import NoteAlignedLyricsModal from './NoteAlignedLyricsModal'
import LyricsToolsModal from './LyricsToolsModal'
import LyricsSectionsDropdown from './LyricsSectionsDropdown'
import PasteChordSheetModal from './PasteChordSheetModal'
import LyricChordSheetEditorModal from './LyricChordSheetEditorModal'
import useAbcjsParser from '../useAbcjsParser'
import { commitPasteChordSheetToTune } from '../commitPasteChordSheetToTune'
import { commitChordSearchResultToTune } from '../commitChordSearchResultToTune'
import TablatureSelector from './TablatureSelector'
//import ImagesEditor from './ImagesEditor'
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import ComposerNameInput from './ComposerNameInput'
import CollapsibleButtonRow from './CollapsibleButtonRow'
import LyricsSearchButton from './LyricsSearchButton'
import ComposerSearchButton from './ComposerSearchButton'
import TuneBackgroundSearchButton from './TuneBackgroundSearchButton'
import GenreSearchButton from './GenreSearchButton'
import ArtistsSearchButton from './ArtistsSearchButton'
import AliasesSearchButton from './AliasesSearchButton'
import CapitalizeTitleButton from './CapitalizeTitleButton'
import VoiceFillInput from './VoiceFillInput'
import useMediaResolverHealth from '../useMediaResolverHealth'
import MarkdownContent from './MarkdownContent'
import { FormLabelWithHelp } from './FormFieldHelp'
import KeySignatureInput from './KeySignatureInput'
import { EDITOR_INFO_FIELD_HELP } from '../formFieldHelpText'
import {
  normalizeEditorViewMode,
  isNotationEditorView,
  editorViewModeToNotationView,
} from '../viewModeUtils'
import TuneAliasesField from './TuneAliasesField'
import TuneArtistsField from './TuneArtistsField'
import TuneGenresField from './TuneGenresField'
import TuneAlbumsField from './TuneAlbumsField'
import AlbumsSearchButton from './AlbumsSearchButton'
import BookSelectorModal from './BookSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import { allGenres, mergeBibliographicList } from '../tuneBibliographicUtils'
import {
  invalidateChordBlockCache,
  syncChordSectionLabelsFromPrimaryVoice,
} from '../chordBlockMerge'
import { hasLyricEmbeddedChords, stripChordsFromLyricLines } from '../chordSheetUtils'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'


export default function AbcEditor(props) {
  const [abcText, setAbcText] = useState(props.abc);
  const [currentVoice, setCurrentVoice] = useState(0);
  const editorViewMode = normalizeEditorViewMode(props.editorViewMode);
  let params = useParams();
  const { available: resolverAvailable } = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  var tune = props.tune
  
  //var inputRefs = []
  const [warnings, setWarnings] = useState([])
  var [saveTimeout, setSaveTimeout] = useState(null)
  var [chordsChanged, setChordsChanged] = useState(false)
  const [blockLyricsText, setBlockLyricsText] = useState('')
  const [alignedLyricsText, setAlignedLyricsText] = useState('')
  const [showNoteAlignedLyrics, setShowNoteAlignedLyrics] = useState(false)
  const [showLyricsTools, setShowLyricsTools] = useState(false)
  const [lyricsToolsQuery, setLyricsToolsQuery] = useState('')
  const [showLyricsPaste, setShowLyricsPaste] = useState(false)
  const [showLyricChordSheet, setShowLyricChordSheet] = useState(false)
  const wLyricsTextareaRef = useRef(null)
  const [pendingChordImport, setPendingChordImport] = useState('')
  const wLinesSaveTimeout = useRef(null)
  const alignedLyricsSaveGenRef = useRef(0)
  const [abcRecordExpanded, setAbcRecordExpanded] = useState(false)
  const [notationIssueCounts, setNotationIssueCounts] = useState({ errorCount: 0, warningCount: 0 })
  const [backgroundInfoText, setBackgroundInfoText] = useState('')
  const [backgroundInfoPreview, setBackgroundInfoPreview] = useState(false)
  const backgroundInfoSaveTimeout = useRef(null)
  const tuneId = tune && tune.id

  function acceptSuggestedTitle(suggestion) {
    if (!suggestion || !suggestion.title || !tune) return
    tune.name = suggestion.title
    tune.id = params.tuneId
    saveTune(tune)
  }

  useEffect(function() {
    setBlockLyricsText(lyricLinesToText(tune))
    setBackgroundInfoText(tune && typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : '')
    setBackgroundInfoPreview(false)
  }, [props.abc, tune, tuneId])

  useEffect(function() {
    setAlignedLyricsText(wLinesEditorText(tune))
  }, [tuneId])
  
  useEffect(function() {
    return function() {
      if (wLinesSaveTimeout.current) clearTimeout(wLinesSaveTimeout.current)
      if (backgroundInfoSaveTimeout.current) clearTimeout(backgroundInfoSaveTimeout.current)
    }
  }, [])
  //var [tune, setTune] = useState(null)
  //var [noteSaveTimeout, setNoteSaveTimeout] = useState(null)
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
    //}
    //props.mediaController.setTune(props.tune)
    //props.mediaController.setSrc('')
  }, [props.abc]);
  
  
  
  
  function onWarnings(warnings) {
    setWarnings(warnings)
  }

  function saveTune(tune, options) {
    if (props.alignedLyricsOnly) {
      tune.words = []
    }
    return props.tunebook.saveTune(tune, false, options)
  }

  function acceptSuggestedGenre(genre) {
    if (!tune || !genre) return
    if (!Array.isArray(tune.genres)) tune.genres = []
    tune.genres = mergeBibliographicList(tune.genres, [genre])
    tune.id = params.tuneId
    saveTune(tune, { historyLabel: 'Apply suggested genre', immediate: true })
  }


  //var abcForDisplay = []
  //abcForDisplay.push(Array.isArray(tune.notes) ? tune.notes.join("\n") : '')
  
  function tuneVoiceMetaChanged(voice, meta, historyLabel) {
    if (tune && tune.voices && tune.voices.hasOwnProperty(voice)) {
      tune.voices[voice].meta = meta;
      tune.id = params.tuneId;
      saveTune(tune, { historyLabel: historyLabel || 'Edit voice name' });
    }
  }

  function tuneNotesChanged(voice, notes, historyLabel, historyOptions) {
    if (tune && tune.voices && tune.voices.hasOwnProperty(voice)) {
      var v = props.tunebook.abcTools.justNotes(notes); 
      tune.voices[voice].notes = v.split("\n")
      tune.id = params.tuneId
      const primaryVoice = resolvePrimaryVoiceKey(tune.voices)
      if (String(voice) === String(primaryVoice)) {
        invalidateChordBlockCache(tune)
        syncChordSectionLabelsFromPrimaryVoice(tune, tune.voices[voice].notes)
      }
      saveTune(tune, {
        historyLabel: historyLabel || 'Edit notes',
        immediate: !!(historyOptions && historyOptions.immediate),
      }) 
      //setTune(tune)
    }
  }
    //setAbcTuneNotes(v); 
      //if (tune) {
        //tune.notes = v.split("\n") 
        //tune.id = params.tuneId
        ////setAbcTune(props.tunebook.abcTools.json2abc(tune)) ; 
        ////if (noteSaveTimeout) clearTimeout(noteSaveTimeout)
        ////setNoteSaveTimeout(setTimeout(function() {
          //props.tunebook.saveTune(tune) 
        //}
    //}, 500))
   //}
  //<span style={{fontSize:'0.5em'}} >{tune.key ? <>Key: <b>{tune.key}</b></> : null} {tune.meter ? <>Time Signature: <b>{tune.meter}</b></> : null}</span>
  
  function onAbcClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent, textareaEl) {
    var voice = analysis.voice
    setCurrentVoice(voice)
    if (tune && tune.voices && textareaEl) {
      var voiceNames = orderedVoiceKeys(tune)
      var voiceName = voiceNames.length > voice ? voiceNames[voice] : null
      if (voiceName) {
        var voiceParts = abcText.split("\nV:"+voiceName)
        if (voiceParts.length > 1) {
          var voiceInnerParts = voiceParts[1].split("\n")
          if (voiceInnerParts.length > 1) {
            var splitOffset = voiceName.length + 3
            var before = voiceParts[0].length + voiceInnerParts[0].length + splitOffset
            setTimeout(function() {
              textareaEl.setSelectionRange(abcelem.startChar - before, abcelem.endChar - before)
              textareaEl.focus()
            }, 200)
          }
        }
      }
    }
  }
  
  function addVoice() {
    var keys = orderedVoiceKeys(tune)
    var key = nextVoiceKey(tune.voices)
    tune.voiceOrder = keys.concat([key])
    tune.voices = reorderVoicesObject(tune.voices, tune.voiceOrder)
    tune.voices[key] = {
      meta: 'Voice ' + key + ' clef=treble',
      notes: ['%%MIDI program 0', ''],
    }
    tune.id = params.tuneId
    saveTune(tune)
    setCurrentVoice(keys.length)
    props.forceRefresh()
  }

  function reorderVoices(orderedKeys) {
    if (!orderedKeys || !orderedKeys.length) return
    var currentKey = orderedVoiceKeys(tune)[currentVoice]
    tune.voiceOrder = orderedKeys.slice()
    tune.voices = reorderVoicesObject(tune.voices, orderedKeys)
    var nextIndex = orderedKeys.indexOf(currentKey)
    if (nextIndex >= 0) setCurrentVoice(nextIndex)
    tune.id = params.tuneId
    saveTune(tune, { historyLabel: 'Reorder voices' })
    props.forceRefresh()
  }


  function deleteVoice(key) {
    const names = orderedVoiceKeys(tune);
    const deleteIndex = names.indexOf(key);
    delete tune.voices[key];
    tune.voiceOrder = orderedVoiceKeys(tune).filter(function(k) { return k !== key; });
    const remaining = orderedVoiceKeys(tune);
    if (remaining.length === 0) {
      tune.voices['1'] = { meta: 'Voice 1 clef=treble', notes: ['%%MIDI program 0', ''] };
      setCurrentVoice(0);
    } else if (deleteIndex <= currentVoice) {
      setCurrentVoice(Math.max(0, currentVoice - 1));
    }
    tune.id = params.tuneId;
    saveTune(tune);
    props.forceRefresh();
  }
  
  //tempo={tune.tempo > 0 ? tune.tempo : 100} meter={tune.meter}
  if (!tune) {
    return null
  }

  function renderMusicEditor() {
    if (!tune.voices) {
      return (
        <Abc showRepeats={true} mediaController={props.mediaController} audioRenderTimeout={30000} tunebook={props.tunebook} abc={props.abc} onWarnings={onWarnings} distempo={tune && tune.tempo > 0 ? tune.tempo : null} showTempoSlider={true} editableTempo={true} meter={tune.meter} onClick={onAbcClick} />
      )
    }
    var voiceNames = orderedVoiceKeys(tune)
    var voiceKey = voiceNames.length > currentVoice ? voiceNames[currentVoice] : voiceNames[0]
    var voiceNotes = voiceKey && tune.voices[voiceKey]
      ? (Array.isArray(tune.voices[voiceKey].notes) ? tune.voices[voiceKey].notes.join('\n') : '')
      : ''
    return (
      <NotationEditor
        tune={tune}
        abc={props.abc}
        tunebook={props.tunebook}
        mediaController={props.mediaController}
        voiceKey={voiceKey}
        voiceIndex={currentVoice}
        voiceNames={voiceNames}
        voiceNotes={voiceNotes}
        onVoiceSelect={setCurrentVoice}
        onAddVoice={addVoice}
        onDeleteVoice={deleteVoice}
        onReorderVoices={reorderVoices}
        onVoiceNotesChange={function(vk, notesText, label, options) { tuneNotesChanged(vk, notesText, label, options) }}
        onVoiceMetaChange={function(vk, meta) { tuneVoiceMetaChanged(vk, meta) }}
        onActiveVoicesChange={function(voiceKeys) {
          tune.activeVoices = Array.isArray(voiceKeys) ? voiceKeys.slice() : []
          tune.id = params.tuneId
          saveTune(tune, { historyLabel: 'Active voices' })
          if (props.forceRefresh) props.forceRefresh()
        }}
        onWarnings={onWarnings}
        onIssueCountsChange={setNotationIssueCounts}
        onAbcClick={onAbcClick}
        forceRefresh={props.forceRefresh}
        controlledView={editorViewModeToNotationView(editorViewMode)}
        hideViewSelector={true}
        suppressInlineViewSelector={props.suppressInlineViewSelector}
        onEditorViewChange={props.onEditorViewModeChange}
        onHelpModeChange={props.onNotationHelpModeChange}
        historyControls={props.historyControls}
        onRegisterFlushCommit={props.onRegisterFlushCommit}
        token={props.token}
        pendingChordImport={pendingChordImport}
        onConsumePendingChordImport={function() { setPendingChordImport('') }}
        autoActivateChordRecord={props.autoActivateChordRecord}
        autoStartChordSearch={props.autoStartChordSearch}
        onChordsSaveTune={function() { saveTune(tune) }}
        onGenreAccept={acceptSuggestedGenre}
        onChordsLyricsImport={function(lines) {
          setBlockLyricsText(lines.join('\n'))
          setPlainLyricLines(tune, lines)
          tune.id = params.tuneId
          saveTune(tune, { historyLabel: 'Search chords and lyrics', immediate: true })
        }}
      />
    )
  }

  function handleBlockLyricsTextChange(next) {
    setBlockLyricsText(next)
    if (wLinesSaveTimeout.current) clearTimeout(wLinesSaveTimeout.current)
    wLinesSaveTimeout.current = setTimeout(function() {
      setPlainLyricLines(tune, next.split('\n'))
      tune.id = params.tuneId
      saveTune(tune)
    }, 500)
  }

  function handleAlignedLyricsTextChange(next) {
    setAlignedLyricsText(next)
    if (wLinesSaveTimeout.current) clearTimeout(wLinesSaveTimeout.current)
    const saveGen = alignedLyricsSaveGenRef.current + 1
    alignedLyricsSaveGenRef.current = saveGen
    wLinesSaveTimeout.current = setTimeout(function() {
      if (saveGen !== alignedLyricsSaveGenRef.current) return
      setNoteAlignedLyricLines(tune, next.split('\n'))
      tune.id = params.tuneId
      saveTune(tune)
    }, 300)
  }

  function getFirstSelectedLine(textValue, selectionStart, selectionEnd) {
    const text = String(textValue || '')
    const start = Number.isFinite(selectionStart) ? selectionStart : 0
    const end = Number.isFinite(selectionEnd) ? selectionEnd : 0
    if (end <= start) return ''
    const selected = text.slice(start, end).trim()
    if (!selected) return ''
    return selected.split(/\r?\n/).map(function(line) { return line.trim() }).find(function(line) { return !!line }) || ''
  }

  function openLyricsToolsFromSelection() {
    const textarea = wLyricsTextareaRef.current
    if (!textarea) {
      toast.warning('Select lyrics text first to open tools.')
      return
    }
    const firstLine = getFirstSelectedLine(textarea.value, textarea.selectionStart, textarea.selectionEnd)
    if (!firstLine) {
      toast.warning('Select at least one line in the lyrics editor to open tools.')
      return
    }
    if (resolverAvailable === false) {
      toast.warning('Lyrics tools are unavailable because the local resolver is not running.')
      return
    }
    setLyricsToolsQuery(firstLine)
    setShowLyricsTools(true)
  }

  function stripChordsFromBlockLyrics() {
    const lines = blockLyricsText.split('\n')
    if (!hasLyricEmbeddedChords(lines)) {
      toast.info('No chords to strip')
      return
    }
    const stripped = stripChordsFromLyricLines(lines)
    const next = stripped.join('\n')
    if (wLinesSaveTimeout.current) clearTimeout(wLinesSaveTimeout.current)
    setBlockLyricsText(next)
    setPlainLyricLines(tune, stripped)
    tune.id = params.tuneId
    saveTune(tune, { historyLabel: 'Strip chords from lyrics', immediate: true })
    toast.success('Chords stripped from lyrics')
  }

  function renderNoteAlignedLyricsButton(extraStyle) {
    return (
      <Button
        variant="outline-secondary"
        style={extraStyle || undefined}
        onClick={function() { setShowNoteAlignedLyrics(true) }}
      >
        Note-aligned lyrics
      </Button>
    )
  }

  function renderEditorPanel() {
    if (editorViewMode === 'music') {
      return (
        <div className="abc-editor-music-panel">
          <div className="abc-editor-music-notation">
            {renderMusicEditor()}
          </div>
          <div className="abc-editor-music-lyrics">
            <div className="abc-editor-music-lyrics-label">Lyrics</div>
            <textarea
              className="abc-editor-music-lyrics-textarea"
              value={alignedLyricsText}
              aria-label="Time-aligned lyrics"
              onChange={function(e) { handleAlignedLyricsTextChange(e.target.value) }}
            />
          </div>
        </div>
      )
    }
    if (isNotationEditorView(editorViewMode)) {
      return renderMusicEditor()
    }
    if (editorViewMode === 'info') {
      const selectedBooks = Array.isArray(tune.books)
        ? tune.books.map(function(item) { return String(item || '').trim() }).filter(Boolean)
        : []
      const primaryBook = selectedBooks[0] || ''
      const selectedTags = Array.isArray(tune.tags)
        ? tune.tags.map(function(item) { return String(item || '').trim() }).filter(Boolean)
        : []
      const selectedAlbums = Array.isArray(tune.albums)
        ? tune.albums.map(function(item) { return String(item || '').trim() }).filter(Boolean)
        : []
      return (
                    <>
                    <Form className="abc-editor-info-form">
                      <div className="abc-editor-info-section">
                      <Row>
                        <Col xs={12} md={6}>
                          <div className="abc-editor-info-field-block">
                          <Form.Group className="mb-0" controlId="title">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                              <Form.Label style={{ marginBottom: 0 }}>Title</Form.Label>
                              <CapitalizeTitleButton
                                value={tune.name}
                                onCapitalize={function(next) {
                                  tune.name = next
                                  tune.id = params.tuneId
                                  saveTune(tune)
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
                              saveTune(tune)
                            }}
                              fieldKind="title"
                              token={props.token}
                              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                            />
                          </Form.Group>
                          </div>
                        </Col>
                        <Col xs={12} md={6}>
                          <div className="abc-editor-info-field-block">
                          <Form.Group className="mb-0" controlId="composer">
                            <ComposerSearchButton
                              tuneId={params.tuneId || tune.id}
                              title={tune.name || ''}
                              composer={tune && tune.composer ? tune.composer : ''}
                              titleHint={tune.name || ''}
                              token={props.token}
                              tunebook={props.tunebook}
                              resolverAvailable={resolverAvailable}
                              disabled={!(tune && tune.name && String(tune.name).trim())}
                              existingArtists={tune.artists}
                              onComposer={function(result) {
                                if (result && result.artist) {
                                  tune.composer = result.artist
                                  tune.id = params.tuneId
                                  saveTune(tune)
                                }
                              }}
                              onAddArtist={function(artistName) {
                                tune.artists = mergeBibliographicList(tune.artists, [artistName])
                                tune.id = params.tuneId
                                saveTune(tune)
                              }}
                              onSuggestedTitle={acceptSuggestedTitle}
                            >
                              {function(api) {
                                return (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                                      <Form.Label style={{ marginBottom: 0 }}>Composer</Form.Label>
                                      {api.buttonGroup}
                                    </div>
                                    <ComposerNameInput
                                      controlId="composer"
                                      value={tune && tune.composer ? tune.composer : ''}
                                      placeholder="Type composer name"
                                      token={props.token}
                                      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                                      onChange={function(e) {
                                        tune.composer = e.target.value
                                        tune.id = params.tuneId
                                        saveTune(tune)
                                      }}
                                    />
                                    {api.errorNode}
                                  </>
                                )
                              }}
                            </ComposerSearchButton>
                          </Form.Group>
                          </div>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section">
                      <Row>
                        <Col xs={12} md={4}>
                          <div className="abc-editor-info-field-block">
                          <Form.Group className="mb-0" controlId="genre">
                            <GenreSearchButton
                              tuneId={params.tuneId || tune.id}
                              title={tune.name || ''}
                              artist={tune.composer || ''}
                              rhythm={tune.rhythm || ''}
                              currentGenres={allGenres(tune)}
                              backgroundInfo={tune.backgroundInfo || ''}
                              token={props.token}
                              tunebook={props.tunebook}
                              disabled={!(tune && tune.name && String(tune.name).trim())}
                              onAddGenre={function(genre) {
                                if (!Array.isArray(tune.genres)) tune.genres = []
                                tune.genres = mergeBibliographicList(tune.genres, [genre])
                                tune.id = params.tuneId
                                saveTune(tune)
                              }}
                            >
                              {function(api) {
                                return (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                                      <Form.Label style={{ marginBottom: 0 }}>Genres</Form.Label>
                                      {api.buttonGroup}
                                    </div>
                                    <TuneGenresField
                                      label=""
                                      className="mb-0"
                                      value={allGenres(tune)}
                                      onChange={function(genres) {
                                        tune.genres = genres
                                        tune.id = params.tuneId
                                        saveTune(tune)
                                      }}
                                    />
                                    {api.errorNode}
                                  </>
                                )
                              }}
                            </GenreSearchButton>
                          </Form.Group>
                          </div>
                        </Col>
                        <Col xs={12} md={4}>
                          <div className="abc-editor-info-field-block">
                          <ArtistsSearchButton
                            tuneId={params.tuneId || tune.id}
                            title={tune.name || ''}
                            artist={tune.composer || ''}
                            token={props.token}
                            existingArtists={tune.artists}
                            tunebook={props.tunebook}
                            disabled={!(tune && tune.name && String(tune.name).trim())}
                            onAddArtist={function(artistName) {
                              tune.artists = mergeBibliographicList(tune.artists, [artistName])
                              tune.id = params.tuneId
                              saveTune(tune)
                            }}
                          >
                            {function(api) {
                              return (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                                    <Form.Label style={{ marginBottom: 0 }}>Artists</Form.Label>
                                    {api.buttonGroup}
                                  </div>
                                  <TuneArtistsField
                                    label=""
                                    className="mb-0"
                                    value={tune.artists}
                                    onChange={function(artists) {
                                      tune.artists = artists
                                      tune.id = params.tuneId
                                      saveTune(tune)
                                    }}
                                  />
                                  {api.errorNode}
                                </>
                              )
                            }}
                          </ArtistsSearchButton>
                          </div>
                        </Col>
                        <Col xs={12} md={4}>
                          <div className="abc-editor-info-field-block">
                          <AliasesSearchButton
                            tuneId={params.tuneId || tune.id}
                            title={tune.name || ''}
                            artist={tune.composer || ''}
                            existingAliases={tune.aliases}
                            tunebook={props.tunebook}
                            resolverAvailable={resolverAvailable}
                            token={props.token}
                            disabled={!(tune && tune.name && String(tune.name).trim())}
                            onAddAlias={function(alias) {
                              tune.aliases = mergeBibliographicList(tune.aliases, [alias])
                              tune.id = params.tuneId
                              saveTune(tune)
                            }}
                          >
                            {function(api) {
                              return (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                                    <Form.Label style={{ marginBottom: 0 }}>Aliases</Form.Label>
                                    {api.buttonGroup}
                                  </div>
                                  <TuneAliasesField
                                    label=""
                                    className="mb-0"
                                    value={tune.aliases}
                                    onChange={function(aliases) {
                                      tune.aliases = aliases
                                      tune.id = params.tuneId
                                      saveTune(tune)
                                    }}
                                  />
                                  {api.errorNode}
                                </>
                              )
                            }}
                          </AliasesSearchButton>
                          </div>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section">
                        <div className="abc-editor-info-books-tags">
                          <div className="abc-editor-info-field-block">
                            <div className="abc-editor-info-label-control-row">
                              <Form.Label className="mb-0">Book(s)</Form.Label>
                              {props.tunebook ? (
                                <ButtonGroup style={{ backgroundColor: '#3f81e3', borderRadius: '10px' }}>
                                  {primaryBook ? (
                                    <Button title="Clear book" onClick={function() {
                                      tune.books = []
                                      tune.id = params.tuneId
                                      saveTune(tune)
                                    }}>
                                      {props.tunebook.icons && props.tunebook.icons.closecircle ? props.tunebook.icons.closecircle : '×'}
                                    </Button>
                                  ) : null}
                                  <BookSelectorModal
                                    forceRefresh={props.forceRefresh}
                                    title="Select a Book"
                                    tunebook={props.tunebook}
                                    value={primaryBook}
                                    onChange={function(val) {
                                      tune.books = val ? [val] : []
                                      tune.id = params.tuneId
                                      saveTune(tune)
                                    }}
                                    defaultOptions={props.tunebook.getTuneBookOptions}
                                    searchOptions={props.tunebook.getSearchTuneBookOptions}
                                    triggerElement={
                                      <Button style={{ marginLeft: '0.1em', color: 'black' }}>
                                        {props.tunebook.icons && props.tunebook.icons.book ? props.tunebook.icons.book : null}{' '}
                                        {primaryBook ? <b>{primaryBook}</b> : 'Select a book'}
                                      </Button>
                                    }
                                  />
                                </ButtonGroup>
                              ) : null}
                            </div>
                          </div>
                          <div className="abc-editor-info-field-block">
                            <div className="abc-editor-info-label-control-row">
                              <Form.Label className="mb-0">Tags</Form.Label>
                              {props.tunebook ? (
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  <TagsSelectorModal
                                    forceRefresh={props.forceRefresh}
                                    tunebook={props.tunebook}
                                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                                    defaultOptions={props.tunebook.getTuneTagOptions}
                                    searchOptions={props.tunebook.getSearchTuneTagOptions}
                                    value={selectedTags}
                                    onChange={function(value) {
                                      tune.tags = Array.isArray(value) ? value : []
                                      tune.id = params.tuneId
                                      saveTune(tune)
                                    }}
                                    showTags={true}
                                  />
                                  <CollapsibleButtonRow
                                    items={selectedTags}
                                    renderItem={function(tag) {
                                      return <Button key={tag} size="sm" variant="outline-info">{tag}</Button>
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="abc-editor-info-field-block">
                            <AlbumsSearchButton
                              tuneId={params.tuneId || tune.id}
                              title={tune.name || ''}
                              artist={tune.composer || ''}
                              performers={Array.isArray(tune.artists) ? tune.artists : []}
                              currentAlbums={selectedAlbums}
                              token={props.token}
                              tunebook={props.tunebook}
                              disabled={!(tune && tune.name && String(tune.name).trim())}
                              onSetAlbums={function(nextAlbums) {
                                tune.albums = Array.isArray(nextAlbums) ? nextAlbums : []
                                tune.id = params.tuneId
                                saveTune(tune)
                              }}
                            >
                              {function(api) {
                                return (
                                  <>
                                    <div className="abc-editor-info-label-control-row">
                                      <Form.Label className="mb-0">Albums</Form.Label>
                                      {api.buttonGroup}
                                    </div>
                                    <TuneAlbumsField
                                      label=""
                                      className="mb-0"
                                      value={selectedAlbums}
                                      onChange={function(albums) {
                                        tune.albums = albums
                                        tune.id = params.tuneId
                                        saveTune(tune)
                                      }}
                                    />
                                    {api.errorNode}
                                  </>
                                )
                              }}
                            </AlbumsSearchButton>
                          </div>
                        </div>
                      </div>

                      <div className="abc-editor-info-section abc-editor-info-section-primary">
                      <Row className="abc-editor-info-primary-row">
                        <Col className="abc-editor-info-field-primary" xs={12} md={5}>
                          <Form.Group className="mb-3" controlId="key">
                            <Form.Label>Key</Form.Label>
                            <KeySignatureInput
                              id="key"
                              value={tune.key ? tune.key : ''}
                              onChange={function(next) {
                                tune.key = next;
                                tune.id = params.tuneId;
                                saveTune(tune);
                              }}
                            />
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary" xs={4} md={2}>
                          <Form.Group className="mb-3" controlId="tuning">
                            <FormLabelWithHelp label="Tuning" htmlFor="tuning" helpBody={EDITOR_INFO_FIELD_HELP.tuning.body} helpTitle={EDITOR_INFO_FIELD_HELP.tuning.title} />
                            <Form.Control type="text" value={tune.tuning ? tune.tuning : ''} onChange={function(e) {tune.tuning = e.target.value;tune.id = params.tuneId; saveTune(tune)  }}/>
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary" xs={4} md={3}>
                          <Form.Group className="mb-3" controlId="transpose">
                            <FormLabelWithHelp label="Transpose" htmlFor="transpose" helpBody={EDITOR_INFO_FIELD_HELP.transpose.body} helpTitle={EDITOR_INFO_FIELD_HELP.transpose.title} />
                            <Form.Control   value={tune.transpose ? tune.transpose : ''} onChange={function(e) {tune.transpose = e.target.value; tune.id = params.tuneId; saveTune(tune)  }}/>
                          </Form.Group>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section abc-editor-info-section-primary">
                      <Row className="abc-editor-info-primary-row">
                        <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                          <Form.Group className="mb-3" controlId="tempo">
                            <Form.Label>Tempo</Form.Label>
                            <Form.Control  type='number' placeholder="eg 100" value={tune.tempo ? tune.tempo : ''} onChange={function(e) {tune.tempo = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
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
                          <Form.Group className="mb-3" controlId="repeats">
                            <FormLabelWithHelp label="Repeats" htmlFor="repeats" helpBody={EDITOR_INFO_FIELD_HELP.repeats.body} helpTitle={EDITOR_INFO_FIELD_HELP.repeats.title} />
                            <Form.Control  type='number' placeholder="eg 3" value={tune.repeats ? tune.repeats : ''} onChange={function(e) {tune.repeats = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                      </Row>
                      <Row className="g-2">
                        <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={6} md={2}>
                          <Form.Group className="mb-3" controlId="boost">
                            <FormLabelWithHelp label="Confidence" htmlFor="boost" helpBody={EDITOR_INFO_FIELD_HELP.boost.body} helpTitle={EDITOR_INFO_FIELD_HELP.boost.title} />
                            <Form.Control type='number' min="0" max="20" placeholder="" value={tune.boost ? tune.boost : ''} onChange={function(e) {tune.boost = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                        <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={6} md={2}>
                          <Form.Group className="mb-3" controlId="difficulty">
                            <FormLabelWithHelp label="Difficulty" htmlFor="difficulty" helpBody={EDITOR_INFO_FIELD_HELP.difficulty.body} helpTitle={EDITOR_INFO_FIELD_HELP.difficulty.title} />
                            <Form.Control type='number' min="0" max="20" placeholder="" value={tune.difficulty ? tune.difficulty : ''} onChange={function(e) {tune.difficulty = e.target.value; tune.id = params.tuneId;  saveTune(tune)  }}  />
                          </Form.Group>
                        </Col>
                      </Row>
                      </div>

                      <div className="abc-editor-info-section abc-editor-info-section-background">
                      <Form.Group className="mb-3 abc-editor-info-background-group" controlId="backgroundInfo">
                        <TuneBackgroundSearchButton
                          tuneId={params.tuneId || tune.id}
                          title={tune.name}
                          artist={tune.composer || ''}
                          lyrics={blockLyricsText}
                          rhythm={tune.rhythm || ''}
                          currentGenres={allGenres(tune)}
                          onGenreAccept={acceptSuggestedGenre}
                          token={props.token}
                          tunebook={props.tunebook}
                          existingBackgroundInfo={backgroundInfoText}
                          onBackgroundInfo={function(result) {
                            setBackgroundInfoText(result.text)
                            setBackgroundInfoPreview(true)
                          }}
                        >
                          {function(api) {
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <FormLabelWithHelp
                                    label="Background information (Markdown)"
                                    helpBody={EDITOR_INFO_FIELD_HELP.backgroundInfo.body}
                                    helpTitle={EDITOR_INFO_FIELD_HELP.backgroundInfo.title}
                                  />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                                    {api.buttonGroup}
                                    <Button
                                      variant="outline-secondary"
                                      size="sm"
                                      disabled={!backgroundInfoText}
                                      onClick={function() { setBackgroundInfoPreview(!backgroundInfoPreview) }}
                                    >
                                      {backgroundInfoPreview ? 'Edit' : 'Preview'}
                                    </Button>
                                  </div>
                                </div>
                                <div className="mt-2">
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
                                </div>
                                {api.errorNode}
                              </>
                            )
                          }}
                        </TuneBackgroundSearchButton>
                      </Form.Group>
                      </div>
                      
                    </Form>
                    <div className="abc-editor-info-form mt-3">
                      <div className="abc-editor-info-section abc-editor-links-section">
                        <div className="abc-editor-info-section-heading">Links</div>
                        <LinksEditor
                          links={tune.links}
                          tune={tune}
                          tuneId={params.tuneId}
                          tunebook={props.tunebook}
                          abc={props.abc}
                          token={props.token}
                          searchIndex={props.searchIndex}
                          loadTuneTexts={props.loadTuneTexts}
                          forceRefresh={props.forceRefresh}
                          mediaController={props.mediaController}
                          login={props.login}
                          onTuneChange={function(updated) {
                            saveTune(Object.assign({}, tune, updated, { id: params.tuneId }))
                          }}
                          onChange={function(links) {
                            tune.links = links;
                            tune.id = params.tuneId;
                            saveTune(tune);
                          }}
                        />
                      </div>
                    </div>
                    <div className="abc-editor-info-form mt-3">
                      <div className="abc-editor-info-section abc-editor-info-section-details">
                        <Row className="abc-editor-info-compact-row g-2 align-items-end">
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
                              <TablatureSelector
                                tune={tune}
                                tunebook={props.tunebook}
                                onChange={function() {
                                  tune.id = params.tuneId
                                  saveTune(tune)
                                  if (props.forceRefresh) props.forceRefresh()
                                }}
                              />
                            </Form.Group>
                          </Col>
                          <Col xs={12} md={5} className="abc-editor-info-compact-field-wide">
                            <Form.Group className="mb-3" controlId="fonts">
                              <FormLabelWithHelp label="Sounds Fonts" helpBody={EDITOR_INFO_FIELD_HELP.soundFonts.body} helpTitle={EDITOR_INFO_FIELD_HELP.soundFonts.title} />
                              <Form.Select value={tune.soundFonts ? tune.soundFonts.trim() : ''} onChange={function(e) { tune.soundFonts = e.target.value ; tune.id = params.tuneId; saveTune(tune)  }} >
                                <option value="" >Auto (resolver MusyngKite when ready)</option>
                                <option value="local">Embedded instruments only</option>
                                <option value="online">Prefer full resolver bank</option>
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
                      </div>
                    </div>
                    <div className="lyrics-expandable-section mt-3">
                      <button
                        type="button"
                        className="lyrics-expandable-section-toggle"
                        onClick={function() { setAbcRecordExpanded(!abcRecordExpanded) }}
                        aria-expanded={abcRecordExpanded}
                      >
                        <span className="lyrics-expandable-section-chevron" aria-hidden="true">
                          {abcRecordExpanded ? '▼' : '▶'}
                        </span>
                        <span className="fw-semibold">ABC Record</span>
                      </button>
                      {abcRecordExpanded ? (
                        <div className="lyrics-expandable-section-body">
                          <Tabs defaultActiveKey="abc-text" id="abc-editor-abc-tabs" className="abc-editor-source-tabs mb-2">
                            <Tab eventKey="abc-text" title="ABC">
                              <textarea
                                className="abc-editor-source-textarea"
                                value={abcText}
                                onChange={function(e) {setAbcText(e.target.value)}}
                                onBlur={function(e) {var tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune, true)}}
                              />
                            </Tab>
                            <Tab eventKey="errors" title={<span>Errors {(warnings && warnings.length > 0 ? warnings.length+' !!' : '')} </span>}>
                              <div id="warnings">
                              {warnings ? warnings.map(function(warning,wk) {
                                var pos = warning.indexOf('<span')
                                return <div key={wk} >{warning.slice(0,pos)}</div>
                              }) : null}
                              </div>
                            </Tab>
                          </Tabs>
                        </div>
                      ) : null}
                    </div>
                    </>
      )
    }
    if (editorViewMode === 'lyrics') {
      return (
                    <div className="abc-editor-lyrics-panel">
                    <div className="abc-editor-lyrics-toolbar">
                      <LyricsSectionsDropdown
                        lyricsText={blockLyricsText}
                        textareaRef={wLyricsTextareaRef}
                        tunebook={props.tunebook}
                        onChange={handleBlockLyricsTextChange}
                      />
                      {renderNoteAlignedLyricsButton()}
                      <Button
                        variant="outline-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
                        title="Open lyrics tools with selected text"
                        onClick={openLyricsToolsFromSelection}
                      >
                        {props.tunebook.icons.quillpen} Tools
                      </Button>
                      <div className="abc-editor-toolbar-end">
                        <LyricsSearchButton
                          tuneId={params.tuneId || tune.id}
                          title={tune.name}
                          artist={tune.composer || ''}
                          rhythm={tune.rhythm || ''}
                          currentGenres={allGenres(tune)}
                          onGenreAccept={acceptSuggestedGenre}
                          token={props.token}
                          tunebook={props.tunebook}
                          existingLyrics={blockLyricsText}
                          confirmOverwriteChords={true}
                          onLyrics={function(result) {
                            const text = result && (result.text
                              || (Array.isArray(result.lines) ? result.lines.join('\n') : ''))
                            if (text) setBlockLyricsText(text)
                          }}
                          onChords={function(result, options) {
                            const committed = commitChordSearchResultToTune({
                              result: result,
                              tune: tune,
                              abc: props.abc,
                              tunebook: props.tunebook,
                              abcjsParser: abcjsParser,
                              updateLyrics: !!(options && options.updateLyrics),
                              historyLabel: (options && options.updateLyrics)
                                ? 'Search chords and lyrics'
                                : 'Search chords',
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
                              setBlockLyricsText(committed.lyricLines.join('\n'))
                            }
                            toast.success(
                              committed.updateLyrics
                                ? 'Chords and lyrics updated from search'
                                : 'Chords updated from search'
                            )
                          }}
                        />
                        <Button
                          variant="outline-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
                          title="Remove chord lines and inline ChordPro chords"
                          onClick={stripChordsFromBlockLyrics}
                        >
                          {props.tunebook.icons.eraser}
                          Strip chords
                        </Button>
                        <Button
                          variant="outline-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
                          title="Edit lyric chord sheet (ChordPro)"
                          onClick={function() {
                            setShowLyricChordSheet(true)
                          }}
                        >
                          {props.tunebook.icons.words}
                          Lyric chord sheet
                        </Button>
                        <Button
                          variant="outline-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
                          title="Paste lyrics and chords"
                          onClick={function() {
                            setShowLyricsPaste(true)
                          }}
                        >
                          {props.tunebook.icons.paste}
                          Paste chords and lyrics
                        </Button>
                      </div>
                    </div>
                    <textarea
                      ref={wLyricsTextareaRef}
                      className="abc-editor-lyrics-textarea"
                      value={blockLyricsText}
                      aria-label="Lyrics"
                      onChange={function(e) { handleBlockLyricsTextChange(e.target.value) }}
                    />
                    <NoteAlignedLyricsModal
                      show={showNoteAlignedLyrics}
                      onHide={function() { setShowNoteAlignedLyrics(false) }}
                      tune={tune}
                      tunebook={props.tunebook}
                      onSaved={function(savedTune) {
                        savedTune.id = params.tuneId
                        saveTune(savedTune, { historyLabel: 'Edit note-aligned lyrics', immediate: true })
                        setAlignedLyricsText(wLinesEditorText(savedTune))
                      }}
                    />
                    <LyricsToolsModal
                      show={showLyricsTools}
                      onHide={function() { setShowLyricsTools(false) }}
                      query={lyricsToolsQuery}
                    />
                    <PasteChordSheetModal
                      show={showLyricsPaste}
                      onHide={function() {
                        setShowLyricsPaste(false)
                      }}
                      tune={tune}
                      tuneSections={[]}
                      forceUpdateLyrics={true}
                      initialUpdateLyrics={true}
                      onSaveSections={function(result) {
                        const committed = commitPasteChordSheetToTune({
                          result: result,
                          tune: tune,
                          abc: props.abc,
                          tunebook: props.tunebook,
                          abcjsParser: abcjsParser,
                          forceUpdateLyrics: true,
                          skipAbcMerge: !!result.skipAbcMerge,
                          historyLabel: result.historyLabel
                            || (result.skipAbcMerge
                              ? 'Update lyric chord sheet'
                              : 'Paste chords and lyrics'),
                        })
                        if (!committed.ok) {
                          toast.error(
                            (committed.error && committed.error.message)
                              ? committed.error.message
                              : 'Could not apply pasted chords and lyrics'
                          )
                          return
                        }
                        if (Array.isArray(committed.lyricLines)) {
                          setBlockLyricsText(committed.lyricLines.join('\n'))
                        }
                        setShowLyricsPaste(false)
                        toast.success(
                          result.skipAbcMerge
                            ? 'Lyric chord sheet updated'
                            : 'Chords and lyrics updated'
                        )
                      }}
                    />
                    <LyricChordSheetEditorModal
                      show={showLyricChordSheet}
                      onHide={function() { setShowLyricChordSheet(false) }}
                      tune={tune}
                      tunebook={props.tunebook}
                      forceRefresh={function() {
                        setBlockLyricsText(lyricLinesToText(tune))
                      }}
                    />
                    </div>
      )
    }
    if (editorViewMode === 'sourceAbc') {
      return (
                    <Tabs defaultActiveKey="abc-text" id="abc-editor-abc-tabs" className="abc-editor-source-tabs mb-2">
                      <Tab eventKey="abc-text" title="ABC">
                        <textarea
                          className="abc-editor-source-textarea"
                          value={abcText}
                          onChange={function(e) {setAbcText(e.target.value)}}
                          onBlur={function(e) {var tune = props.tunebook.abcTools.abc2json(e.target.value); tune.id = params.tuneId; props.tunebook.saveTune(tune, true)}}
                        />
                      </Tab>
                      <Tab eventKey="errors" title={<span>Errors {(warnings && warnings.length > 0 ? warnings.length+' !!' : '')} </span>}>
                        <div id="warnings">
                        {warnings ? warnings.map(function(warning,wk) {
                          var pos = warning.indexOf('<span')
                          return <div key={wk} >{warning.slice(0,pos)}</div>
                        }) : null}
                        </div>
                      </Tab>
                    </Tabs>
      )
    }
    return renderMusicEditor()
  }

  const isLyricsView = editorViewMode === 'lyrics'

  return (
    <div className={'abc-editor' + (isLyricsView ? ' abc-editor--lyrics' : '')} style={isLyricsView ? undefined : {minHeight: '40em'}}>
      <div style={{display: 'none'}} id="audio">Player</div>
      <div className={'abc-editor-panel mt-2' + (isLyricsView ? ' abc-editor-panel--lyrics' : '')}>
        {renderEditorPanel()}
      </div>
    </div>
  )
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
              //</Tab>
