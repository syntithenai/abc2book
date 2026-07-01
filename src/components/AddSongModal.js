import {useState, useEffect, useRef, useMemo, useCallback} from 'react'
import {ListGroup, Button, Modal, Badge, Tabs, Tab, ButtonGroup, Form, Row, Col} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import {useNavigate} from 'react-router-dom'
import CreatableSelect from 'react-select/creatable';
import SelectInput from './SelectInput'
import useMusicBrainz from '../useMusicBrainz'
import TagsSelectorModal from './TagsSelectorModal'
import LyricsSearchButton from './LyricsSearchButton'
import YouTubeSearchModal from './YouTubeSearchModal'
import LocalSearchSelectorModal from './LocalSearchSelectorModal'
import MediaImportWizard from './MediaImportWizard'
import ImportFileModal from './ImportFileModal'
import ImportYouTubeModal from './ImportYouTubeModal'
import ImportCollectionsAccordion from './ImportCollectionsAccordion'
import AddTuneWebSearchButton from './AddTuneWebSearchButton'
import TuneBackgroundSearchButton from './TuneBackgroundSearchButton'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { FormLabelWithHelp } from './FormFieldHelp'
import { ADD_TUNE_FIELD_HELP, EDITOR_INFO_FIELD_HELP } from '../formFieldHelpText'

const DEFAULT_BOOK = 'songs'

function AddSongModal(props) {
  const navigate = useNavigate()
  const musicBrainz = useMusicBrainz()
  const abcjsParser = useAbcjsParser()
  const { available: resolverAvailable, checked: resolverChecked, features } = useMediaResolverHealth()
  const [show, setShow] = useState(props.show === "addTune" || !!props.showImport)
  const [activeTab, setActiveTab] = useState(props.showImport ? 'import' : 'add')

  const [songTitle, setSongTitle] = useState('')
  const [selectedBook, setSelectedBook] = useState(props.currentTuneBook || DEFAULT_BOOK)
  const [songTags, setSongTags] = useState(Array.isArray(props.tagFilter) ? props.tagFilter : [])
  const [songMeter, setSongMeter] = useState('')
  const [songRhythm, setSongRhythm] = useState('')
  const [songWords, setSongWords] = useState('')
  const [songComposer, setSongComposer] = useState('')
  const [songComposerId, setSongComposerId] = useState('')
  const [songNotes, setSongNotes] = useState('')
  const [songImage, setSongImage] = useState(null)
  const [songKey, setSongKey] = useState('')
  const [songTuning, setSongTuning] = useState('')
  const [songTranspose, setSongTranspose] = useState('')
  const [songCapo, setSongCapo] = useState('')
  const [songTempo, setSongTempo] = useState('')
  const [songRepeats, setSongRepeats] = useState('')
  const [songBoost, setSongBoost] = useState('')
  const [songDifficulty, setSongDifficulty] = useState('')
  const [songNoteLength, setSongNoteLength] = useState('')
  const [songTablature, setSongTablature] = useState('')
  const [songSoundFonts, setSongSoundFonts] = useState('')
  const [songSrcUrl, setSongSrcUrl] = useState('')
  const [songBackgroundInfo, setSongBackgroundInfo] = useState('')

  const [timeSignatureOptions, setTimeSignatureOptions] = useState([])
  const [rhythmOptions, setRhythmOptions] = useState([])
  const [artistOptions, setArtistOptions] = useState([])
  const [matchingTunes, setMatchingTunes] = useState([])

  // Staged tune data produced by the media import wizard (lyrics/chords/notes),
  // held until the user confirms by clicking Add.
  const [stagedTune, setStagedTune] = useState(null)
  const [showMediaWizard, setShowMediaWizard] = useState(false)
  const [wizardTune, setWizardTune] = useState(null)
  const [wizardAutoAnalyze, setWizardAutoAnalyze] = useState(false)

  const draftIdRef = useRef(null)
  if (!draftIdRef.current) {
    draftIdRef.current = props.tunebook.utils && props.tunebook.utils.generateObjectId
      ? props.tunebook.utils.generateObjectId()
      : 'draft-' + Date.now()
  }

  var artistLoadTimeout = useRef()
  useEffect(function() {
    if (songComposer) {
      clearTimeout(artistLoadTimeout.current)
      artistLoadTimeout.current = setTimeout(function() {
        musicBrainz.artistOptions(songComposer).then(function(o) {
          setArtistOptions(o.map(function(v) { return v.label }))
        })
      }, 500)
    }
  }, [songComposer, musicBrainz])

  useEffect(function() {
    setSongTags(Array.isArray(props.tagFilter) ? props.tagFilter : [])
  }, [props.tagFilter])

  useEffect(function() {
    var tso = props.tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
      return {value: type, label: type}
    })
    tso.unshift({value: '', label: 'None'})
    setTimeSignatureOptions(tso)
    setRhythmOptions(Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type) {
      return {value: type, label: type}
    }))
  }, [props.tunebook.abcTools])

  const setBlockKeyboardShortcuts = props.setBlockKeyboardShortcuts
  useEffect(function() {
    if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(show)
    return function() {
      if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(false)
    }
  }, [show, setBlockKeyboardShortcuts])

  const filterSearch = useCallback(function(tune) {
    if (!songTitle || songTitle.trim().length < 2) return false
    if (tune && tune.name && tune.name.length > 0 &&
        props.tunebook.utils.toSearchText(tune.name).indexOf(props.tunebook.utils.toSearchText(songTitle)) !== -1) {
      return true
    }
    return false
  }, [songTitle, props.tunebook.utils])

  const cleanNoteLines = useCallback(function(text) {
    return String(text || '').split("\n").filter(function(line) {
      return props.tunebook.abcTools.isNoteLine(line)
    })
  }, [props.tunebook.abcTools])

  useEffect(function() {
    if (songTitle.trim().length > 1 && props.tunes) {
      const matching = Object.values(props.tunes).filter(filterSearch).sort(function(a, b) {
        return (a && b && a.name < b.name) ? -1 : 1
      })
      setMatchingTunes(matching)
    } else {
      setMatchingTunes([])
    }
  }, [songTitle, filterSearch, props.tunes])

  const draftTune = useMemo(function() {
    return {
      id: draftIdRef.current,
      name: songTitle,
      composer: songComposer,
      key: songKey,
      tuning: songTuning,
      transpose: songTranspose,
      capo: songCapo === '' ? undefined : songCapo,
      meter: songMeter,
      rhythm: songRhythm,
      tempo: songTempo,
      repeats: songRepeats,
      boost: songBoost,
      difficulty: songDifficulty,
      noteLength: songNoteLength,
      tablature: songTablature,
      soundFonts: songSoundFonts,
      srcUrl: songSrcUrl,
      backgroundInfo: songBackgroundInfo,
      links: [],
      voices: {'1': {meta: '', notes: cleanNoteLines(songNotes)}},
      words: songWords.trim() ? songWords.split("\n") : [],
    }
  }, [
    songTitle, songComposer, songKey, songTuning, songTranspose, songCapo,
    songMeter, songRhythm, songTempo, songRepeats, songBoost, songDifficulty,
    songNoteLength, songTablature, songSoundFonts, songSrcUrl, songBackgroundInfo,
    songNotes, songWords, cleanNoteLines,
  ])

  const canAdd = songTitle.trim().length > 0 && selectedBook.trim().length > 0

  function applyImportedTune(merged) {
    if (!merged) return
    if (merged.name) setSongTitle(merged.name)
    if (merged.composer) setSongComposer(merged.composer)
    if (merged.composerId) setSongComposerId(merged.composerId)
    if (merged.key) setSongKey(merged.key)
    if (merged.tuning) setSongTuning(merged.tuning)
    if (merged.transpose) setSongTranspose(merged.transpose)
    if (merged.capo !== undefined && merged.capo !== null) setSongCapo(String(merged.capo))
    if (merged.meter) setSongMeter(merged.meter)
    if (merged.rhythm) setSongRhythm(merged.rhythm)
    if (merged.tempo) setSongTempo(String(merged.tempo))
    if (merged.repeats) setSongRepeats(String(merged.repeats))
    if (merged.boost) setSongBoost(String(merged.boost))
    if (merged.difficulty) setSongDifficulty(String(merged.difficulty))
    if (merged.noteLength) setSongNoteLength(merged.noteLength)
    if (merged.tablature) setSongTablature(merged.tablature)
    if (merged.soundFonts) setSongSoundFonts(merged.soundFonts)
    if (merged.srcUrl) setSongSrcUrl(merged.srcUrl)
    if (merged.backgroundInfo) setSongBackgroundInfo(merged.backgroundInfo)
    if (merged.voices) {
      var voiceKey = Object.keys(merged.voices)[0]
      if (voiceKey && merged.voices[voiceKey] && Array.isArray(merged.voices[voiceKey].notes)) {
        setSongNotes(merged.voices[voiceKey].notes.join("\n"))
      }
    }
    if (Array.isArray(merged.wLines) && merged.wLines.length > 0) {
      setSongWords(merged.wLines.join("\n"))
    } else if (Array.isArray(merged.words) && merged.words.length > 0) {
      setSongWords(merged.words.join("\n"))
    }
    setStagedTune(merged)
  }

  function clearForm() {
    setSongTitle('')
    setSelectedBook(props.currentTuneBook || DEFAULT_BOOK)
    setSongTags(Array.isArray(props.tagFilter) ? props.tagFilter : [])
    setSongRhythm('')
    setSongMeter('')
    setSongWords('')
    setSongComposer('')
    setSongComposerId('')
    setSongNotes('')
    setSongImage(null)
    setSongKey('')
    setSongTuning('')
    setSongTranspose('')
    setSongCapo('')
    setSongTempo('')
    setSongRepeats('')
    setSongBoost('')
    setSongDifficulty('')
    setSongNoteLength('')
    setSongTablature('')
    setSongSoundFonts('')
    setSongSrcUrl('')
    setSongBackgroundInfo('')
    setStagedTune(null)
    setWizardTune(null)
    setWizardAutoAnalyze(false)
    setMatchingTunes([])
  }

  const handleClose = () => {
    setShow(false)
    clearForm()
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
  }
  const handleShow = () => {
    clearForm()
    setActiveTab('add')
    setShow(true)
  }

  function openMediaWizardFromYouTube(link) {
    if (!link || !link.link) return
    const tuneWithLink = Object.assign({}, draftTune, {
      links: [{ title: link.title || '', link: link.link, startAt: '', endAt: '' }],
    })
    setWizardTune(tuneWithLink)
    setWizardAutoAnalyze(!!resolverAvailable && !!features.whisper)
    setShowMediaWizard(true)
  }

  function onStageAbcImport(merged) {
    applyImportedTune(merged)
  }

  function handleChordsMerged(chordText) {
    if (!chordText || !chordText.trim()) return
    const currentAbc = props.tunebook.abcTools.json2abc(draftTune)
    const merged = abcjsParser.mergeChords(chordText, currentAbc)
    const noteLines = props.tunebook.abcTools.justNotes(merged)
    setSongNotes(Array.isArray(noteLines) ? noteLines.join("\n") : String(noteLines || ''))
  }

  function onStageMedia(merged) {
    setStagedTune(merged)
    // Reflect imported notes/lyrics/meter in the visible form so they can be reviewed/edited.
    if (merged) {
      if (merged.voices) {
        var voiceKey = Object.keys(merged.voices)[0]
        if (voiceKey && merged.voices[voiceKey] && Array.isArray(merged.voices[voiceKey].notes)) {
          setSongNotes(merged.voices[voiceKey].notes.join("\n"))
        }
      }
      if (Array.isArray(merged.wLines) && merged.wLines.length > 0) {
        setSongWords(merged.wLines.join("\n"))
      } else if (Array.isArray(merged.words) && merged.words.length > 0) {
        setSongWords(merged.words.join("\n"))
      }
      if (merged.meter) setSongMeter(merged.meter)
    }
  }

  function imageSelected(event) {
    function readFile(file) {
      var reader = new FileReader()
      reader.onloadend = function() {
        if (reader.result.trim().length > 0) setSongImage(reader.result)
      }
      if (file) reader.readAsDataURL(file)
    }
    readFile(event.target.files[0])
  }

  function addTune() {
    if (!canAdd) return
    const book = selectedBook.trim().toLowerCase()
    const cleanNotes = cleanNoteLines(songNotes)
    let t
    if (stagedTune) {
      t = JSON.parse(JSON.stringify(stagedTune))
      delete t.id
      var voiceKey = (t.voices && Object.keys(t.voices)[0]) || '1'
      if (!t.voices) t.voices = {}
      t.voices[voiceKey] = Object.assign({}, t.voices[voiceKey] || {meta: '', notes: []}, {notes: cleanNotes})
      if (songWords.trim()) {
        t.wLines = songWords.split("\n")
        delete t.words
      }
      if (songMeter) t.meter = songMeter
    } else {
      t = {
        voices: {'1': {meta: '', notes: cleanNotes}},
        words: songWords.trim() ? songWords.split("\n") : [],
        meter: songMeter,
      }
    }
    t.name = songTitle
    t.tags = songTags
    t.books = [book]
    t.composer = songComposer || t.composer || ''
    t.rhythm = songRhythm || t.rhythm || ''
    if (songKey) t.key = songKey
    if (songTuning) t.tuning = songTuning
    if (songTranspose) t.transpose = songTranspose
    if (songCapo !== '') t.capo = parseInt(songCapo, 10) || 0
    if (songTempo) t.tempo = songTempo
    if (songRepeats) t.repeats = songRepeats
    if (songBoost) t.boost = songBoost
    if (songDifficulty) t.difficulty = songDifficulty
    if (songNoteLength) t.noteLength = songNoteLength
    if (songTablature) t.tablature = songTablature
    if (songSoundFonts) t.soundFonts = songSoundFonts
    if (songSrcUrl) t.srcUrl = songSrcUrl
    if (songBackgroundInfo) t.backgroundInfo = songBackgroundInfo
    if (Array.isArray(stagedTune && stagedTune.links) && stagedTune.links.length > 0) {
      t.links = stagedTune.links
    }
    if (songImage) t.files = [{data: songImage, type: 'image'}]

    var newTune = props.tunebook.saveTune(t)
    props.setFilter('')
    props.forceRefresh()
    var finalTuneBook = props.currentTuneBook
    props.setCurrentTuneBook('')
    setTimeout(function() {
      props.setCurrentTuneBook(finalTuneBook)
      if (newTune && newTune.id) {
        navigate("/tunes/" + newTune.id)
      } else {
        navigate("/tunes")
      }
    }, 800)
    handleClose()
  }

  function openExistingTune(tune) {
    if (tune && tune.id) {
      navigate("/tunes/" + tune.id)
      handleClose()
    }
  }

  const textAreaStyle = {width: '100%', fontSize: '1.05em'}

  function renderAddTab() {
    return (
      <Row>
        <Col md={8}>
          <Form className="abc-editor-info-form" onSubmit={function(e) { e.preventDefault() }}>
            <div className="abc-editor-info-section">
              <Row>
                <Col xs={12} md={6}>
                  <Form.Group className="mb-3" controlId="book">
                    <Form.Label><b>Book</b> {!selectedBook && <span style={{color: '#b00'}}>(required)</span>}</Form.Label>
                    <div>
                      <ButtonGroup style={{backgroundColor: '#3f81e3', borderRadius: '10px'}}>
                        {selectedBook &&
                          <Button title="Clear book" onClick={function() { setSelectedBook('') }}>
                            {props.tunebook.icons.closecircle}
                          </Button>}
                        <BookSelectorModal
                          forceRefresh={props.forceRefresh}
                          title={'Select a Book'}
                          tunebook={props.tunebook}
                          value={selectedBook}
                          onChange={function(val) { setSelectedBook(val) }}
                          defaultOptions={props.tunebook.getTuneBookOptions}
                          searchOptions={props.tunebook.getSearchTuneBookOptions}
                          triggerElement={
                            <Button style={{marginLeft: '0.1em', color: 'black'}}>
                              {props.tunebook.icons.book} {selectedBook ? <b>{selectedBook}</b> : 'Select a book'}
                            </Button>
                          }
                        />
                      </ButtonGroup>
                    </div>
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group className="mb-3" controlId="tags">
                    <Form.Label><b>Tags</b></Form.Label>
                    <div>
                      <TagsSelectorModal
                        forceRefresh={props.forceRefresh}
                        tunebook={props.tunebook}
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        defaultOptions={props.tunebook.getTuneTagOptions}
                        searchOptions={props.tunebook.getSearchTuneTagOptions}
                        value={songTags}
                        onChange={function(value) { setSongTags(value); props.setTagFilter(value) }}
                        showTags={true}
                      />
                      <span>{Array.isArray(songTags) && songTags.map(function(selectedTag) {
                        return <Button key={selectedTag} style={{marginLeft: '0.2em'}} variant="outline-info">{selectedTag}</Button>
                      })}</span>
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </div>

            <div className="abc-editor-info-section">
              <Form.Group className="mb-3" controlId="title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                  <Form.Label style={{ marginBottom: 0 }}><b>Title</b></Form.Label>
                  {songTitle.trim().length > 0 && (
                    <>
                      <AddTuneWebSearchButton
                        title={songTitle}
                        artist={songComposer || ''}
                        rhythm={songRhythm}
                        lyrics={songWords}
                        token={props.token}
                        tunebook={props.tunebook}
                        currentTune={draftTune}
                        searchIndex={props.searchIndex}
                        loadTuneTexts={props.loadTuneTexts}
                        onTuneImported={applyImportedTune}
                        onLyrics={function(text) { setSongWords(text) }}
                        onChordsMerged={handleChordsMerged}
                        onBackgroundInfo={function(result) { setSongBackgroundInfo(result.text) }}
                      />
                      {resolverChecked && resolverAvailable && features.whisper && (
                        <YouTubeSearchModal
                          tunebook={props.tunebook}
                          onChange={openMediaWizardFromYouTube}
                          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                          triggerElement={<>From Youtube</>}
                          value={songTitle + (songComposer ? ' ' + songComposer : '')}
                        />
                      )}
                    </>
                  )}
                  {stagedTune && <Badge bg="success">Imported (staged)</Badge>}
                </div>
                <Form.Control
                  type="text"
                  size="lg"
                  autoComplete="off"
                  autoFocus
                  placeholder="Enter the tune or song title"
                  value={songTitle}
                  onChange={function(e) { setSongTitle(e.target.value) }}
                />
              </Form.Group>

              <Form.Group className="mb-3" controlId="composer">
                <Form.Label><b>Artist</b></Form.Label>
                <SelectInput
                  onChange={function(val) { setSongComposer(val); setSongComposerId(val) }}
                  value={songComposer ? songComposer : ''}
                  options={artistOptions}
                />
              </Form.Group>
            </div>

            <div className="abc-editor-info-section abc-editor-info-section-primary">
              <Row className="abc-editor-info-primary-row">
                <Col className="abc-editor-info-field-primary" xs={12} md={5}>
                  <Form.Group className="mb-3" controlId="key">
                    <Form.Label>Key</Form.Label>
                    <Form.Control type="text" value={songKey} onChange={function(e) { setSongKey(e.target.value) }} />
                  </Form.Group>
                </Col>
                <Col className="abc-editor-info-field-secondary" xs={4} md={2}>
                  <Form.Group className="mb-3" controlId="tuning">
                    <FormLabelWithHelp label="Tuning" htmlFor="add-tune-tuning" helpBody={EDITOR_INFO_FIELD_HELP.tuning.body} helpTitle={EDITOR_INFO_FIELD_HELP.tuning.title} />
                    <Form.Control id="add-tune-tuning" type="text" value={songTuning} onChange={function(e) { setSongTuning(e.target.value) }} />
                  </Form.Group>
                </Col>
                <Col className="abc-editor-info-field-secondary" xs={4} md={3}>
                  <Form.Group className="mb-3" controlId="transpose">
                    <FormLabelWithHelp label="Transpose" htmlFor="add-tune-transpose" helpBody={EDITOR_INFO_FIELD_HELP.transpose.body} helpTitle={EDITOR_INFO_FIELD_HELP.transpose.title} />
                    <Form.Control id="add-tune-transpose" value={songTranspose} onChange={function(e) { setSongTranspose(e.target.value) }} />
                  </Form.Group>
                </Col>
                <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                  <Form.Group className="mb-3" controlId="capo">
                    <FormLabelWithHelp label="Capo" htmlFor="add-tune-capo" helpBody={EDITOR_INFO_FIELD_HELP.capo.body} helpTitle={EDITOR_INFO_FIELD_HELP.capo.title} />
                    <Form.Control id="add-tune-capo" type="number" min="0" max="12" value={songCapo} onChange={function(e) { setSongCapo(e.target.value) }} />
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
                      value={songMeter ? {value: songMeter, label: songMeter} : {value: '', label: ''}}
                      onChange={function(val) { setSongMeter(val ? val.value : '') }}
                      options={timeSignatureOptions}
                      isClearable={true}
                      blurInputOnSelect={true}
                      createOptionPosition={"first"}
                    />
                  </Form.Group>
                </Col>
                <Col className="abc-editor-info-field-secondary" xs={4} md={3}>
                  <Form.Group className="mb-3" controlId="rhythm">
                    <FormLabelWithHelp label="Rhythm" helpBody={EDITOR_INFO_FIELD_HELP.rhythm.body} helpTitle={EDITOR_INFO_FIELD_HELP.rhythm.title} />
                    <CreatableSelect
                      value={songRhythm ? {value: songRhythm, label: songRhythm} : {value: '', label: ''}}
                      onChange={function(val) {
                        const nextRhythm = val ? val.value : ''
                        setSongRhythm(nextRhythm)
                        const inferredMeter = props.tunebook.abcTools.timeSignatureFromTuneType(nextRhythm)
                        if (inferredMeter) setSongMeter(inferredMeter)
                      }}
                      options={rhythmOptions}
                      isClearable={true}
                      blurInputOnSelect={true}
                      createOptionPosition={"first"}
                    />
                  </Form.Group>
                </Col>
                <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                  <Form.Group className="mb-3" controlId="tempo">
                    <Form.Label>Tempo</Form.Label>
                    <Form.Control type="number" placeholder="eg 100" value={songTempo} onChange={function(e) { setSongTempo(e.target.value) }} />
                  </Form.Group>
                </Col>
                <Col className="abc-editor-info-field-secondary abc-editor-info-field-narrow" xs={4} md={2}>
                  <Form.Group className="mb-3" controlId="repeats">
                    <FormLabelWithHelp label="Repeats" htmlFor="add-tune-repeats" helpBody={EDITOR_INFO_FIELD_HELP.repeats.body} helpTitle={EDITOR_INFO_FIELD_HELP.repeats.title} />
                    <Form.Control id="add-tune-repeats" type="number" placeholder="eg 3" value={songRepeats} onChange={function(e) { setSongRepeats(e.target.value) }} />
                  </Form.Group>
                </Col>
              </Row>
            </div>

            <div className="abc-editor-info-section abc-editor-info-section-details">
              <Row className="abc-editor-info-compact-row g-2 align-items-end">
                <Col xs="auto" className="abc-editor-info-compact-field">
                  <Form.Group className="mb-3" controlId="boost">
                    <FormLabelWithHelp label="Boost" htmlFor="add-tune-boost" helpBody={EDITOR_INFO_FIELD_HELP.boost.body} helpTitle={EDITOR_INFO_FIELD_HELP.boost.title} />
                    <Form.Control id="add-tune-boost" type="number" min="0" max="20" value={songBoost} onChange={function(e) { setSongBoost(e.target.value) }} />
                  </Form.Group>
                </Col>
                <Col xs="auto" className="abc-editor-info-compact-field">
                  <Form.Group className="mb-3" controlId="difficulty">
                    <FormLabelWithHelp label="Difficulty" htmlFor="add-tune-difficulty" helpBody={EDITOR_INFO_FIELD_HELP.difficulty.body} helpTitle={EDITOR_INFO_FIELD_HELP.difficulty.title} />
                    <Form.Control id="add-tune-difficulty" type="number" min="0" max="20" value={songDifficulty} onChange={function(e) { setSongDifficulty(e.target.value) }} />
                  </Form.Group>
                </Col>
                <Col xs="auto" className="abc-editor-info-compact-field">
                  <Form.Group className="mb-3" controlId="noteLength">
                    <FormLabelWithHelp label="ABC Note Length" helpBody={EDITOR_INFO_FIELD_HELP.noteLength.body} helpTitle={EDITOR_INFO_FIELD_HELP.noteLength.title} />
                    <Form.Select value={songNoteLength} onChange={function(e) { setSongNoteLength(e.target.value) }}>
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
                    <Form.Select value={songTablature} onChange={function(e) { setSongTablature(e.target.value) }}>
                      <option value=""></option>
                      <option value="guitar">Guitar</option>
                      <option value="violin">Violin</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={12} md={5} className="abc-editor-info-compact-field-wide">
                  <Form.Group className="mb-3" controlId="fonts">
                    <FormLabelWithHelp label="Sounds Fonts" helpBody={EDITOR_INFO_FIELD_HELP.soundFonts.body} helpTitle={EDITOR_INFO_FIELD_HELP.soundFonts.title} />
                    <Form.Select value={songSoundFonts} onChange={function(e) { setSongSoundFonts(e.target.value) }}>
                      <option value="">Local Sound Fonts Only (piano)</option>
                      <option value="online">Requires Online Sound Fonts</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={12} md className="abc-editor-info-compact-field-grow">
                  <Form.Group className="mb-3" controlId="srcUrl">
                    <FormLabelWithHelp label="Source URL" htmlFor="add-tune-src-url" helpBody={EDITOR_INFO_FIELD_HELP.srcUrl.body} helpTitle={EDITOR_INFO_FIELD_HELP.srcUrl.title} />
                    <Form.Control id="add-tune-src-url" value={songSrcUrl} onChange={function(e) { setSongSrcUrl(e.target.value) }} />
                  </Form.Group>
                </Col>
              </Row>
              <Form.Group className="mb-3 abc-editor-info-background-group" controlId="backgroundInfo">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                  <FormLabelWithHelp
                    label="Background information (Markdown)"
                    helpBody={EDITOR_INFO_FIELD_HELP.backgroundInfo.body}
                    helpTitle={EDITOR_INFO_FIELD_HELP.backgroundInfo.title}
                  />
                  <TuneBackgroundSearchButton
                    title={songTitle}
                    artist={songComposer || ''}
                    lyrics={songWords}
                    token={props.token}
                    tunebook={props.tunebook}
                    existingBackgroundInfo={songBackgroundInfo}
                    disabled={!songTitle.trim()}
                    onBackgroundInfo={function(result) { setSongBackgroundInfo(result.text) }}
                  />
                </div>
                <Form.Control
                  as="textarea"
                  rows={8}
                  placeholder={'Performers, alternative names, first recording date, who popularized the tune, record labels, anecdotes, musical structure, YouTube links... (Markdown supported)'}
                  value={songBackgroundInfo}
                  onChange={function(e) { setSongBackgroundInfo(e.target.value) }}
                />
              </Form.Group>
            </div>

            <Form.Group className="mb-3" controlId="lyrics">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                <Form.Label style={{ marginBottom: 0 }}><b>Lyrics</b></Form.Label>
                <LyricsSearchButton
                  title={songTitle}
                  artist={songComposer || ''}
                  token={props.token}
                  tunebook={props.tunebook}
                  disabled={!songTitle.trim()}
                  extraQuery={songWords ? songWords.slice(0, 50) : ''}
                  onLyrics={function(result) { setSongWords(result.text) }}
                />
              </div>
              <Form.Control
                as="textarea"
                value={songWords}
                onChange={function(e) { setSongWords(e.target.value) }}
                rows={10}
                style={textAreaStyle}
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="notes">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                <FormLabelWithHelp label={<b>ABC Notes</b>} helpBody={ADD_TUNE_FIELD_HELP.abcNotes.body} helpTitle={ADD_TUNE_FIELD_HELP.abcNotes.title} />
                {props.searchIndex && props.loadTuneTexts && (
                  <LocalSearchSelectorModal
                    value={songTitle}
                    currentTune={draftTune}
                    tunebook={props.tunebook}
                    searchIndex={props.searchIndex}
                    loadTuneTexts={props.loadTuneTexts}
                    onStageImport={onStageAbcImport}
                    token={props.token}
                  />
                )}
              </div>
              <Form.Control
                as="textarea"
                value={songNotes}
                onChange={function(e) { setSongNotes(e.target.value) }}
                rows={12}
                style={Object.assign({fontFamily: 'monospace'}, textAreaStyle)}
              />
            </Form.Group>

            {localStorage.getItem('bookstorage_inlineaudio') === "true" &&
              <Form.Group className="mb-3" controlId="image">
                <Form.Label><b>Image</b></Form.Label>
                <Form.Control type="file" onChange={imageSelected} />
                {songImage && <img style={{width: '150px', marginTop: '0.5em'}} src={songImage} alt="" />}
              </Form.Group>}
          </Form>
        </Col>

        <Col md={4}>
          <div style={{position: 'sticky', top: 0}}>
            <h5>Already in your collection</h5>
            {songTitle.trim().length < 2 &&
              <p className="text-muted">Start typing a title to see possible matches you can open instead of adding a new tune.</p>}
            {songTitle.trim().length >= 2 && matchingTunes.length === 0 &&
              <p className="text-muted">No matching tunes found in your collection.</p>}
            {matchingTunes.length > 0 &&
              <ListGroup>
                {matchingTunes.map(function(tune, tk) {
                  return (
                    <ListGroup.Item key={tk} action onClick={function() { openExistingTune(tune) }}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5em'}}>
                        <span>{tune.name}</span>
                        <span>{props.tunebook.icons.externallink}</span>
                      </div>
                      {Array.isArray(tune.books) && tune.books.length > 0 &&
                        <div style={{fontSize: '0.85em', color: '#666'}}>{tune.books.join(', ')}</div>}
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>}
          </div>
        </Col>
      </Row>
    )
  }

  function renderImportTab() {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '1em', maxWidth: '40em'}}>
        <p className="text-muted">Import tunes from a file, YouTube, or one of the curated collections.</p>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.6em'}}>
          <ImportFileModal
            forceRefresh={props.forceRefresh}
            tunebook={props.tunebook}
            currentTuneBook={props.currentTuneBook}
            setCurrentTuneBook={props.setCurrentTuneBook}
            closeParent={handleClose}
            token={props.token}
          />
          <ImportYouTubeModal
            forceRefresh={props.forceRefresh}
            tunebook={props.tunebook}
            currentTuneBook={props.currentTuneBook}
            setCurrentTuneBook={props.setCurrentTuneBook}
            closeParent={handleClose}
          />
        </div>
        <div>
          <ImportCollectionsAccordion tunebook={props.tunebook} setCurrentTuneBook={props.setCurrentTuneBook} />
        </div>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="success"
        size={props.buttonSize}
        className={props.buttonClassName}
        title="Add Tunes"
        onClick={handleShow}
      >
        {props.tunebook.icons.fileadd} Add
      </Button>

      <Modal show={show} onHide={handleClose} fullscreen={true} backdrop="static" keyboard={true}>
        <Modal.Header closeButton>
          <Modal.Title style={{width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1em'}}>
            <span>Add tunes</span>
            {activeTab === 'add' &&
              <Button
                size="lg"
                variant={canAdd ? 'success' : 'secondary'}
                disabled={!canAdd}
                onClick={addTune}
                style={{marginRight: '2em'}}
              >
                {props.tunebook.icons.add} Add
              </Button>}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Tabs activeKey={activeTab} onSelect={function(key) { setActiveTab(key) }} className="mb-3 add-tunes-tabs">
            <Tab eventKey="add" title={<span style={{fontSize: '1.25em', fontWeight: 'bold'}}>Add</span>}>
              {renderAddTab()}
            </Tab>
            <Tab eventKey="import" title={<span style={{fontSize: '1.25em', fontWeight: 'bold'}}>Import</span>}>
              {renderImportTab()}
            </Tab>
          </Tabs>
        </Modal.Body>
      </Modal>

      <MediaImportWizard
        show={showMediaWizard}
        onClose={function() {
          setShowMediaWizard(false)
          setWizardAutoAnalyze(false)
        }}
        onStage={onStageMedia}
        tune={wizardTune}
        tunebook={props.tunebook}
        token={props.token}
        searchIndex={props.searchIndex}
        loadTuneTexts={props.loadTuneTexts}
        forceRefresh={props.forceRefresh}
        autoAnalyze={wizardAutoAnalyze}
      />
    </>
  )
}
export default AddSongModal
