import {useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'
import {ListGroup, Button, Modal, Tabs, Tab, ButtonGroup, Form, Row, Col, Alert, ProgressBar} from 'react-bootstrap'
import { toast } from 'react-toastify'
import { processReviewResult } from '../addSongModalHelper'
import BookSelectorModal from './BookSelectorModal'
import {useNavigate} from 'react-router-dom'
import CreatableSelect from 'react-select/creatable';
import SelectInput from './SelectInput'
import useMusicBrainz from '../useMusicBrainz'
import TagsSelectorModal from './TagsSelectorModal'
import YouTubeSearchModal from './YouTubeSearchModal'
import ImportCollectionsAccordion from './ImportCollectionsAccordion'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'
import useAudioUtils from '../useAudioUtils'
import { FormLabelWithHelp } from './FormFieldHelp'
import { ADD_TUNE_FIELD_HELP, EDITOR_INFO_FIELD_HELP } from '../formFieldHelpText'
import {
  hasActiveImportReviewSession,
  isImportReviewUiVisible,
  requestImportReview,
  showImportReviewUi,
  subscribeImportReviewSession,
  getImportReviewSessionRevision,
} from '../importReviewSessionStore'
import PasteImportModal from './PasteImportModal'
import ImportUrlModal from './ImportUrlModal'
import TuneAliasesField from './TuneAliasesField'
import DriveFilePickerModal from './DriveFilePickerModal'
import SheetImageCameraModal from './SheetImageCameraModal'
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal'
import TuneRecordForm from './TuneRecordForm'
import BulkYouTubePlaylistModal from './BulkYouTubePlaylistModal'
import AudioDriveUploadModal from './AudioDriveUploadModal'
import { findCollectionMatches } from '../tuneCollectionMatch'
import { addFromFileAcceptList, bulkFileAcceptList } from '../importSourceParse'
import { driveListTextToBulkLines, normalizeBulkTextLocally } from '../bulkListFormat'
import { formatBulkImportLinesViaResolver } from '../bulkListFormatClient'
import { readAudioFileMetadata } from '../audioFileMetadata'
import { createAttachedAudioLink } from '../linkRecording'
import { getPlainLyricLines } from '../wLinesUtils'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import { PRACTICE_INSTRUMENTS, normalizeSuitableInstruments } from '../practiceSessionSettings'
import { getMusicGenreSelectOptions, genreSelectValue } from '../musicGenreOptions'
import {
  applyEmptyMetaFromSheetDraft,
  lyricsFromImportedTune,
  notationFromImportedTune,
} from '../addSongSheetDraft'
import {
  applyImportSuggestion,
  applyInlineImportToForm,
  buildReviewFormState,
  formValuesToTune,
  tuneToFormValues,
} from '../importReviewFieldUtils'

const DEFAULT_BOOK = 'songs'
const BULK_TEXT_STORAGE_KEY = 'addSongModal_bulkText'

function recordingBlobToFile(blob) {
  const extension = blob && blob.type === 'audio/webm' ? 'webm' : 'wav'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return new File([blob], 'recording-' + timestamp + '.' + extension, {
    type: (blob && blob.type) || 'audio/webm',
  })
}

function AddSongModal(props) {
  const navigate = useNavigate()
  const musicBrainz = useMusicBrainz()
  const abcjsParser = useAbcjsParser()
  const { available: resolverAvailable, checked: resolverChecked, features } = useMediaResolverHealth()
  const driveApi = useGoogleDocument(props.token, props.login || function() {}, props.forceRefresh)
  const audioUtils = useAudioUtils()
  const recordingStartedAtRef = useRef(0)
  const recordingIntervalRef = useRef(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [show, setShow] = useState(!!props.routeMode)
  const [activeTab, setActiveTab] = useState(props.defaultTab || 'add')
  const [bulkText, setBulkText] = useState(function() {
    try { return sessionStorage.getItem(BULK_TEXT_STORAGE_KEY) || '' } catch (e) { return '' }
  })
  const [bulkBusy, setBulkBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const importReviewRevision = useSyncExternalStore(
    subscribeImportReviewSession,
    getImportReviewSessionRevision,
    function() { return '' }
  )
  const importReviewActive = useMemo(function() {
    return hasActiveImportReviewSession() && isImportReviewUiVisible()
  }, [importReviewRevision])
  const addFileInputRef = useRef(null)
  const bulkFileInputRef = useRef(null)

  const [songTitle, setSongTitle] = useState('')
  const [selectedBook, setSelectedBook] = useState(props.currentTuneBook || DEFAULT_BOOK)
  const [songTags, setSongTags] = useState(Array.isArray(props.tagFilter) ? props.tagFilter : [])
  const [songMeter, setSongMeter] = useState('')
  const [songRhythm, setSongRhythm] = useState('')
  const [songWords, setSongWords] = useState('')
  const [songComposer, setSongComposer] = useState('')
  const [songAliases, setSongAliases] = useState([])
  const [songGenre, setSongGenre] = useState('')
  const [songSuitableForPractice, setSongSuitableForPractice] = useState(false)
  const [songSuitableFor, setSongSuitableFor] = useState([])
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
  const [mergeTargetTuneId, setMergeTargetTuneId] = useState(null)

  // Staged tune data from import sources, held until explicit add/queue handoff.
  const [stagedTune, setStagedTune] = useState(null)
  const [pendingAudioFile, setPendingAudioFile] = useState(null)
  const [pendingBulkAudioFiles, setPendingBulkAudioFiles] = useState([])
  const [showAudioDriveUploadModal, setShowAudioDriveUploadModal] = useState(false)
  const [audioImportBusy, setAudioImportBusy] = useState(false)
  const [showSheetCamera, setShowSheetCamera] = useState(false)
  const [showSheetGooglePhotos, setShowSheetGooglePhotos] = useState(false)
  const [pendingSheetDraft, setPendingSheetDraft] = useState(null)
  const [addFormSuggestions, setAddFormSuggestions] = useState({})
  const [pendingLookupSources, setPendingLookupSources] = useState({
    lyrics: null,
    notation: null,
    chordText: null,
  })

  const importSourceDisabled = audioImportBusy || audioUtils.isRecording

  const importContext = useMemo(function() {
    return buildImportContext({
      resolverAvailable: resolverAvailable,
      token: props.token,
      driveApi: driveApi,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      book: selectedBook.trim().toLowerCase() || props.currentTuneBook,
      stayOnForm: activeTab === 'add',
    })
  }, [
    resolverAvailable,
    props.token,
    driveApi,
    props.tunebook,
    abcjsParser,
    selectedBook,
    props.currentTuneBook,
    activeTab,
  ])
  function clearRecordingInterval() {
    try {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    } catch (e) {}
  }

  function startAddTuneRecording() {
    if (audioUtils.isRecording) return
    recordingStartedAtRef.current = Date.now()
    setRecordingDuration(0)
    recordingIntervalRef.current = setInterval(function() {
      setRecordingDuration(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000))
    }, 1000)
    audioUtils.startRecording().then(function(blob) {
      clearRecordingInterval()
      setRecordingDuration(0)
      if (!blob || !blob.size) {
        setImportError('Recording failed or was empty.')
        return
      }
      setAudioImportBusy(true)
      setPendingBulkAudioFiles([])
      setPendingAudioFile(recordingBlobToFile(blob))
      setShowAudioDriveUploadModal(true)
    })
  }

  function stopAddTuneRecording() {
    audioUtils.stopRecording()
  }

  useEffect(function() {
    return function() {
      clearRecordingInterval()
    }
  }, [])

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
    if (!mergeTargetTuneId || !props.tunes || !props.tunes[mergeTargetTuneId]) {
      if (!mergeTargetTuneId) setAddFormSuggestions({})
      return
    }
    const imported = stagedTune || formValuesToTune(buildAddFormValues(), draftTune)
    const result = buildReviewFormState(props.tunes[mergeTargetTuneId], imported, 'merge')
    applyAddFormValues(result.formValues)
    setAddFormSuggestions(result.suggestions)
  }, [mergeTargetTuneId])

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

  const panelOpen = props.routeMode || show
  const setBlockKeyboardShortcuts = props.setBlockKeyboardShortcuts
  useEffect(function() {
    if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(panelOpen)
    return function() {
      if (setBlockKeyboardShortcuts) setBlockKeyboardShortcuts(false)
    }
  }, [panelOpen, setBlockKeyboardShortcuts])

  const cleanNoteLines = useCallback(function(text) {
    return String(text || '').split("\n").filter(function(line) {
      return props.tunebook.abcTools.isNoteLine(line)
    })
  }, [props.tunebook.abcTools])

  useEffect(function() {
    if (props.routeMode) setShow(true)
  }, [props.routeMode])

  useEffect(function() {
    if (props.defaultTab) setActiveTab(props.defaultTab)
  }, [props.defaultTab])

  useEffect(function() {
    try {
      if (bulkText) sessionStorage.setItem(BULK_TEXT_STORAGE_KEY, bulkText)
      else sessionStorage.removeItem(BULK_TEXT_STORAGE_KEY)
    } catch (e) {}
  }, [bulkText])

  useEffect(function() {
    if (songTitle.trim().length > 1 && props.tunes) {
      const matching = findCollectionMatches({
        title: songTitle,
        artist: songComposer,
        tunes: props.tunes,
        limit: 10,
      }).map(function(entry) { return entry.tune })
      setMatchingTunes(matching)
    } else {
      setMatchingTunes([])
    }
  }, [songTitle, songComposer, props.tunes])

  const draftTune = useMemo(function() {
    return {
      id: draftIdRef.current,
      name: songTitle,
      composer: songComposer,
      aliases: songAliases.slice(),
      genre: songGenre,
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
      suitableForPractice: songSuitableForPractice,
      suitableFor: songSuitableFor.slice(),
      links: [],
      voices: {'1': {meta: '', notes: cleanNoteLines(songNotes)}},
      words: songWords.trim() ? songWords.split("\n") : [],
    }
  }, [
    songTitle, songComposer, songAliases, songGenre, songKey, songTuning, songTranspose, songCapo,
    songMeter, songRhythm, songTempo, songRepeats, songBoost, songDifficulty,
    songNoteLength, songTablature, songSoundFonts, songSrcUrl, songBackgroundInfo,
    songSuitableForPractice, songSuitableFor,
    songNotes, songWords, cleanNoteLines,
  ])

  const canAdd = songTitle.trim().length > 0 && selectedBook.trim().length > 0

  function buildAddFormValues() {
    return {
      title: songTitle,
      artist: songComposer,
      aliases: songAliases.slice(),
      genre: songGenre,
      rhythm: songRhythm,
      meter: songMeter,
      keyName: songKey,
      tempo: songTempo,
      noteLength: songNoteLength,
      bookList: selectedBook,
      tagList: Array.isArray(songTags) ? songTags.join(', ') : '',
      links: stagedTune && Array.isArray(stagedTune.links) ? stagedTune.links.slice() : [],
      srcUrl: songSrcUrl,
      backgroundInfo: songBackgroundInfo,
      lyrics: songWords,
      notes: songNotes,
      boost: songBoost,
      difficulty: songDifficulty,
      tablature: songTablature,
      capo: songCapo,
      playbackTempo: '',
      playbackPitch: '',
      playbackFineTune: '',
      transpose: songTranspose,
      tuning: songTuning,
      repeats: songRepeats,
      composerId: '',
      abccomments: '',
      timedChords: null,
      timedLyrics: null,
      playbackAudioFilters: null,
      soundFonts: songSoundFonts,
      timingScaffold: '',
      meta: null,
    }
  }

  function applyAddFormValues(values) {
    if (!values) return
    setSongTitle(values.title || '')
    setSongComposer(values.artist || '')
    setSongAliases(Array.isArray(values.aliases) ? values.aliases.slice() : [])
    setSongGenre(values.genre || '')
    setSongRhythm(values.rhythm || '')
    setSongMeter(values.meter || '')
    setSongKey(values.keyName || '')
    setSongTempo(values.tempo || '')
    setSongNoteLength(values.noteLength || '')
    setSongSrcUrl(values.srcUrl || '')
    setSongBackgroundInfo(values.backgroundInfo || '')
    setSongWords(values.lyrics || '')
    setSongNotes(values.notes || '')
    setSongBoost(values.boost || '')
    setSongDifficulty(values.difficulty || '')
    setSongTablature(values.tablature || '')
    setSongCapo(values.capo || '')
    setSongTranspose(values.transpose || '')
    setSongTuning(values.tuning || '')
    setSongRepeats(values.repeats || '')
    setSongSoundFonts(values.soundFonts || '')
    if (values.bookList) setSelectedBook(values.bookList)
    if (values.tagList) {
      setSongTags(parseListField(values.tagList))
    }
    if (Array.isArray(values.links) && values.links.length) {
      setStagedTune(function(current) {
        return Object.assign({}, current || {}, { links: values.links.slice() })
      })
    }
  }

  function parseListField(value) {
    return String(value || '')
      .split(',')
      .map(function(item) { return item.trim() })
      .filter(Boolean)
  }

  function applyImportedTuneToAddForm(importedTune) {
    if (!importedTune) return
    const currentValues = buildAddFormValues()
    const baseTune = mergeTargetTuneId && props.tunes && props.tunes[mergeTargetTuneId]
      ? props.tunes[mergeTargetTuneId]
      : formValuesToTune(currentValues, draftTune)
    const mode = mergeTargetTuneId && props.tunes && props.tunes[mergeTargetTuneId] ? 'merge' : 'import'
    const result = mode === 'merge'
      ? buildReviewFormState(baseTune, importedTune, 'merge')
      : applyInlineImportToForm(currentValues, importedTune)
    applyAddFormValues(result.formValues)
    setAddFormSuggestions(result.suggestions)
    setStagedTune(importedTune)
  }

  function applySheetDraftInline(draft) {
    if (!draft) return
    const importedTune = {
      name: draft.title || (draft.meta && draft.meta.title) || '',
      composer: draft.artist || (draft.meta && draft.meta.artist) || '',
      key: draft.key || (draft.meta && draft.meta.key) || '',
      meter: draft.meter || (draft.meta && draft.meta.meter) || '',
      aliases: (draft.meta && draft.meta.aliases) || [],
    }
    if (draft.chordText && draft.chordText.trim()) {
      importedTune.wLines = draft.chordText.split('\n')
    }
    if (draft.melodyAbc && draft.melodyAbc.trim()) {
      importedTune.voices = { '1': { meta: '', notes: draft.melodyAbc.split('\n') } }
    }
    applyImportedTuneToAddForm(importedTune)
  }

  function buildTunePayloadFromForm() {
    const book = selectedBook.trim().toLowerCase()
    const cleanNotes = cleanNoteLines(songNotes)
    let tune
    if (stagedTune) {
      tune = JSON.parse(JSON.stringify(stagedTune))
      tune.id = draftIdRef.current
      var voiceKey = (tune.voices && Object.keys(tune.voices)[0]) || '1'
      if (!tune.voices) tune.voices = {}
      tune.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey] || {meta: '', notes: []}, {notes: cleanNotes})
      if (songWords.trim()) {
        tune.wLines = songWords.split("\n")
        delete tune.words
      }
      if (songMeter) tune.meter = songMeter
    } else {
      tune = {
        id: draftIdRef.current,
        voices: {'1': {meta: '', notes: cleanNotes}},
        words: songWords.trim() ? songWords.split("\n") : [],
        meter: songMeter,
      }
    }
    tune.name = songTitle
    tune.tags = songTags
    tune.books = [book]
    tune.composer = songComposer || tune.composer || ''
    if (songAliases.length > 0) {
      tune.aliases = songAliases.slice()
    } else {
      delete tune.aliases
    }
    tune.rhythm = songRhythm || tune.rhythm || ''
    if (songGenre) tune.genre = songGenre
    if (songKey) tune.key = songKey
    if (songTuning) tune.tuning = songTuning
    if (songTranspose) tune.transpose = songTranspose
    if (songCapo !== '') tune.capo = parseInt(songCapo, 10) || 0
    if (songTempo) tune.tempo = songTempo
    if (songRepeats) tune.repeats = songRepeats
    if (songBoost) tune.boost = songBoost
    if (songDifficulty) tune.difficulty = songDifficulty
    if (songNoteLength) tune.noteLength = songNoteLength
    if (songTablature) tune.tablature = songTablature
    if (songSoundFonts) tune.soundFonts = songSoundFonts
    if (songSrcUrl) tune.srcUrl = songSrcUrl
    if (songBackgroundInfo) tune.backgroundInfo = songBackgroundInfo
    tune.suitableForPractice = songSuitableForPractice
    if (songSuitableFor.length > 0) {
      tune.suitableFor = songSuitableFor.slice()
    } else {
      delete tune.suitableFor
    }
    if (Array.isArray(stagedTune && stagedTune.links) && stagedTune.links.length > 0) {
      tune.links = stagedTune.links
    }
    if (stagedTune && stagedTune.mediaCacheLocked) {
      tune.mediaCacheLocked = true
    }
    if (songImage) tune.files = [{data: songImage, type: 'image'}]
    return tune
  }

  function applyImportedTune(merged) {
    applyImportedTuneToAddForm(merged)
  }

  const dismissModal = useCallback(function(options) {
    setShow(false)
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    if (props.routeMode && props.onRouteClose && !(options && options.skipRouteNav)) {
      props.onRouteClose()
    }
  }, [props.routeMode, props.onRouteClose, props.setBlockKeyboardShortcuts])

  const startImportReview = useCallback(function(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return
    setImportError('')
    requestImportReview(candidates)
    showImportReviewUi()
    dismissModal()
  }, [dismissModal])

  async function applyImportDispatchResult(result) {
    if (!result || result.action === 'error') {
      setImportError(result && result.message ? result.message : 'Import failed.')
      return true
    }
    if (result.action === 'sheetDraft') {
      const draft = result.draft || {}
      const meta = applyEmptyMetaFromSheetDraft(draft, {
        title: songTitle,
        artist: songComposer,
        key: songKey,
        meter: songMeter,
      })
      if (meta.title && !songTitle.trim()) setSongTitle(meta.title)
      if (meta.artist && !songComposer.trim()) setSongComposer(meta.artist)
      if (meta.key && !songKey.trim()) setSongKey(meta.key)
      if (meta.meter && !songMeter.trim()) setSongMeter(meta.meter)
      setPendingSheetDraft(Object.assign({}, draft, {
        meta: {
          title: draft.title || '',
          artist: draft.artist || '',
          key: draft.key || '',
          meter: draft.meter || '',
          aliases: [],
        },
        activeTab: draft.chordText ? 'chords' : 'melody',
      }))
      applySheetDraftInline(Object.assign({}, draft, {
        chordText: draft.chordText || draft.body && draft.body.chordText,
        melodyAbc: draft.melodyAbc || draft.body && draft.body.melodyAbc,
      }))
      return false
    }
    if (result.action === 'review') {
      const outcome = processReviewResult(result, importContext, applyImportedTune, startImportReview, toast)
      if (outcome.handled) {
        if (outcome.closeModal) {
          showImportReviewUi()
          dismissModal()
        }
        return !outcome.closeModal
      }
    }
    if (result.action === 'audio') {
      const files = result.files || []
      if (files.length === 0) return true
      if (files.length === 1) {
        const metadata = await readAudioFileMetadata(files[0])
        if (metadata.title) setSongTitle(metadata.title)
        if (metadata.artist) setSongComposer(metadata.artist)
        setPendingBulkAudioFiles([])
        setPendingAudioFile(files[0])
      } else {
        setPendingAudioFile(null)
        setPendingBulkAudioFiles(files)
      }
      setShowAudioDriveUploadModal(true)
      return false
    }
    if (result.action === 'bulkAppend') {
      appendBulkLines(result.text)
      return true
    }
    return true
  }

  async function runAddImport(input, options) {
    setImportError('')
    const ctx = buildImportContext(Object.assign({}, importContext, options || {}))
    let releaseBusy = true
    setAudioImportBusy(true)
    try {
      const result = await dispatchAddImport(input, ctx)
      releaseBusy = await applyImportDispatchResult(result)
    } catch (e) {
      setImportError(e.message || 'Import failed.')
    } finally {
      if (releaseBusy) setAudioImportBusy(false)
    }
  }

  async function handleAddFileSelected(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    await runAddImport(file)
  }

  async function continueAudioImport(file, uploadToDrive) {
    if (!file) return
    setAudioImportBusy(true)
    setImportError('')
    setShowAudioDriveUploadModal(false)
    try {
      const metadata = await readAudioFileMetadata(file)
      const title = metadata.title || file.name
      const artist = metadata.artist || ''
      if (title) setSongTitle(title)
      if (artist) setSongComposer(artist)

      const tuneBase = {
        id: draftIdRef.current,
        name: title,
        composer: artist,
        links: [],
      }
      const result = await createAttachedAudioLink({
        tune: tuneBase,
        file: file,
        title: title,
        uploadToDrive: uploadToDrive,
        token: props.token,
        driveApi: driveApi,
      })

      const tuneWithLink = Object.assign({}, draftTune, tuneBase, {
        links: [result.link],
        mediaCacheLocked: true,
      })
      const candidate = {
        tune: tuneWithLink,
        sourceKind: 'audio',
        mergeTargetId: mergeTargetTuneId || null,
      }
      startImportReview([candidate])
      clearForm()
      dismissModal()
    } catch (e) {
      setImportError(e.message || 'Could not import audio file.')
    } finally {
      setAudioImportBusy(false)
      setPendingAudioFile(null)
    }
  }

  function cancelAudioDriveUpload() {
    setPendingAudioFile(null)
    setPendingBulkAudioFiles([])
    setShowAudioDriveUploadModal(false)
    setAudioImportBusy(false)
  }

  async function continueBulkAudioImport(files, uploadToDriveFlags) {
    if (!Array.isArray(files) || files.length === 0) return
    setAudioImportBusy(true)
    setImportError('')
    setShowAudioDriveUploadModal(false)
    const book = selectedBook.trim().toLowerCase() || props.currentTuneBook
    const generateId = props.tunebook.utils && props.tunebook.utils.generateObjectId
      ? props.tunebook.utils.generateObjectId.bind(props.tunebook.utils)
      : function() { return 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) }
    try {
      const candidates = []
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        const uploadToDrive = Array.isArray(uploadToDriveFlags) ? !!uploadToDriveFlags[i] : false
        const metadata = await readAudioFileMetadata(file)
        const title = metadata.title || file.name
        const artist = metadata.artist || ''
        const tuneId = generateId()
        const result = await createAttachedAudioLink({
          tune: { id: tuneId, name: title, composer: artist, links: [] },
          file: file,
          title: title,
          uploadToDrive: uploadToDrive,
          token: props.token,
          driveApi: driveApi,
        })
        candidates.push({
          tune: {
            id: tuneId,
            name: title,
            composer: artist,
            links: [result.link],
            mediaCacheLocked: true,
            voices: { '1': { meta: '', notes: [] } },
            books: book ? [book] : [],
          },
          sourceKind: 'bulk-audio',
        })
      }
      if (candidates.length === 0) {
        setImportError('No audio files to import.')
        return
      }
      startImportReview(candidates)
    } catch (e) {
      setImportError(e.message || 'Could not import audio files.')
    } finally {
      setAudioImportBusy(false)
      setPendingBulkAudioFiles([])
    }
  }

  async function handleBulkFileSelected(event) {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length === 0) return
    setImportError('')
    setAudioImportBusy(true)

    const audioFiles = []
    const reviewCandidates = []
    let appendText = ''
    let releaseBusy = true

    try {
      for (let i = 0; i < files.length; i += 1) {
        const result = await dispatchAddImport(files[i], buildImportContext(Object.assign({}, importContext, {
          bulkTextAppendOnly: true,
        })))
        if (result.action === 'audio') {
          audioFiles.push.apply(audioFiles, result.files || [])
        } else if (result.action === 'bulkAppend') {
          appendText = appendText
            ? appendText + '\n' + result.text
            : result.text
        } else if (result.action === 'review') {
          reviewCandidates.push.apply(reviewCandidates, result.candidates || [])
        } else if (result.action === 'error') {
          throw new Error(result.message || 'Import failed.')
        }
      }
      if (appendText) appendBulkLines(appendText)
      if (reviewCandidates.length > 0) startImportReview(reviewCandidates)
      if (audioFiles.length > 0) {
        setPendingAudioFile(null)
        setPendingBulkAudioFiles(audioFiles)
        setShowAudioDriveUploadModal(true)
        releaseBusy = false
      }
    } catch (e) {
      setImportError(e.message || 'Could not import those files.')
    } finally {
      if (releaseBusy) setAudioImportBusy(false)
    }
  }

  function handlePasteImportText(text) {
    runAddImport(text)
  }

  async function handlePasteImportFiles(pastedFiles) {
    const list = Array.isArray(pastedFiles) ? pastedFiles : []
    for (let i = 0; i < list.length; i += 1) {
      await runAddImport(list[i])
    }
  }

  async function handleUrlImportSource(source) {
    setImportError('')
    let releaseBusy = true
    setAudioImportBusy(true)
    try {
      const result = await dispatchAddImport(source, importContext)
      releaseBusy = await applyImportDispatchResult(result)
    } catch (e) {
      setImportError(e.message || 'Import failed.')
    } finally {
      if (releaseBusy) setAudioImportBusy(false)
    }
  }

  function handleDriveImportSource(source) {
    runAddImport(source)
  }

  function appendBulkLines(lines) {
    setBulkText(function(prev) {
      const next = String(lines || '').trim()
      if (!next) return prev
      if (!prev.trim()) return next
      return prev.replace(/\s+$/, '') + '\n' + next
    })
  }

  async function handleBulkSearch() {
    if (!bulkText.trim()) return
    setBulkBusy(true)
    setImportError('')
    try {
      if (resolverAvailable && props.token && props.token.access_token) {
        try {
          const formatted = await formatBulkImportLinesViaResolver(bulkText, props.token.access_token)
          setBulkText(formatted)
          return
        } catch (e) {
          // fall through to local normalize
        }
      }
      setBulkText(normalizeBulkTextLocally(bulkText))
    } finally {
      setBulkBusy(false)
    }
  }

  function handleBulkImport() {
    runAddImport(bulkText, { bulkMode: true })
  }

  function startMergeIntoExisting(tune) {
    if (!tune || !tune.id) return
    setMergeTargetTuneId(function(current) {
      return current === tune.id ? null : tune.id
    })
  }

  function clearPendingSheetDraft() {
    setPendingSheetDraft(null)
  }

  function updatePendingSheetDraftMeta(meta) {
    setPendingSheetDraft(function(current) {
      if (!current) return current
      return Object.assign({}, current, {
        meta: Object.assign({}, current.meta || {}, meta),
        title: meta.title != null ? meta.title : current.title,
        artist: meta.artist != null ? meta.artist : current.artist,
        key: meta.key != null ? meta.key : current.key,
        meter: meta.meter != null ? meta.meter : current.meter,
      })
    })
  }

  function stageLookupFromWebSearch(merged) {
    if (!merged) return
    applyImportedTuneToAddForm(merged)
  }

  function stageLookupLyrics(text, label) {
    if (!text || !String(text).trim()) return
    setPendingLookupSources(function(prev) {
      return Object.assign({}, prev, {
        lyrics: { id: 'lookup-lyrics', label: label || 'Lookup', text: String(text).trim() },
      })
    })
  }

  function stageLookupNotation(tune, label) {
    const text = notationFromImportedTune(tune, props.tunebook)
    if (!text.trim()) return
    setPendingLookupSources(function(prev) {
      return Object.assign({}, prev, {
        notation: { id: 'lookup-notation', label: label || 'Lookup', text: text },
      })
    })
  }

  function stageLookupChords(chordText) {
    if (!chordText || !String(chordText).trim()) return
    setPendingLookupSources(function(prev) {
      return Object.assign({}, prev, {
        chordText: { id: 'lookup-chords', label: 'Lookup chords', text: String(chordText).trim() },
      })
    })
    applyImportedTuneToAddForm({ wLines: String(chordText).trim().split('\n') })
  }

  const addImportedNotation = useMemo(function() {
    if (pendingSheetDraft && pendingSheetDraft.melodyAbc && pendingSheetDraft.melodyAbc.trim()) {
      return pendingSheetDraft.melodyAbc
    }
    if (pendingLookupSources.notation && pendingLookupSources.notation.text) {
      return pendingLookupSources.notation.text
    }
    return ''
  }, [pendingSheetDraft, pendingLookupSources])

  const addFormValues = useMemo(function() {
    return buildAddFormValues()
  }, [
    songTitle, songComposer, songAliases, songGenre, songRhythm, songMeter, songKey,
    songTempo, songNoteLength, selectedBook, songTags, stagedTune, songSrcUrl,
    songBackgroundInfo, songWords, songNotes, songBoost, songDifficulty, songTablature,
    songCapo, songTranspose, songTuning, songRepeats, songSoundFonts,
  ])

  function clearForm() {
    setSongTitle('')
    setSelectedBook(props.currentTuneBook || DEFAULT_BOOK)
    setSongTags(Array.isArray(props.tagFilter) ? props.tagFilter : [])
    setSongRhythm('')
    setSongMeter('')
    setSongWords('')
    setSongComposer('')
    setSongAliases([])
    setSongGenre('')
    setSongSuitableForPractice(false)
    setSongSuitableFor([])
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
    setPendingAudioFile(null)
    setShowAudioDriveUploadModal(false)
    clearRecordingInterval()
    setRecordingDuration(0)
    if (audioUtils.isRecording) {
      audioUtils.stopRecording()
    }
    setAudioImportBusy(false)
    setMatchingTunes([])
    setMergeTargetTuneId(null)
    clearPendingSheetDraft()
    setPendingLookupSources({ lyrics: null, notation: null, chordText: null })
  }

  const handleClose = () => {
    dismissModal()
  }

  function handleCancelAdd() {
    clearForm()
    dismissModal()
  }
  const handleShow = () => {
    setActiveTab('add')
    navigate('/add')
  }

  function onStageAbcImport(merged) {
    stageLookupNotation(merged, 'Collection lookup')
  }

  function handleYouTubeSourceSelected(link) {
    if (!link || !link.link) return
    const tuneWithLink = Object.assign({}, buildTunePayloadFromForm(), {
      links: [{ title: link.title || '', link: link.link, startAt: '', endAt: '' }],
    })
    const candidate = {
      tune: tuneWithLink,
      sourceKind: 'youtube',
      mergeTargetId: mergeTargetTuneId || null,
    }
    startImportReview([candidate])
    clearForm()
  }

  function startEnhancementFromAddForm() {
    if (!canAdd) return
    const candidate = {
      tune: buildTunePayloadFromForm(),
      sourceKind: 'manual',
      mergeTargetId: mergeTargetTuneId || null,
    }
    startImportReview([candidate])
    clearForm()
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
    const t = buildTunePayloadFromForm()

    const candidate = {
      tune: t,
      sourceKind: 'manual',
      mergeTargetId: mergeTargetTuneId || null,
    }
    startImportReview([candidate])
    clearForm()
  }

  function openExistingTune(tune) {
    if (tune && tune.id) {
      navigate("/tunes/" + tune.id)
      dismissModal({ skipRouteNav: true })
    }
  }

  function renderAddFromStrip(options) {
    const opts = options || {}
    return (
      <div style={opts.containerStyle || { position: 'sticky', top: 0, zIndex: 3, background: '#fff', borderBottom: '1px solid #e5e7eb', marginBottom: '0.8em', paddingBottom: '0.6em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', minWidth: 0 }}>
            <Button variant="outline-secondary" disabled tabIndex={-1} size="sm" style={{ opacity: 1, color: 'inherit' }}>
              Add From
            </Button>
            <ButtonGroup size="sm">
            <Button
              variant="outline-primary"
              disabled={importSourceDisabled}
              onClick={function() { addFileInputRef.current && addFileInputRef.current.click() }}
              title={"Auto: ABC/chordsheet/bulk-text will merge inline; audio/other files route to review queue."}
            >
              {audioImportBusy ? 'Processing file...' : 'File'}
            </Button>
            <PasteImportModal
              disabled={importSourceDisabled}
              onImportText={handlePasteImportText}
              onImportFiles={handlePasteImportFiles}
              title={"Paste ABC/notation/text. Single ABC/chordsheet/bulk-text will merge inline; others open review."}
            />
            <ImportUrlModal
              label="URL"
              disabled={importSourceDisabled}
              tunebook={props.tunebook}
              abcjsParser={abcjsParser}
              driveApi={driveApi}
              book={selectedBook.trim().toLowerCase() || props.currentTuneBook}
              accessToken={props.token && props.token.access_token}
              resolverAvailable={resolverAvailable}
              onImportSource={handleUrlImportSource}
            />
            </ButtonGroup>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', minWidth: 0 }}>
          <ButtonGroup size="sm">
            {audioUtils.isRecording ? (
              <>
                <Button variant="danger" onClick={stopAddTuneRecording}>
                  Stop
                </Button>
                <Button variant="outline-danger" disabled aria-label="Recording duration">
                  {recordingDuration + 1}s
                </Button>
              </>
            ) : (
              <Button variant="outline-primary" disabled={importSourceDisabled} onClick={startAddTuneRecording}>
                Record
              </Button>
            )}
            {resolverChecked && resolverAvailable && (
              <Button variant="outline-primary" disabled={importSourceDisabled} onClick={function() { setShowSheetCamera(true); }}>
                Camera
              </Button>
            )}
          </ButtonGroup>
          {props.token && (
            <ButtonGroup size="sm">
              {resolverChecked && resolverAvailable && (
                <Button variant="outline-primary" disabled={importSourceDisabled} onClick={function() { setShowSheetGooglePhotos(true); }}>
                  Google Photos
                </Button>
              )}
              <DriveFilePickerModal
                label="Drive"
                title="Import from Google Drive"
                token={props.token}
                driveApi={driveApi}
                disabled={importSourceDisabled}
                requestGoogleScopes={props.requestGoogleScopes}
                onImportSource={handleDriveImportSource}
              />
              <YouTubeSearchModal
                tunebook={props.tunebook}
                onChange={handleYouTubeSourceSelected}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                triggerElement={<>YouTube</>}
                value={songTitle + (songComposer ? ' ' + songComposer : '')}
                disabled={importSourceDisabled}
                title={"YouTube sources go to review/enhancement queue."}
              />
            </ButtonGroup>
          )}
          </div>
        </div>
        {opts.showRoutingNote !== false && (
          <div style={{ fontSize: '0.85em', color: '#666', marginTop: '0.45em' }}>
            <strong>Routing:</strong> Inline merge: ABC / chordsheet / bulk-text when pasted/loaded as a single candidate. Queue handoff: audio, YouTube, sheet images, musicxml/midi and other long-running sources.
          </div>
        )}
        {audioImportBusy && opts.showProgress !== false && (
          <ProgressBar
            animated
            striped
            now={100}
            style={{ marginTop: '0.35em', height: '0.45em', width: '100%' }}
          />
        )}
      </div>
    )
  }

  const textAreaStyle = {width: '100%', fontSize: '1.05em'}

  function renderAddTab() {
    return (
      <Row style={{ flexWrap: 'nowrap' }}>
        <Col style={{ flex: '1 1 auto', minWidth: 0 }}>
          <Form className="abc-editor-info-form" onSubmit={function(e) { e.preventDefault() }}>
            <input
              ref={addFileInputRef}
              type="file"
              accept={addFromFileAcceptList(resolverAvailable)}
              style={{ display: 'none' }}
              onChange={handleAddFileSelected}
            />
            {pendingSheetDraft && pendingSheetDraft.fileName ? (
              <Alert variant="info" className="mb-2">
                Sheet transcription from {pendingSheetDraft.fileName} applied to the form.
                <Button size="sm" variant="link" onClick={clearPendingSheetDraft}>Dismiss</Button>
              </Alert>
            ) : null}
            <TuneRecordForm
              values={addFormValues}
              onChange={function(patch) {
                applyAddFormValues(Object.assign({}, addFormValues, patch))
              }}
              suggestions={addFormSuggestions}
              onApplySuggestion={function(formKey, suggestion) {
                setAddFormSuggestions(function(current) {
                  const next = Object.assign({}, current)
                  delete next[formKey]
                  return next
                })
                applyAddFormValues(applyImportSuggestion(addFormValues, formKey, suggestion))
              }}
              mergeMode={Object.keys(addFormSuggestions).length || addImportedNotation.trim() ? 'import' : 'create'}
              importedNotationText={addImportedNotation}
              previewTune={draftTune}
              tunebook={props.tunebook}
              token={props.token}
              forceRefresh={props.forceRefresh}
              resolverAvailable={resolverAvailable}
              bookTagsSlot={(
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
              )}
              extraSections={(
                <div className="abc-editor-info-section abc-editor-info-section-practice">
                  <div className="abc-editor-info-section-heading">Practice</div>
                  <Row className="g-2 align-items-end">
                    <Col xs={12} lg={4}>
                      <Form.Group className="mb-3" controlId="suitableForPractice">
                        <FormLabelWithHelp label="Suitable for practice" helpBody={EDITOR_INFO_FIELD_HELP.suitableForPractice.body} helpTitle={EDITOR_INFO_FIELD_HELP.suitableForPractice.title} />
                        <Form.Check
                          type="checkbox"
                          id="add-tune-suitable-for-practice"
                          label="Include in practice sessions"
                          checked={songSuitableForPractice}
                          onChange={function(e) { setSongSuitableForPractice(!!e.target.checked) }}
                        />
                      </Form.Group>
                    </Col>
                    <Col xs={12} lg={8}>
                      <Form.Group className="mb-3" controlId="suitableFor">
                        <FormLabelWithHelp label="Suitable for" helpBody={EDITOR_INFO_FIELD_HELP.suitableFor.body} helpTitle={EDITOR_INFO_FIELD_HELP.suitableFor.title} />
                        <div className="abc-editor-suitable-for">
                          {PRACTICE_INSTRUMENTS.map(function(item) {
                            const selected = normalizeSuitableInstruments(songSuitableFor)
                            const checked = selected.indexOf(item.id) !== -1
                            return (
                              <Form.Check
                                inline
                                key={item.id}
                                type="checkbox"
                                id={'add-tune-suitable-for-' + item.id}
                                label={item.label}
                                checked={checked}
                                onChange={function(e) {
                                  setSongSuitableFor(function(prev) {
                                    const next = normalizeSuitableInstruments(prev).slice()
                                    if (e.target.checked) {
                                      if (next.indexOf(item.id) === -1) next.push(item.id)
                                    } else {
                                      const idx = next.indexOf(item.id)
                                      if (idx !== -1) next.splice(idx, 1)
                                    }
                                    return next
                                  })
                                }}
                              />
                            )
                          })}
                        </div>
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              )}
            />

            {localStorage.getItem('bookstorage_inlineaudio') === "true" &&
              <Form.Group className="mb-3" controlId="image">
                <Form.Label><b>Image</b></Form.Label>
                <Form.Control type="file" onChange={imageSelected} />
                {songImage && <img style={{width: '150px', marginTop: '0.5em'}} src={songImage} alt="" />}
              </Form.Group>}
          </Form>
        </Col>

        <Col style={{ flex: '0 0 320px', maxWidth: '320px' }} className="mb-3 mb-md-0">
          <div style={{position: 'sticky', top: 0}}>
            <h5>Already in your collection</h5>
            <p className="text-muted small">Choose an existing tune to merge into.</p>
            {songTitle.trim().length < 2 &&
              <p className="text-muted">Start typing a title to see possible matches you can open instead of adding a new tune.</p>}
            {songTitle.trim().length >= 2 && matchingTunes.length === 0 &&
              <p className="text-muted">No matching tunes found in your collection.</p>}
            {matchingTunes.length > 0 &&
              <ListGroup>
                {matchingTunes.map(function(tune, tk) {
                  return (
                    <ListGroup.Item key={tk}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
                        <span>{tune.name}</span>
                        <div style={{ display: 'flex', gap: '0.45em' }}>
                          <Button size="sm" variant="outline-secondary" onClick={function() { openExistingTune(tune) }}>
                            Open
                          </Button>
                          <Button size="sm" variant={mergeTargetTuneId === tune.id ? 'success' : 'outline-primary'} onClick={function() { startMergeIntoExisting(tune) }}>
                            Merge
                          </Button>
                        </div>
                      </div>
                      {mergeTargetTuneId === tune.id && <div className="text-success small mt-1">Selected merge target</div>}
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

  function renderBulkTab() {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '1em', maxWidth: '52em'}}>
        <div>
          <h5>Curated collections</h5>
          <p className="text-muted small">Curated imports update by tune id and skip tunes that are newer locally.</p>
          <ImportCollectionsAccordion
            tunebook={props.tunebook}
            setCurrentTuneBook={props.setCurrentTuneBook}
            startCollapsed={true}
          />
        </div>
        <p className="text-muted">
          Paste or build a list of tunes to import one at a time through the review queue.
          Each line: Title, Title by Artist, or Title | url.
        </p>
        {importError && <Alert variant="danger">{importError}</Alert>}
        <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.6em', alignItems: 'center'}}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <Button variant="outline-primary" disabled={audioImportBusy} onClick={function() { bulkFileInputRef.current && bulkFileInputRef.current.click() }}>
              {audioImportBusy ? 'Processing files...' : 'File'}
            </Button>
            {audioImportBusy && (
              <ProgressBar
                animated
                striped
                now={100}
                style={{ marginTop: '0.35em', height: '0.45em', minWidth: '10em', width: '100%' }}
              />
            )}
          </div>
          {props.token && (
            <DriveFilePickerModal
              label="Drive"
              title="Load list from Google Drive"
              token={props.token}
              driveApi={driveApi}
              requestGoogleScopes={props.requestGoogleScopes}
              mimeTypes={[
                'text/plain',
                'text/csv',
                'application/vnd.google-apps.document',
                'application/vnd.google-apps.spreadsheet',
              ]}
              onFileText={function(text) { appendBulkLines(driveListTextToBulkLines(text)) }}
            />
          )}
          <BulkYouTubePlaylistModal onLines={appendBulkLines} disabled={audioImportBusy} />
          <Button variant="outline-primary" disabled={bulkBusy || audioImportBusy || !bulkText.trim()} onClick={handleBulkSearch}>
            {bulkBusy ? 'Searching…' : 'Search'}
          </Button>
          <Button variant="success" disabled={!bulkText.trim()} onClick={handleBulkImport}>Import</Button>
        </div>
        <Form.Control
          as="textarea"
          rows={32}
          value={bulkText}
          onChange={function(e) { setBulkText(e.target.value) }}
          placeholder={'Whiskey in the Jar\nThe Wild Rover by The Dubliners | https://www.youtube.com/watch?v=...'}
          style={{ fontFamily: 'monospace', fontSize: '1.05em' }}
        />
      </div>
    )
  }

  function renderPanelTitle() {
    return (
      <span style={{width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1em', flexWrap: 'wrap'}}>
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.35em', minWidth: 0 }}>
          <span>{importReviewActive ? 'Import review' : 'Add tunes'}</span>
          {!importReviewActive && activeTab === 'add' ? renderAddFromStrip({
            showRoutingNote: false,
            showProgress: false,
            containerStyle: { display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignItems: 'center', maxWidth: '100%' },
          }) : null}
        </span>
        {!importReviewActive && activeTab === 'add' && (
          <span style={{ display: 'inline-flex', gap: '0.5em', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <Button
              size="lg"
              variant="warning"
              disabled={!canAdd}
              onClick={startEnhancementFromAddForm}
            >
              Enhance
            </Button>
            <Button
              size="lg"
              variant="outline-secondary"
              onClick={handleCancelAdd}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              variant={canAdd ? 'success' : 'secondary'}
              disabled={!canAdd}
              onClick={addTune}
            >
              {props.tunebook.icons.add} Add
            </Button>
          </span>
        )}
      </span>
    )
  }

  function renderPanelBody() {
    return (
      <>
        {!importReviewActive && (
        <>
        <Tabs activeKey={activeTab} onSelect={function(key) {
          setActiveTab(key)
          if (props.onActiveTabChange) props.onActiveTabChange(key)
        }} className="mb-3 add-tunes-tabs">
          <Tab eventKey="add" title={<span style={{fontSize: '1.25em', fontWeight: 'bold'}}>Add</span>}>
            {renderAddTab()}
          </Tab>
          <Tab eventKey="bulk" title={<span style={{fontSize: '1.25em', fontWeight: 'bold'}}>Bulk</span>}>
            {renderBulkTab()}
          </Tab>
        </Tabs>
        </>
        )}
      </>
    )
  }

  function renderRoutePage() {
    const page = (
      <div className="add-page">
        <div className="add-page-header">
          <h1 className="add-page-title">{renderPanelTitle()}</h1>
          <Button variant="outline-secondary" className="add-page-close" onClick={handleClose} aria-label="Close">
            {props.tunebook.icons.closecircle || '×'}
          </Button>
        </div>
        <div className="add-page-body container-fluid">
          {renderPanelBody()}
        </div>
      </div>
    )
    return createPortal(page, document.body)
  }

  return (
    <>
      {!props.routeMode ? (
        props.buttonGroupMember ? (
          <span className="header-dropdown-add-trigger" style={{ display: 'contents' }}>
            <Button
              variant="success"
              size={props.buttonSize}
              className={(props.buttonClassName || '') + ' header-dropdown-add-btn'}
              title="Add Tunes"
              onClick={handleShow}
            >
              {props.tunebook.icons.fileadd} Add
            </Button>
          </span>
        ) : (
          <Button
            variant="success"
            size={props.buttonSize}
            className={props.buttonClassName}
            title="Add Tunes"
            onClick={handleShow}
          >
            {props.tunebook.icons.fileadd} Add
          </Button>
        )
      ) : null}

      {props.routeMode ? renderRoutePage() : (
        <Modal show={show} onHide={handleClose} fullscreen={true} backdrop="static" keyboard={true}>
          <Modal.Header closeButton>
            <Modal.Title>{renderPanelTitle()}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {renderPanelBody()}
          </Modal.Body>
        </Modal>
      )}

      <input
        ref={bulkFileInputRef}
        type="file"
        accept={bulkFileAcceptList()}
        multiple
        style={{ display: 'none' }}
        onChange={handleBulkFileSelected}
      />

      <AudioDriveUploadModal
        show={showAudioDriveUploadModal}
        files={
          pendingBulkAudioFiles.length > 0
            ? pendingBulkAudioFiles
            : (pendingAudioFile ? [pendingAudioFile] : [])
        }
        loggedIn={!!(props.token && props.token.access_token)}
        onConfirm={function(uploadToDriveFlags) {
          if (pendingBulkAudioFiles.length > 0) {
            continueBulkAudioImport(pendingBulkAudioFiles, uploadToDriveFlags)
          } else {
            continueAudioImport(pendingAudioFile, !!(uploadToDriveFlags && uploadToDriveFlags[0]))
          }
        }}
        onCancel={cancelAudioDriveUpload}
      />

      <SheetImageCameraModal
        show={showSheetCamera}
        onHide={function() { setShowSheetCamera(false); }}
        onCapture={function(file) {
          setShowSheetCamera(false);
          runAddImport(file);
        }}
      />
      <SheetImageGooglePhotosModal
        show={showSheetGooglePhotos}
        onHide={function() { setShowSheetGooglePhotos(false); }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        login={props.login}
        onSelectFile={function(file) {
          setShowSheetGooglePhotos(false);
          runAddImport(file);
        }}
      />
    </>
  )
}

export default AddSongModal
