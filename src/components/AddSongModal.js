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
  subscribeImportReviewSession,
  getImportReviewSessionRevision,
} from '../importReviewSessionStore'
import PasteImportModal from './PasteImportModal'
import ImportUrlModal from './ImportUrlModal'
import TuneAliasesField from './TuneAliasesField'
import DriveFilePickerModal from './DriveFilePickerModal'
import SheetImageCameraModal from './SheetImageCameraModal'
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal'
import SheetImageTranscriptionPanel from './SheetImageTranscriptionPanel'
import SheetImageImportMergeModal from './SheetImageImportMergeModal'
import { LyricsContentMergeTabs, NotationContentMergeTabs } from './ImportContentMergeTabs'
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
  applySheetDraftMergeOptions as mergeSheetDraftIntoForm,
  lyricsFromImportedTune,
  notationFromImportedTune,
} from '../addSongSheetDraft'

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
  const [showSheetDraftMergeModal, setShowSheetDraftMergeModal] = useState(false)
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
    if (!merged) return
    if (merged.name) setSongTitle(merged.name)
    if (merged.composer) setSongComposer(merged.composer)
    if (Array.isArray(merged.aliases)) setSongAliases(merged.aliases.slice())
    if (merged.genre) setSongGenre(merged.genre)
    if (merged.suitableForPractice === false) setSongSuitableForPractice(false)
    else if (merged.suitableForPractice === true) setSongSuitableForPractice(true)
    if (Array.isArray(merged.suitableFor) && merged.suitableFor.length > 0) {
      setSongSuitableFor(normalizeSuitableInstruments(merged.suitableFor))
    }
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
    if (Array.isArray(merged.words) && merged.words.length > 0) {
      setSongWords(merged.words.join("\n"))
    } else {
      const plainLyrics = getPlainLyricLines(merged)
      if (plainLyrics.length > 0) {
        setSongWords(plainLyrics.join("\n"))
      }
    }
    setStagedTune(merged)
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
  }, [])

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
      return false
    }
    if (result.action === 'review') {
      const handled = processReviewResult(result, importContext, applyImportedTune, startImportReview, toast)
      if (handled) return true
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
    setShowSheetDraftMergeModal(false)
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

  function confirmSheetDraftMerge(mergeOptions) {
    if (!pendingSheetDraft) return
    const draft = Object.assign({}, pendingSheetDraft, {
      meta: Object.assign({}, pendingSheetDraft.meta || {}, {
        title: pendingSheetDraft.meta && pendingSheetDraft.meta.title != null
          ? pendingSheetDraft.meta.title
          : pendingSheetDraft.title,
        artist: pendingSheetDraft.meta && pendingSheetDraft.meta.artist != null
          ? pendingSheetDraft.meta.artist
          : pendingSheetDraft.artist,
        key: pendingSheetDraft.meta && pendingSheetDraft.meta.key != null
          ? pendingSheetDraft.meta.key
          : pendingSheetDraft.key,
        meter: pendingSheetDraft.meta && pendingSheetDraft.meta.meter != null
          ? pendingSheetDraft.meta.meter
          : pendingSheetDraft.meter,
        aliases: pendingSheetDraft.meta && pendingSheetDraft.meta.aliases
          ? pendingSheetDraft.meta.aliases
          : [],
      }),
      chordText: pendingSheetDraft.chordText || '',
      melodyAbc: pendingSheetDraft.melodyAbc || '',
    })
    const applied = mergeSheetDraftIntoForm(draft, mergeOptions, {
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
    })
    if (applied.title) setSongTitle(applied.title)
    if (applied.artist) setSongComposer(applied.artist)
    if (applied.key) setSongKey(applied.key)
    if (applied.meter) setSongMeter(applied.meter)
    if (Array.isArray(applied.aliases) && applied.aliases.length) {
      setSongAliases(applied.aliases.slice())
    }
    if (applied.lyrics) setSongWords(applied.lyrics)
    if (applied.notes) setSongNotes(applied.notes)
    clearPendingSheetDraft()
  }

  function stageLookupFromWebSearch(merged) {
    if (!merged) return
    if (merged.genre) setSongGenre(merged.genre)
    if (merged.key && !songKey.trim()) setSongKey(merged.key)
    if (merged.meter && !songMeter.trim()) setSongMeter(merged.meter)
    if (merged.rhythm && !songRhythm.trim()) setSongRhythm(merged.rhythm)
    if (merged.tempo && !songTempo.trim()) setSongTempo(String(merged.tempo))
    if (merged.backgroundInfo && !songBackgroundInfo.trim()) {
      setSongBackgroundInfo(merged.backgroundInfo)
    }
    const lyrics = lyricsFromImportedTune(merged)
    if (lyrics) stageLookupLyrics(lyrics, 'Web lookup')
    stageLookupNotation(merged, 'Web lookup')
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
  }

  const lyricsMergeSources = useMemo(function() {
    const sources = []
    if (pendingSheetDraft && pendingSheetDraft.chordText && pendingSheetDraft.chordText.trim()) {
      sources.push({
        id: 'sheet-transcription',
        label: 'Transcription',
        text: pendingSheetDraft.chordText,
      })
    }
    if (pendingLookupSources.lyrics && pendingLookupSources.lyrics.text) {
      sources.push(pendingLookupSources.lyrics)
    }
    if (pendingLookupSources.chordText && pendingLookupSources.chordText.text) {
      sources.push(pendingLookupSources.chordText)
    }
    return sources
  }, [pendingSheetDraft, pendingLookupSources])

  const notationMergeSources = useMemo(function() {
    const sources = []
    if (pendingSheetDraft && pendingSheetDraft.melodyAbc && pendingSheetDraft.melodyAbc.trim()) {
      sources.push({
        id: 'sheet-transcription-abc',
        label: 'Transcription',
        text: pendingSheetDraft.melodyAbc,
      })
    }
    if (pendingLookupSources.notation && pendingLookupSources.notation.text) {
      sources.push(pendingLookupSources.notation)
    }
    return sources
  }, [pendingSheetDraft, pendingLookupSources])

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
            <div className="abc-editor-info-section">
              <Form.Group className="mb-3" controlId="title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em', width: '100%' }}>
                  <Form.Label style={{ marginBottom: 0 }}><b>Title</b></Form.Label>
                  {pendingSheetDraft ? (
                    <SheetImageTranscriptionPanel
                      fileName={pendingSheetDraft.fileName}
                      result={pendingSheetDraft.body}
                      chordText={pendingSheetDraft.chordText || ''}
                      melodyAbc={pendingSheetDraft.melodyAbc || ''}
                      metaTitle={(pendingSheetDraft.meta && pendingSheetDraft.meta.title) || pendingSheetDraft.title || ''}
                      metaArtist={(pendingSheetDraft.meta && pendingSheetDraft.meta.artist) || pendingSheetDraft.artist || ''}
                      metaAliases={(pendingSheetDraft.meta && pendingSheetDraft.meta.aliases) || []}
                      metaKey={(pendingSheetDraft.meta && pendingSheetDraft.meta.key) || pendingSheetDraft.key || ''}
                      metaMeter={(pendingSheetDraft.meta && pendingSheetDraft.meta.meter) || pendingSheetDraft.meter || ''}
                      activeTab={pendingSheetDraft.activeTab || 'chords'}
                      onMetaChange={updatePendingSheetDraftMeta}
                      onChordTextChange={function(text) {
                        setPendingSheetDraft(function(current) {
                          if (!current) return current
                          return Object.assign({}, current, { chordText: text })
                        })
                      }}
                      onMelodyAbcChange={function(text) {
                        setPendingSheetDraft(function(current) {
                          if (!current) return current
                          return Object.assign({}, current, { melodyAbc: text })
                        })
                      }}
                      onActiveTabChange={function(tab) {
                        setPendingSheetDraft(function(current) {
                          if (!current) return current
                          return Object.assign({}, current, { activeTab: tab })
                        })
                      }}
                      onApply={function() { setShowSheetDraftMergeModal(true) }}
                      onDismiss={clearPendingSheetDraft}
                    />
                  ) : null}
                  <input
                    ref={addFileInputRef}
                    type="file"
                    accept={addFromFileAcceptList(resolverAvailable)}
                    style={{ display: 'none' }}
                    onChange={handleAddFileSelected}
                  />
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

              <Row>
                <Col xs={12} md={8}>
                  <Form.Group className="mb-3" controlId="composer">
                    <Form.Label style={{ marginBottom: '0.35em' }}><b>Artist</b></Form.Label>
                    <SelectInput
                      onChange={function(val) { setSongComposer(val) }}
                      value={songComposer ? songComposer : ''}
                      options={artistOptions}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Group className="mb-3" controlId="genre">
                    <FormLabelWithHelp label={<b>Genre</b>} htmlFor="add-tune-genre" helpBody={EDITOR_INFO_FIELD_HELP.genre.body} helpTitle={EDITOR_INFO_FIELD_HELP.genre.title} />
                    <CreatableSelect
                      inputId="add-tune-genre"
                      value={genreSelectValue(songGenre)}
                      onChange={function(val) { setSongGenre(val ? val.label : '') }}
                      options={getMusicGenreSelectOptions()}
                      isClearable={true}
                      blurInputOnSelect={true}
                      createOptionPosition="first"
                      placeholder="eg Folk, Jazz"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <TuneAliasesField
                value={songAliases}
                onChange={function(aliases) { setSongAliases(aliases) }}
                controlId="add-tune-aliases"
              />
            </div>

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
                <FormLabelWithHelp
                  label="Background information (Markdown)"
                  helpBody={EDITOR_INFO_FIELD_HELP.backgroundInfo.body}
                  helpTitle={EDITOR_INFO_FIELD_HELP.backgroundInfo.title}
                />
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
              <Form.Label style={{ marginBottom: '0.35em' }}><b>Lyrics</b></Form.Label>
              <LyricsContentMergeTabs
                currentText={songWords}
                sources={lyricsMergeSources}
                onChange={setSongWords}
              />
              <Form.Control
                as="textarea"
                value={songWords}
                onChange={function(e) { setSongWords(e.target.value) }}
                rows={10}
                style={textAreaStyle}
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="notes">
              <FormLabelWithHelp label={<b>ABC Notes</b>} helpBody={ADD_TUNE_FIELD_HELP.abcNotes.body} helpTitle={ADD_TUNE_FIELD_HELP.abcNotes.title} />
              <NotationContentMergeTabs
                currentText={songNotes}
                sources={notationMergeSources}
                onChange={setSongNotes}
              />
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
      <SheetImageImportMergeModal
        show={showSheetDraftMergeModal}
        onHide={function() { setShowSheetDraftMergeModal(false) }}
        result={pendingSheetDraft && pendingSheetDraft.body}
        title={(pendingSheetDraft && pendingSheetDraft.meta && pendingSheetDraft.meta.title) || (pendingSheetDraft && pendingSheetDraft.title) || ''}
        artist={(pendingSheetDraft && pendingSheetDraft.meta && pendingSheetDraft.meta.artist) || (pendingSheetDraft && pendingSheetDraft.artist) || ''}
        keyName={(pendingSheetDraft && pendingSheetDraft.meta && pendingSheetDraft.meta.key) || (pendingSheetDraft && pendingSheetDraft.key) || ''}
        meter={(pendingSheetDraft && pendingSheetDraft.meta && pendingSheetDraft.meta.meter) || (pendingSheetDraft && pendingSheetDraft.meter) || ''}
        chordText={pendingSheetDraft && pendingSheetDraft.chordText}
        melodyAbc={pendingSheetDraft && pendingSheetDraft.melodyAbc}
        onConfirm={confirmSheetDraftMerge}
      />
    </>
  )
}

export default AddSongModal
