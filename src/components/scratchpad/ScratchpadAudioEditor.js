import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Modal, Form, Button } from 'react-bootstrap'
import WaveformPlaylist from 'waveform-playlist'
import ensureWaveformPlayoutDisconnectGuard from '../../waveformPlaylistPlayoutPatch'
import ensureWaveformPlaylistTrackHeightPatch from '../../waveformPlaylistTrackHeightPatch'
import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import ScratchpadAudioMenuBar from './ScratchpadAudioMenuBar'
import ScratchpadAudioTransportDock from './ScratchpadAudioTransportDock'
import ScratchpadAudioSelectionBar from './ScratchpadAudioSelectionBar'
import ScratchpadAudioRegionBar from './ScratchpadAudioRegionBar'
import ScratchpadAudioFadeLayer from './ScratchpadAudioFadeLayer'
import ScratchpadAudioExportModal from './ScratchpadAudioExportModal'
import ScratchpadAudioSettingsModal from './ScratchpadAudioSettingsModal'
import ScratchpadTrackPanel from './ScratchpadTrackPanel'
import ScratchpadCompRegionOverlay from './ScratchpadCompRegionOverlay'
import ScratchpadMidiLaneEditor from './ScratchpadMidiLaneEditor'
import { getScratchpadBlob, putScratchpadBlob, scratchpadMixdownBlobKey } from '../../scratchpadBlobs'
import { getScratchpadItem, updateScratchpadItem, markScratchpadUploadPending } from '../../scratchpadStore'
import {
  readScratchpadAudioEditorSession,
  writeScratchpadAudioEditorSession,
} from '../../scratchpadAudioEditorSession'
import Metronome from '../../Metronome'
import { normalizeRhythmConfig, createRhythmConfig, ENGINE_MODE_DRUMS } from '../../rhythmEngineTypes'
import { slotsForBeatCount } from '../../metronomeRhythmPresets'
import { primeDrumKit } from '../../drumSampleKit'
import MP3Converter from '../../MP3Converter'
import {
  analyzeAudioBuffer,
  decodeAudioBlob,
  trimAudioBlob,
} from '../../audioSilenceUtils'
import {
  roundMarkerTime,
  formatMarkerTime,
  getLoopRegion,
  clampMarkerTimeContinuous,
} from '../../scratchpadAudioMarkers'
import {
  normalizeMarker,
  setMarkerLoopRole,
} from './ScratchpadAudioMarkerLayer'
import {
  loadProjectTracks,
  getProjectDuration,
  getActiveTake,
  getTrackById,
  addTakeToTrack,
  setActiveTakeOnTrack,
  assignCompRegion,
  snapshotProject,
  restoreProjectSnapshot,
  createDefaultAudioTrack,
  MAX_PROJECT_UNDO,
  createTrackFolder,
  reorderTracks,
  moveTrackToFolder,
  toggleTrackFolderCollapsed,
  removeTrackFolder,
  renameTrackFolder,
  duplicateAudioTrack,
} from '../../scratchpadAudioProject'
import useScratchpadWaveformZoom from '../../useScratchpadWaveformZoom'
import useScratchpadTrackScrollSync from '../../useScratchpadTrackScrollSync'
import { zoomPlaylistToSelection } from '../../scratchpadWaveformZoom'
import { applyAudioEffectToBlob } from '../../scratchpadAudioEffects'
import { separateScratchpadStems } from '../../scratchpadStemSeparation'
import {
  cutSelectionFromBlob,
  copySelectionFromBlob,
  pasteIntoBlob,
  deleteSelectionFromBlob,
  silenceSelectionInBlob,
  reverseSelectionInBlob,
  invertSelectionInBlob,
  trimToSelectionInBlob,
  extractBufferRegion,
} from '../../scratchpadAudioEditOps'
import { encodeAudioBufferToWav } from '../../encodeAudioBufferToWav'
import { analyzeBlob } from '../../scratchpadAudioAnalysis'
import { generateAudio } from '../../scratchpadAudioGenerate'
import { appendId3v2ToMp3, appendWavInfoChunk, normalizeExportMetadata } from '../../scratchpadAudioMetadata'
import useScratchpadAudioShortcuts from '../../useScratchpadAudioShortcuts'
import useScratchpadToolbarWidth from '../../useScratchpadToolbarWidth'
import { scratchpadToolbarTier } from '../../scratchpadAudioToolbarLayout'
import { createMacroRecorder, recordMacroStep, runMacro } from '../../scratchpadAudioMacros'
import ScratchpadAudioSpectrogramLayer from './ScratchpadAudioSpectrogramLayer'
import ScratchpadAudioInsertModal from './ScratchpadAudioInsertModal'
import { insertAudioBlobAtPlayhead } from '../../scratchpadAudioInsert'
import useMediaResolverHealth from '../../useMediaResolverHealth'
import { useCreditAffordance } from '../../useCreditAffordance'
import { isStemsCapabilityAvailable, loadProviderSettings } from '../../providerSettings'

const WAVEFORM_ZOOM_LEVELS = [50, 75, 100, 250, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12500, 15000, 20000, 30000, 40000, 50000]
const ADVANCED_FEATURES_KEY = 'scratchpadAudioAdvanced'
const ARM_HINT_KEY = 'scratchpadAudioArmHintShown'

function readAdvancedFeatures() {
  try {
    return localStorage.getItem(ADVANCED_FEATURES_KEY) === '1'
  } catch (e) {
    return false
  }
}

ensureWaveformPlayoutDisconnectGuard()
ensureWaveformPlaylistTrackHeightPatch()

function MarkerEditModal(props) {
  const marker = props.marker
  const duration = props.duration || 0
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('0')
  const [loopStart, setLoopStart] = useState(false)
  const [loopEnd, setLoopEnd] = useState(false)
  const inputRef = useRef(null)

  useEffect(function() {
    if (!props.show || !marker) return
    setLabel(marker.label || '')
    setTime(formatMarkerTime(marker.time != null ? marker.time : 0))
    setLoopStart(marker.loopRole === 'start')
    setLoopEnd(marker.loopRole === 'end')
    const t = setTimeout(function() {
      if (inputRef.current) inputRef.current.focus()
    }, 50)
    return function() { clearTimeout(t) }
  }, [props.show, marker])

  if (!marker) return null

  function handleSave(e) {
    e.preventDefault()
    const parsed = roundMarkerTime(parseFloat(time))
    if (!Number.isFinite(parsed) || parsed < 0) return
    const capped = duration > 0 ? Math.min(parsed, roundMarkerTime(duration)) : parsed
    let loopRole = null
    if (loopStart) loopRole = 'start'
    else if (loopEnd) loopRole = 'end'
    if (props.onSave) {
      props.onSave({
        label: String(label || '').trim() || marker.label || 'Marker',
        time: capped,
        loopRole: loopRole,
      })
    }
  }

  return (
    <Modal show={props.show} onHide={props.onHide} centered size="sm">
      <Form onSubmit={handleSave}>
        <Modal.Header closeButton><Modal.Title>Edit marker</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Label</Form.Label>
            <Form.Control ref={inputRef} value={label} onChange={function(e) { setLabel(e.target.value) }} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Time (seconds)</Form.Label>
            <Form.Control type="number" min="0" step="0.1" value={time} onChange={function(e) { setTime(e.target.value) }} />
          </Form.Group>
          <Form.Check
            type="checkbox"
            className="mb-1"
            label="Loop start"
            checked={loopStart}
            onChange={function(e) { setLoopStart(e.target.checked); if (e.target.checked) setLoopEnd(false) }}
          />
          <Form.Check
            type="checkbox"
            className="mb-0"
            label="Loop end"
            checked={loopEnd}
            onChange={function(e) { setLoopEnd(e.target.checked); if (e.target.checked) setLoopStart(false) }}
          />
        </Modal.Body>
        <Modal.Footer>
          {props.onDelete ? <Button variant="outline-danger" className="me-auto" onClick={props.onDelete}>Delete</Button> : null}
          <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
          <Button variant="primary" type="submit">Save</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}

export default function ScratchpadAudioEditor(props) {
  const item = props.item
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}
  const { available: resolverAvailable, status: resolverStatus, features } = useMediaResolverHealth()
  const stemAffordance = useCreditAffordance(
    props.token,
    'stem_job'
  )
  const stemsCapability = isStemsCapabilityAvailable(
    features,
    loadProviderSettings(),
    resolverStatus
  )
  const editorRef = useRef(null)
  const wrapRef = useRef(null)
  const panelScrollRef = useRef(null)
  const playlistRef = useRef(null)
  const eeRef = useRef(null)
  const audioContextRef = useRef(null)
  const metronomeRef = useRef(null)
  const loopRepeatRef = useRef(false)
  const loopRegionRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const selectionRef = useRef(null)
  const saveTimerRef = useRef(null)
  const audioProjectRef = useRef(readScratchpadAudioEditorSession(item))
  const prevItemIdRef = useRef(null)
  const clipboardRef = useRef(null)
  const lastEffectRef = useRef(null)
  const editorRootRef = useRef(null)
  const macroRecorderRef = useRef(createMacroRecorder())
  const isRecordingRef = useRef(false)
  const mediaStreamRef = useRef(null)
  const reloadResolveRef = useRef(null)
  const pendingRecordAfterReloadRef = useRef(false)
  const beginRecordingRef = useRef(null)
  const playlistReloadingRef = useRef(false)

  const [audioProject, setAudioProject] = useState(function() {
    return readScratchpadAudioEditorSession(item)
  })
  const [markers, setMarkers] = useState((item.audio && item.audio.markers) || [])
  const [trimSuggestion, setTrimSuggestion] = useState(item.audio && item.audio.trimSuggestion)
  const [duration, setDuration] = useState(0)
  const [hasContent, setHasContent] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [trimming, setTrimming] = useState(false)
  const [editMode, setEditMode] = useState('cursor')
  const [currentTime, setCurrentTime] = useState(0)
  const [editingMarkerIndex, setEditingMarkerIndex] = useState(null)
  const [loopRepeat, setLoopRepeat] = useState(!!(item.audio && item.audio.loopRepeat))
  const [stemBusy, setStemBusy] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [midiEditTrackId, setMidiEditTrackId] = useState(null)
  const [selection, setSelection] = useState(null)
  const [clipboardHasData, setClipboardHasData] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showInsertModal, setShowInsertModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [trackDrawerOpen, setTrackDrawerOpen] = useState(false)
  const [selectionBarExpanded, setSelectionBarExpanded] = useState(false)
  const [analysisMessage, setAnalysisMessage] = useState('')
  const [trackDurations, setTrackDurations] = useState({})
  const [spectrogramVisible, setSpectrogramVisible] = useState(false)
  const [inputAnalyser, setInputAnalyser] = useState(null)
  const [advancedFeatures, setAdvancedFeatures] = useState(readAdvancedFeatures)
  const [highlightArmTrackId, setHighlightArmTrackId] = useState(null)
  const overlayRefreshRef = useRef(null)
  const regionRefreshRef = useRef(null)

  const refreshOverlays = useCallback(function() {
    if (regionRefreshRef.current) regionRefreshRef.current()
    if (overlayRefreshRef.current) overlayRefreshRef.current()
  }, [])
  const [micError, setMicError] = useState(false)
  const toolbarWidth = useScratchpadToolbarWidth(editorRootRef)
  const layoutTier = scratchpadToolbarTier(toolbarWidth)
  const canSeparateStems = hasContent && stemsCapability && resolverAvailable
    && (stemAffordance.creditUnlimited || !stemAffordance.checked || stemAffordance.affordable)

  useScratchpadWaveformZoom({
    wrapRef: wrapRef,
    editorRef: editorRef,
    eeRef: eeRef,
    playlistRef: playlistRef,
    onZoom: refreshOverlays,
  })

  useScratchpadTrackScrollSync(panelScrollRef, editorRef, reloadKey)

  audioProjectRef.current = audioProject

  useEffect(function() { isRecordingRef.current = isRecording }, [isRecording])

  function waitForPlaylistReload() {
    return new Promise(function(resolve) {
      reloadResolveRef.current = resolve
    })
  }

  function setAdvancedFeaturesEnabled(enabled) {
    setAdvancedFeatures(enabled)
    try {
      localStorage.setItem(ADVANCED_FEATURES_KEY, enabled ? '1' : '0')
    } catch (e) { /* ignore */ }
  }

  useEffect(function() {
    let cancelled = false
    async function loadDurations() {
      const durs = {}
      const tracks = audioProject.tracks || []
      for (let i = 0; i < tracks.length; i += 1) {
        const track = tracks[i]
        if (track.type === 'midi') continue
        const take = getActiveTake(track)
        if (!take || !take.blobKey) continue
        try {
          const blob = await getScratchpadBlob(take.blobKey)
          if (!blob) continue
          const buf = await decodeAudioBlob(blob)
          durs[track.id] = buf.duration
        } catch (e) { /* skip */ }
      }
      if (!cancelled) setTrackDurations(durs)
    }
    loadDurations()
    return function() { cancelled = true }
  }, [audioProject, reloadKey])

  useEffect(function() {
    const ee = eeRef.current
    if (!ee) return
    const stateMap = {
      cursor: 'cursor',
      select: 'select',
      shift: 'shift',
      fadein: 'fadein',
      fadeout: 'fadeout',
    }
    ee.emit('statechange', stateMap[editMode] || 'cursor')
  }, [editMode, reloadKey])

  useEffect(function() { loopRepeatRef.current = loopRepeat }, [loopRepeat])
  useEffect(function() {
    loopRegionRef.current = getLoopRegion(markers, audioProject.loopRegion || (item.audio && item.audio.loopRegion))
  }, [markers, audioProject.loopRegion, item.audio && item.audio.loopRegion])

  const syncUndoRedoState = useCallback(function() {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }, [])

  async function pushUndoSnapshot() {
    const snap = await snapshotProject(item, getScratchpadBlob, putScratchpadBlob)
    undoStackRef.current = undoStackRef.current.concat([snap]).slice(-MAX_PROJECT_UNDO)
    redoStackRef.current = []
    syncUndoRedoState()
  }

  function getTargetTrack() {
    return armedTrack || (audioProjectRef.current.tracks || []).find(function(t) { return t.type === 'audio' })
  }

  async function mutateActiveTakeBlob(mutator) {
    const track = getTargetTrack()
    if (!track) return null
    const take = getActiveTake(track)
    if (!take || !take.blobKey) return null
    await pushUndoSnapshot()
    const blob = await getScratchpadBlob(take.blobKey)
    const next = await mutator(blob, selectionRef.current)
    if (!next) return null
    await putScratchpadBlob(take.blobKey, next)
    markScratchpadUploadPending(item.id)
    setReloadKey(function(n) { return n + 1 })
    if (props.onChange) props.onChange()
    return next
  }

  async function handleCut() {
    const track = getTargetTrack()
    if (!track) return
    const take = getActiveTake(track)
    const sel = selectionRef.current
    if (!take || !sel || sel.end <= sel.start) return
    await pushUndoSnapshot()
    const blob = await getScratchpadBlob(take.blobKey)
    const result = await cutSelectionFromBlob(blob, sel)
    clipboardRef.current = result.clipboard
    setClipboardHasData(!!result.clipboard)
    await putScratchpadBlob(take.blobKey, result.blob)
    markScratchpadUploadPending(item.id)
    setReloadKey(function(n) { return n + 1 })
  }

  async function handleCopy() {
    const track = getTargetTrack()
    if (!track) return
    const take = getActiveTake(track)
    const sel = selectionRef.current
    if (!take || !sel || sel.end <= sel.start) return
    const blob = await getScratchpadBlob(take.blobKey)
    const clip = await copySelectionFromBlob(blob, sel)
    clipboardRef.current = clip
    setClipboardHasData(!!clip)
  }

  async function handlePaste() {
    if (!clipboardRef.current) return
    await mutateActiveTakeBlob(function(blob) {
      return pasteIntoBlob(blob, clipboardRef.current, getPlayheadTime(), selectionRef.current)
    })
  }

  async function handleDelete() {
    await mutateActiveTakeBlob(function(blob, sel) {
      return deleteSelectionFromBlob(blob, sel)
    })
  }

  async function handleSilence() {
    await mutateActiveTakeBlob(function(blob, sel) {
      return silenceSelectionInBlob(blob, sel)
    })
  }

  async function handleReverse() {
    await mutateActiveTakeBlob(function(blob, sel) {
      return reverseSelectionInBlob(blob, sel)
    })
  }

  async function handleInvert() {
    await mutateActiveTakeBlob(function(blob, sel) {
      return invertSelectionInBlob(blob, sel)
    })
  }

  async function handleTrimToSelection() {
    await mutateActiveTakeBlob(function(blob, sel) {
      return trimToSelectionInBlob(blob, sel)
    })
  }

  async function handleSplit() {
    const track = getTargetTrack()
    if (!track) return
    const take = getActiveTake(track)
    if (!take || !take.blobKey) return
    const t = getPlayheadTime()
    await pushUndoSnapshot()
    const blob = await getScratchpadBlob(take.blobKey)
    const buffer = await decodeAudioBlob(blob)
    if (t <= 0 || t >= buffer.duration) return
    const before = await extractBufferRegion(buffer, 0, t)
    const after = await extractBufferRegion(buffer, t, buffer.duration)
    await putScratchpadBlob(take.blobKey, encodeAudioBufferToWav(before))
    const withTake = addTakeToTrack(track, item.id, encodeAudioBufferToWav(after))
    const tracks = audioProjectRef.current.tracks.map(function(tr) {
      return tr.id === track.id ? withTake : tr
    })
    persistProject(Object.assign({}, audioProjectRef.current, { tracks: tracks }), {}, true)
    setReloadKey(function(n) { return n + 1 })
  }

  function alignTracks(mode) {
    const t = getPlayheadTime()
    const sel = selectionRef.current
    const anchor = sel && sel.end > sel.start ? (mode === 'end' ? sel.end : sel.start) : t
    const tracks = (audioProjectRef.current.tracks || []).map(function(track) {
      if (track.type === 'midi') return track
      const take = getActiveTake(track)
      if (!take || !take.blobKey) return track
      if (mode === 'together') return track
      const dur = trackDurations[track.id] || 0
      let start = mode === 'end' ? anchor - dur : anchor
      if (audioProjectRef.current.snapToGrid) {
        const grid = audioProjectRef.current.snapInterval || 0.25
        start = Math.round(start / grid) * grid
      }
      return Object.assign({}, track, { start: Math.max(0, start) })
    })
    if (mode === 'together') {
      const audioTracks = tracks.filter(function(tr) { return tr.type !== 'midi' })
      const avg = audioTracks.reduce(function(s, tr) { return s + (tr.start || 0) }, 0) / Math.max(1, audioTracks.length)
      persistProject(Object.assign({}, audioProjectRef.current, {
        tracks: tracks.map(function(tr) { return Object.assign({}, tr, { start: avg }) }),
      }), {}, false)
    } else {
      persistProject(Object.assign({}, audioProjectRef.current, { tracks: tracks }), {}, false)
    }
    setReloadKey(function(n) { return n + 1 })
  }

  async function handleAnalyze(type) {
    const track = getTargetTrack()
    if (!track) return
    const take = getActiveTake(track)
    if (!take || !take.blobKey) return
    const blob = await getScratchpadBlob(take.blobKey)
    const result = await analyzeBlob(blob, type, selectionRef.current)
    if (type === 'rms') {
      setAnalysisMessage('Peak: ' + result.peakDb.toFixed(1) + ' dBFS, RMS: ' + result.rmsDb.toFixed(1) + ' dBFS')
    } else if (type === 'clipping') {
      const nextMarkers = (result || []).map(function(r, i) {
        return { time: r.start, label: 'Clip ' + (i + 1) }
      })
      if (nextMarkers.length) saveMarkers(markers.concat(nextMarkers))
      setAnalysisMessage('Found ' + (result || []).length + ' clipped regions')
    } else if (type === 'spectrum') {
      setAnalysisMessage('Spectrum computed (' + (result || []).length + ' bins). Peak near ' + Math.round((result[10] && result[10].freq) || 0) + ' Hz')
    } else if (type === 'labelSounds' || type === 'beats') {
      if (result && result.length) saveMarkers(markers.concat(result))
      setAnalysisMessage('Added ' + ((result && result.length) || 0) + ' markers')
    }
  }

  async function handleGenerate(type) {
    const track = getTargetTrack()
    const duration = selectionRef.current && selectionRef.current.end > selectionRef.current.start
      ? selectionRef.current.end - selectionRef.current.start
      : 2
    const wav = await generateAudio(type, {
      duration: duration,
      sampleRate: audioProjectRef.current.sampleRate || 48000,
      bpm: audioProjectRef.current.tempo || 120,
      beats: 4,
    })
    if (!track) {
      const newTrack = createDefaultAudioTrack(item.id, 'Generated')
      await putScratchpadBlob(newTrack.takes[0].blobKey, wav)
      addTrack(newTrack)
      return
    }
    await mutateActiveTakeBlob(function(blob) {
      return pasteIntoBlob(blob, wav, getPlayheadTime(), selectionRef.current)
    })
  }

  function handleFadeChange(trackId, fadeIn, fadeOut) {
    const tracks = audioProjectRef.current.tracks.map(function(t) {
      if (t.id !== trackId) return t
      const takes = t.takes.map(function(take) {
        if (take.id !== t.activeTakeId) return take
        return Object.assign({}, take, { fadeIn: fadeIn, fadeOut: fadeOut })
      })
      return Object.assign({}, t, { takes: takes })
    })
    persistProject(Object.assign({}, audioProjectRef.current, { tracks: tracks }), {}, false)
  }

  async function persistRecordingFromPlaylist() {
    const playlist = playlistRef.current
    const armed = (audioProjectRef.current.tracks || []).find(function(t) { return t.armed })
    if (!playlist || !armed || armed.type === 'midi') return
    const take = getActiveTake(armed)
    if (!take) return
    const recTrack = (playlist.tracks || []).find(function(t) {
      return t.name === 'Recording' && t.buffer
    })
    if (!recTrack || !recTrack.buffer) return
    await pushUndoSnapshot()
    const wav = encodeAudioBufferToWav(recTrack.buffer)
    await putScratchpadBlob(take.blobKey, wav)
    take.recordedAt = Date.now()
    markScratchpadUploadPending(item.id)
    const idx = playlist.tracks.indexOf(recTrack)
    if (idx >= 0) {
      playlist.tracks.splice(idx, 1)
    }
    setIsRecording(false)
    stopMetronome()
    setReloadKey(function(n) { return n + 1 })
    if (props.onChange) props.onChange()
  }

  function handleZoomToSelection() {
    const sel = selectionRef.current
    const playlist = playlistRef.current
    const editorEl = editorRef.current
    if (!sel || sel.end <= sel.start || !playlist || !editorEl) return
    zoomPlaylistToSelection(playlist, editorEl, sel.start, sel.end)
    if (overlayRefreshRef.current) overlayRefreshRef.current()
  }

  function handleSetLoopFromSelection() {
    const sel = selectionRef.current
    if (!sel || sel.end <= sel.start) return
    persistProject(audioProject, {
      loopRegion: { start: sel.start, end: sel.end },
      loopRepeat: true,
    }, false)
    setLoopRepeat(true)
  }

  function handleLoopRepeatChange(enabled) {
    setLoopRepeat(enabled)
    persistProject(audioProject, { loopRepeat: enabled }, false)
  }

  async function initRecorderWithDevice(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError(true)
      return false
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(function(tr) { tr.stop() })
    }
    const constraints = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setMicError(false)
      mediaStreamRef.current = stream
      const ac = audioContextRef.current
      if (ac) {
        const source = ac.createMediaStreamSource(stream)
        const analyser = ac.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        setInputAnalyser(analyser)
      }
      if (playlistRef.current) playlistRef.current.initRecorder(stream)
      return !!(playlistRef.current && playlistRef.current.mediaRecorder)
    } catch (e) {
      setMicError(true)
      setAnalysisMessage('Microphone access required to record — check browser permissions or Audio settings.')
      return false
    }
  }

  async function ensureRecorderReady() {
    const playlist = playlistRef.current
    if (!playlist) return false
    if (playlist.mediaRecorder) return true
    return initRecorderWithDevice(audioProjectRef.current.inputDeviceId)
  }

  async function runExport(options) {
    const ee = eeRef.current
    if (!ee) return
    setIsSaving(true)
    const meta = normalizeExportMetadata(options.metadata)

    if (options.scope === 'selection' && selectionRef.current && selectionRef.current.end > selectionRef.current.start) {
      try {
        const track = getTargetTrack()
        const take = getActiveTake(track)
        if (!take || !take.blobKey) throw new Error('No audio to export')
        const blob = await getScratchpadBlob(take.blobKey)
        const buffer = await decodeAudioBlob(blob)
        const sel = selectionRef.current
        const region = await extractBufferRegion(buffer, sel.start, sel.end)
        let outBlob = encodeAudioBufferToWav(region)
        if (options.format === 'mp3') {
          const converter = new MP3Converter()
          outBlob = await new Promise(function(res) {
            converter.convert(outBlob, { bitRate: 128 }, res)
          })
          outBlob = appendId3v2ToMp3(outBlob, meta)
        } else {
          const buf = await outBlob.arrayBuffer()
          outBlob = new Blob([appendWavInfoChunk(buf, meta)], { type: 'audio/wav' })
        }
        if (options.action === 'mix') {
          const mixKey = scratchpadMixdownBlobKey(item.id)
          await putScratchpadBlob(mixKey, outBlob)
          persistProject(audioProjectRef.current, { mixdownBlobKey: mixKey, metadata: meta }, true)
        } else {
          const url = URL.createObjectURL(outBlob)
          const a = document.createElement('a')
          a.href = url
          a.download = options.filename || ((item.title || 'export') + (options.format === 'mp3' ? '.mp3' : '.wav'))
          a.click()
          URL.revokeObjectURL(url)
        }
      } finally {
        setIsSaving(false)
        setShowExportModal(false)
      }
      return
    }

    const handler = async function(type, data) {
      ee.off('audiorenderingfinished', handler)
      let blob = data
      const meta = normalizeExportMetadata(options.metadata)
      if (options.format === 'mp3' && blob) {
        const converter = new MP3Converter()
        blob = await new Promise(function(res) {
          converter.convert(blob, { bitRate: 128 }, res)
        })
        blob = appendId3v2ToMp3(blob, meta)
      } else if (blob && blob.arrayBuffer) {
        const buf = await blob.arrayBuffer()
        blob = new Blob([appendWavInfoChunk(buf, meta)], { type: 'audio/wav' })
      }
      if (options.action === 'mix') {
        const mixKey = scratchpadMixdownBlobKey(item.id)
        await putScratchpadBlob(mixKey, blob)
        persistProject(audioProjectRef.current, { mixdownBlobKey: mixKey, metadata: meta }, true)
      } else if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = options.filename || ((item.title || 'export') + (options.format === 'mp3' ? '.mp3' : '.wav'))
        a.click()
        URL.revokeObjectURL(url)
      }
      setIsSaving(false)
      setShowExportModal(false)
    }
    ee.on('audiorenderingfinished', handler)
    ee.emit('startaudiorendering', 'wav')
  }

  function persistProject(nextAudio, extraPatch, notifyParent) {
    const merged = Object.assign({}, nextAudio, extraPatch || {})
    setAudioProject(merged)
    writeScratchpadAudioEditorSession(item.id, merged)
    updateScratchpadItem(item.id, { audio: merged })
    markScratchpadUploadPending(item.id)
    if (notifyParent && props.onChange) props.onChange()
  }

  function schedulePersistArrangement() {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(function() {
      persistProject(audioProjectRef.current, {}, false)
    }, 500)
  }

  useEffect(function() {
    if (prevItemIdRef.current === item.id) return
    prevItemIdRef.current = item.id
    setAudioProject(readScratchpadAudioEditorSession(item))
    setReloadKey(function(n) { return n + 1 })
  }, [item.id])

  const armedTrack = (audioProject.tracks || []).find(function(t) { return t.armed })

  const tracksSignature = useMemo(function() {
    return (audioProject.tracks || []).map(function(t) { return t.id }).join('|')
  }, [audioProject.tracks])

  useEffect(function() {
    const tracks = audioProjectRef.current.tracks || []
    if (tracks.some(function(t) { return t.armed })) return
    const firstAudio = tracks.find(function(t) { return t.type === 'audio' })
    if (!firstAudio) return
    const nextTracks = tracks.map(function(t) {
      return Object.assign({}, t, { armed: t.id === firstAudio.id })
    })
    setAudioProject(Object.assign({}, audioProjectRef.current, { tracks: nextTracks }))
    writeScratchpadAudioEditorSession(item.id, Object.assign({}, audioProjectRef.current, { tracks: nextTracks }))
  }, [item.id])

  useEffect(function() {
    const tracks = audioProject.tracks || []
    if (tracks.some(function(t) { return t.armed })) return
    if (!tracks.some(function(t) { return t.type === 'audio' })) return
    let showHint = true
    try {
      showHint = !localStorage.getItem(ARM_HINT_KEY)
      if (showHint) localStorage.setItem(ARM_HINT_KEY, '1')
    } catch (e) { /* ignore */ }
    if (!showHint) return
    const first = tracks.find(function(t) { return t.type === 'audio' })
    if (!first) return
    setHighlightArmTrackId(first.id)
    const timer = setTimeout(function() { setHighlightArmTrackId(null) }, 3000)
    return function() { clearTimeout(timer) }
  }, [item.id, audioProject.tracks])

  useEffect(function() {
    let cancelled = false
    getProjectDuration(audioProject).then(function(d) {
      if (!cancelled) setDuration(d)
    })
    loadProjectTracks(item, audioProject).then(function(specs) {
      if (!cancelled) setHasContent(specs.length > 0)
    })
    return function() { cancelled = true }
  }, [item.id, audioProject, reloadKey])

  useEffect(function() {
    let cancelled = false
    if (!editorRef.current) return undefined

    const ac = new (window.AudioContext || window.webkitAudioContext)()
    audioContextRef.current = ac

    const playlist = WaveformPlaylist({
      samplesPerPixel: 500,
      mono: false,
      waveHeight: 100,
      container: editorRef.current,
      state: 'cursor',
      colors: { waveOutlineColor: '#E0EFF1', timeColor: 'grey', fadeColor: 'black' },
      timescale: true,
      exclSolo: true,
      fadeType: 'logarithmic',
      controls: {
        show: false,
        width: 0,
        widgets: { muteOrSolo: false, volume: false, stereoPan: false, collapse: false, remove: false },
      },
      ac: ac,
      isAutomaticScroll: true,
      zoomLevels: WAVEFORM_ZOOM_LEVELS,
    })

    playlist.initExporter()
    playlistRef.current = playlist
    const ee = playlist.getEventEmitter()
    eeRef.current = ee

    ee.on('finished', function() {
      const region = loopRegionRef.current
      if (loopRepeatRef.current && region && region.end > region.start) {
        ee.emit('play', region.start, region.end)
        setIsPlaying(true)
      } else {
        setIsPlaying(false)
      }
    })
    ee.on('timeupdate', function(time) {
      if (typeof time === 'number' && Number.isFinite(time)) setCurrentTime(time)
    })
    ee.on('select', function(start, end) {
      setSelection({ start: start, end: end })
      selectionRef.current = { start: start, end: end }
    })
    ee.on('removeTrack', function() {
      schedulePersistArrangement()
    })
    ee.on('zoomin', refreshOverlays)
    ee.on('zoomout', refreshOverlays)
    ee.on('pause', function() {
      stopMetronome()
      if (isRecordingRef.current) persistRecordingFromPlaylist()
      setIsPlaying(false)
    })
    ee.on('stop', function() {
      stopMetronome()
      if (isRecordingRef.current) persistRecordingFromPlaylist()
      setIsPlaying(false)
      setIsRecording(false)
    })

    ee.on('shift', function(deltaTime, track) {
      if (audioProjectRef.current.snapToGrid) {
        const grid = audioProjectRef.current.snapInterval || 0.25
        if (track && typeof track.setStartTime === 'function') {
          const snapped = Math.round(track.getStartTime() / grid) * grid
          track.setStartTime(snapped)
        }
      }
      schedulePersistArrangement()
    })
    ee.on('mute', schedulePersistArrangement)
    ee.on('solo', schedulePersistArrangement)
    ee.on('volumechange', schedulePersistArrangement)
    ee.on('stereopan', schedulePersistArrangement)

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const deviceId = audioProjectRef.current.inputDeviceId
      initRecorderWithDevice(deviceId).catch(function() {})
    }

    setReloadKey(function(n) { return n + 1 })

    return function() {
      cancelled = true
      if (reloadResolveRef.current) {
        const resolve = reloadResolveRef.current
        reloadResolveRef.current = null
        resolve()
      }
      clearTimeout(saveTimerRef.current)
      if (eeRef.current) {
        try {
          if (playlistRef.current && playlistRef.current.isPlaying && playlistRef.current.isPlaying()) {
            eeRef.current.emit('pause')
          }
        } catch (e) { /* ignore */ }
      }
      playlistRef.current = null
      eeRef.current = null
      if (editorRef.current) editorRef.current.innerHTML = ''
    }
  }, [item.id])

  useEffect(function() {
    const playlist = playlistRef.current
    if (!playlist) return undefined
    let cancelled = false
    playlistReloadingRef.current = true

    const storeItem = getScratchpadItem(item.id) || item
    loadProjectTracks(storeItem, audioProjectRef.current).then(async function(specs) {
      if (cancelled || !playlistRef.current) return
      try {
        await playlistRef.current.load(specs)
        setHasContent(specs.length > 0)
        if (specs.length) {
          try {
            const first = specs[0]
            const blob = first.src
            if (blob) {
              const audioBuffer = await decodeAudioBlob(blob)
              if (!cancelled) {
                setDuration(await getProjectDuration(audioProjectRef.current))
                const analysis = await analyzeAudioBuffer(audioBuffer)
                setTrimSuggestion(analysis.trim)
              }
            }
          } catch (e) { /* skip */ }
        }
      } catch (e) { /* skip reload errors during dev HMR */ }
      playlistReloadingRef.current = false
      if (reloadResolveRef.current) {
        const resolve = reloadResolveRef.current
        reloadResolveRef.current = null
        resolve()
      }
      if (pendingRecordAfterReloadRef.current && beginRecordingRef.current) {
        pendingRecordAfterReloadRef.current = false
        beginRecordingRef.current()
      }
    })

    return function() {
      cancelled = true
      playlistReloadingRef.current = false
    }
  }, [item.id, reloadKey, tracksSignature])

  function getPlayheadTime() {
    const playlist = playlistRef.current
    if (playlist && typeof playlist.getCurrentTime === 'function') {
      const t = playlist.getCurrentTime()
      if (Number.isFinite(t)) return Math.max(0, t)
    }
    return Math.max(0, currentTime)
  }

  function stopMetronome() {
    if (metronomeRef.current) {
      try { metronomeRef.current.stop() } catch (e) { /* ignore */ }
      metronomeRef.current = null
    }
  }

  function startContinuousMetronome() {
    const ac = audioContextRef.current
    const ap = audioProjectRef.current
    if (!ac || !ap.metronomeEnabled) return
    stopMetronome()
    const rhythm = normalizeRhythmConfig(ap.rhythmConfig || createRhythmConfig(4))
    const metro = new Metronome(ac, ap.tempo || 120, rhythm.beatsPerBar, 0, null, null, rhythm)
    metronomeRef.current = metro
    const run = function() { metro.start() }
    if (rhythm.engineMode === ENGINE_MODE_DRUMS) {
      primeDrumKit(ac).then(run).catch(run)
    } else {
      run()
    }
  }

  async function handleInsertAudio(insertBlob) {
    const track = getTargetTrack()
    if (!track) {
      window.alert('Arm an audio track before inserting.')
      return
    }
    const take = getActiveTake(track)
    if (!take || !take.blobKey) {
      window.alert('No active take to insert into.')
      return
    }
    await pushUndoSnapshot()
    const existing = await getScratchpadBlob(take.blobKey)
    let next
    if (!existing || existing.size <= 0) {
      next = insertBlob
    } else {
      next = await insertAudioBlobAtPlayhead(
        existing,
        insertBlob,
        getPlayheadTime(),
        selectionRef.current
      )
    }
    await putScratchpadBlob(take.blobKey, next)
    markScratchpadUploadPending(item.id)
    setReloadKey(function(n) { return n + 1 })
    if (props.onChange) props.onChange()
  }

  function togglePlayPause() {
    const ee = eeRef.current
    if (!ee) return
    if (isPlaying) {
      stopMetronome()
      ee.emit('pause')
      setIsPlaying(false)
    } else {
      ee.emit('play')
      setIsPlaying(true)
      if (audioProjectRef.current.metronomeEnabled && audioProjectRef.current.metronomeDuringPlayback) {
        startContinuousMetronome()
      }
    }
  }

  function armTrack(trackId) {
    const tracks = (audioProject.tracks || []).map(function(t) {
      return Object.assign({}, t, { armed: t.id === trackId })
    })
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
  }

  function selectTake(trackId, takeId) {
    const tracks = audioProject.tracks.map(function(t) {
      if (t.id !== trackId) return t
      return setActiveTakeOnTrack(t, takeId)
    })
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
    setReloadKey(function(n) { return n + 1 })
  }

  function addTrack(track) {
    const ap = audioProjectRef.current
    const tracks = (ap.tracks || []).concat([Object.assign({}, track, { armed: true })])
    const next = Object.assign({}, ap, {
      tracks: tracks.map(function(t) {
        return Object.assign({}, t, { armed: t.id === track.id })
      }),
    })
    persistProject(next, {}, true)
    setReloadKey(function(n) { return n + 1 })
  }

  function trackNameFromImportFile(file) {
    const name = String(file && file.name || '').trim()
    if (!name) return 'Imported'
    const dot = name.lastIndexOf('.')
    if (dot > 0) return name.slice(0, dot)
    return name
  }

  async function importAudioFileAsTrack(file) {
    if (!file || !file.size) return
    const newTrack = createDefaultAudioTrack(item.id, trackNameFromImportFile(file))
    const take = newTrack.takes[0]
    await putScratchpadBlob(take.blobKey, file)
    take.recordedAt = Date.now()
    addTrack(newTrack)
  }

  function addTrackAndRecord(track) {
    addTrack(track)
    pendingRecordAfterReloadRef.current = true
  }

  async function takeHasAudio(take) {
    if (!take || !take.blobKey) return false
    try {
      const blob = await getScratchpadBlob(take.blobKey)
      return !!(blob && blob.size > 0)
    } catch (e) {
      return false
    }
  }

  async function beginRecording() {
    const track = (audioProjectRef.current.tracks || []).find(function(t) { return t.armed })
    if (!track || track.type === 'midi') return
    const ee = eeRef.current
    const ac = audioContextRef.current
    if (!ee || !ac) return

    const ap = audioProjectRef.current
    const countInBars = ap.countInBars || 0
    const doRecord = async function() {
      const ready = await ensureRecorderReady()
      if (!ready) {
        setIsRecording(false)
        setAnalysisMessage('Microphone access required to record — check browser permissions or Audio settings.')
        return
      }
      if (ac.state === 'suspended') {
        try { await ac.resume() } catch (e) { /* ignore */ }
      }
      setIsRecording(true)
      if (ap.punchInEnabled && selectionRef.current) {
        const sel = selectionRef.current
        await new Promise(function(resolve) {
          ee.emit('play', Math.max(0, sel.start - 0.5))
          setTimeout(resolve, Math.max(0, (sel.start - getPlayheadTime()) * 1000))
        })
      }
      ee.emit('record')
      setIsPlaying(true)
    }

    if (countInBars > 0) {
      const rhythm = normalizeRhythmConfig(ap.rhythmConfig || createRhythmConfig(4))
      const countInBeats = countInBars * rhythm.beatsPerBar
      const countInSlots = slotsForBeatCount(rhythm, countInBeats)
      const afterCountIn = function() {
        if (ap.metronomeEnabled && ap.metronomeDuringRecording) {
          startContinuousMetronome()
        }
        doRecord()
      }
      const metro = new Metronome(ac, ap.tempo || 120, rhythm.beatsPerBar, countInSlots, afterCountIn, null, rhythm)
      metronomeRef.current = metro
      const startCountIn = function() { metro.start() }
      if (rhythm.engineMode === ENGINE_MODE_DRUMS) {
        primeDrumKit(ac).then(startCountIn).catch(startCountIn)
      } else {
        startCountIn()
      }
    } else {
      if (ap.metronomeEnabled && ap.metronomeDuringRecording) {
        startContinuousMetronome()
      }
      await doRecord()
    }
  }

  beginRecordingRef.current = beginRecording

  function handleNewTake(trackId) {
    const tracks = audioProject.tracks.map(function(t) {
      if (t.id !== trackId) return t
      return addTakeToTrack(t, item.id, null)
    })
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
    setReloadKey(function(n) { return n + 1 })
  }

  function handleAssignComp(trackId, takeId, sel) {
    if (!sel || sel.end <= sel.start) return
    const tracks = audioProject.tracks.map(function(t) {
      if (t.id !== trackId) return t
      return assignCompRegion(t, sel.start, sel.end, takeId)
    })
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
    setReloadKey(function(n) { return n + 1 })
  }

  function handleTakeLaneClick(trackId, takeId) {
    const sel = selectionRef.current
    if (sel && sel.end > sel.start) {
      handleAssignComp(trackId, takeId, sel)
      return
    }
    selectTake(trackId, takeId)
  }

  function updateTrack(trackId, patch) {
    const tracks = audioProject.tracks.map(function(t) {
      if (t.id !== trackId) return t
      return Object.assign({}, t, patch)
    })
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
    if (patch.laneHeight != null || patch.muted != null || patch.soloed != null || patch.compEnabled != null) {
      setReloadKey(function(n) { return n + 1 })
    }
  }

  function handleRenameTrack(track) {
    const name = window.prompt('Track name', track.name || 'Track')
    if (name === null) return
    updateTrack(track.id, { name: String(name).trim() || track.name })
  }

  function handleDuplicateTrack(trackId) {
    const source = getTrackById(audioProject, trackId)
    if (!source) return
    const copy = duplicateAudioTrack(item.id, source)
    const tracks = (audioProject.tracks || []).concat([copy])
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, true)
    setReloadKey(function(n) { return n + 1 })
  }

  function handleDeleteTrack(trackId) {
    if (!window.confirm('Delete this track?')) return
    const nextTracks = (audioProject.tracks || []).filter(function(t) { return t.id !== trackId })
    persistProject(Object.assign({}, audioProject, { tracks: nextTracks }), {}, false)
    setReloadKey(function(n) { return n + 1 })
  }

  function handleMoveTrackToFolder(trackId, folderId) {
    const tracks = audioProject.tracks.map(function(t) {
      if (t.id !== trackId) return t
      return moveTrackToFolder(t, folderId)
    })
    persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
  }

  function handleNewFolder(forTrackId) {
    const name = window.prompt('Folder name', 'Folder')
    if (name === null) return
    const folder = createTrackFolder(String(name).trim() || 'Folder')
    let tracks = audioProject.tracks || []
    if (forTrackId) {
      tracks = tracks.map(function(t) {
        if (t.id !== forTrackId) return t
        return moveTrackToFolder(t, folder.id)
      })
    }
    const trackFolders = (audioProject.trackFolders || []).concat([folder])
    persistProject(Object.assign({}, audioProject, { tracks: tracks, trackFolders: trackFolders }), {}, false)
  }

  function handleToggleFolderCollapse(folderId) {
    const trackFolders = toggleTrackFolderCollapsed(audioProject.trackFolders || [], folderId)
    persistProject(Object.assign({}, audioProject, { trackFolders: trackFolders }), {}, false)
    setReloadKey(function(n) { return n + 1 })
  }

  function handleRenameFolder(folder) {
    const name = window.prompt('Folder name', folder.name || 'Folder')
    if (name === null) return
    const trackFolders = renameTrackFolder(audioProject.trackFolders || [], folder.id, String(name).trim() || folder.name)
    persistProject(Object.assign({}, audioProject, { trackFolders: trackFolders }), {}, false)
  }

  function handleReorderTracks(fromIndex, toIndex) {
    const visible = advancedFeatures
      ? (audioProject.tracks || []).slice()
      : (audioProject.tracks || []).filter(function(t) { return t.type !== 'midi' })
    const reordered = reorderTracks(visible, fromIndex, toIndex)
    const hidden = advancedFeatures ? [] : (audioProject.tracks || []).filter(function(t) { return t.type === 'midi' })
    persistProject(Object.assign({}, audioProject, { tracks: reordered.concat(hidden) }), {}, false)
    setReloadKey(function(n) { return n + 1 })
  }

  function handleLaneHeightChange(trackId, height) {
    updateTrack(trackId, { laneHeight: height })
    setReloadKey(function(n) { return n + 1 })
  }

  useEffect(function() {
    const wrapEl = wrapRef.current
    if (!wrapEl) return undefined
    function onTakeLaneClick(e) {
      const wrapper = e.target.closest('.channel-wrapper')
      if (!wrapper || !playlistRef.current) return
      const playlist = playlistRef.current
      const lane = (playlist.tracks || []).find(function(t) {
        return t.laneRole === 'take' && t.customClass && wrapper.classList.contains(t.customClass)
      })
      if (lane && lane.trackId && lane.takeId) {
        handleTakeLaneClick(lane.trackId, lane.takeId)
      }
    }
    wrapEl.addEventListener('click', onTakeLaneClick)
    return function() { wrapEl.removeEventListener('click', onTakeLaneClick) }
  }, [reloadKey])

  async function handleRecord() {
    if (isRecordingRef.current) {
      stopMetronome()
      if (eeRef.current) eeRef.current.emit('stop')
      return
    }

    const track = (audioProjectRef.current.tracks || []).find(function(t) { return t.armed })
    if (!track || track.type === 'midi') return
    const ee = eeRef.current
    const ac = audioContextRef.current
    if (!ee || !ac) return

    const ap = audioProjectRef.current
    const take = getActiveTake(track)
    const hasAudio = await takeHasAudio(take)
    if (ap.recordMode === 'newTake' && hasAudio) {
      const tracks = ap.tracks.map(function(t) {
        if (t.id !== track.id) return t
        return addTakeToTrack(t, item.id, null)
      })
      persistProject(Object.assign({}, ap, { tracks: tracks }), {}, false)
      setReloadKey(function(n) { return n + 1 })
      await waitForPlaylistReload()
    }

    const ready = await ensureRecorderReady()
    if (!ready) {
      setAnalysisMessage('Microphone access required to record — check browser permissions or Audio settings.')
      return
    }

    await beginRecording()
  }

  async function handleApplyEffect(effectId, params) {
    const track = armedTrack || audioProject.tracks.find(function(t) { return t.type === 'audio' })
    if (!track) return
    const take = getActiveTake(track)
    if (!take || !take.blobKey) return
    await pushUndoSnapshot()
    const blob = await getScratchpadBlob(take.blobKey)
    const sel = selectionRef.current
    const next = await applyAudioEffectToBlob(blob, effectId, params, sel)
    lastEffectRef.current = { effectId: effectId, params: params }
    macroRecorderRef.current = recordMacroStep(macroRecorderRef.current, { effectId: effectId, params: params })
    await putScratchpadBlob(take.blobKey, next)
    markScratchpadUploadPending(item.id)
    setReloadKey(function(n) { return n + 1 })
    if (props.onChange) props.onChange()
  }

  async function handleSeparateStems() {
    const track = armedTrack || audioProject.tracks.find(function(t) { return t.type === 'audio' && !t.stemSource })
    if (!track) return
    setStemBusy(true)
    try {
      const result = await separateScratchpadStems({
        item: { id: item.id, audio: audioProject },
        trackId: track.id,
        accessToken: props.token && props.token.access_token,
      })
      persistProject(result.audio, {}, true)
      setReloadKey(function(n) { return n + 1 })
    } catch (e) {
      window.alert(e.message || 'Stem separation failed')
    } finally {
      setStemBusy(false)
    }
  }

  async function mixAndSave() {
    setShowExportModal(true)
  }

  async function downloadMixdown() {
    setShowExportModal(true)
  }

  async function handleUndo() {
    if (!undoStackRef.current.length) return
    const current = await snapshotProject(item, getScratchpadBlob, putScratchpadBlob)
    redoStackRef.current = redoStackRef.current.concat([current])
    const snap = undoStackRef.current[undoStackRef.current.length - 1]
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    const audio = await restoreProjectSnapshot(snap, putScratchpadBlob)
    persistProject(audio, {}, true)
    syncUndoRedoState()
    setReloadKey(function(n) { return n + 1 })
  }

  async function handleRedo() {
    if (!redoStackRef.current.length) return
    const current = await snapshotProject(item, getScratchpadBlob, putScratchpadBlob)
    undoStackRef.current = undoStackRef.current.concat([current])
    const snap = redoStackRef.current[redoStackRef.current.length - 1]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    const audio = await restoreProjectSnapshot(snap, putScratchpadBlob)
    persistProject(audio, {}, true)
    syncUndoRedoState()
    setReloadKey(function(n) { return n + 1 })
  }

  function saveMarkers(next) {
    const normalized = next.map(function(marker) { return normalizeMarker(marker, duration) })
    setMarkers(normalized)
    persistProject(audioProject, { markers: normalized }, false)
  }

  function handleAddMarker() {
    const time = roundMarkerTime(Math.min(getPlayheadTime(), duration || Infinity))
    const next = markers.concat([{ time: time, label: 'Marker ' + (markers.length + 1) }])
    saveMarkers(next)
    setEditingMarkerIndex(next.length - 1)
  }

  async function handleAutoTrim() {
    if (!trimSuggestion) return
    setTrimming(true)
    try {
      const track = audioProject.tracks[0]
      const take = getActiveTake(track)
      if (!take) return
      const blob = await getScratchpadBlob(take.blobKey)
      const trimmed = await trimAudioBlob(blob, trimSuggestion.start, trimSuggestion.end)
      await putScratchpadBlob(take.blobKey, trimmed)
      setReloadKey(function(n) { return n + 1 })
      persistProject(audioProject, { trimSuggestion: null }, false)
      setTrimSuggestion(null)
    } finally {
      setTrimming(false)
    }
  }

  const midiTrack = midiEditTrackId ? getTrackById(audioProject, midiEditTrackId) : null
  const editingMarker = editingMarkerIndex != null ? markers[editingMarkerIndex] : null
  const loopRegion = getLoopRegion(markers, audioProject.loopRegion || (item.audio && item.audio.loopRegion))
  const hasSelection = !!(selection && selection.end > selection.start)
  const narrowLayout = layoutTier === 'narrow'

  const shortcutHandlers = useMemo(function() {
    return {
      playStop: function() { togglePlayPause() },
      undo: function() { handleUndo() },
      redo: function() { handleRedo() },
      cut: function() { handleCut() },
      copy: function() { handleCopy() },
      paste: function() { handlePaste() },
      delete: function() { handleDelete() },
      deleteKey: function() { handleDelete() },
      deleteBackspace: function() { handleDelete() },
      silence: function() { handleSilence() },
      trim: function() { handleTrimToSelection() },
      split: function() { handleSplit() },
      selectAll: function() {
        if (eeRef.current) eeRef.current.emit('select', 0, duration)
      },
      selectNone: function() {
        selectionRef.current = null
        setSelection(null)
        if (eeRef.current) eeRef.current.emit('select', 0, 0)
      },
      zoomIn: function() { eeRef.current && eeRef.current.emit('zoomin') },
      zoomOut: function() { eeRef.current && eeRef.current.emit('zoomout') },
      record: function() { handleRecord() },
      loopToggle: function() { handleLoopRepeatChange(!loopRepeat) },
      loopSetSelection: function() { handleSetLoopFromSelection() },
      addMarker: function() { handleAddMarker() },
      addMarkerPlayhead: function() { handleAddMarker() },
      export: function() { setShowExportModal(true) },
      preferences: function() { setShowSettingsModal(true) },
      toolSelect: function() { setEditMode('select') },
      seekHome: function() { eeRef.current && eeRef.current.emit('seek', 0) },
      seekEnd: function() { eeRef.current && eeRef.current.emit('seek', duration) },
      selLeftBracket: function() {
        if (selectionRef.current) eeRef.current && eeRef.current.emit('seek', selectionRef.current.start)
      },
      selRightBracket: function() {
        if (selectionRef.current) eeRef.current && eeRef.current.emit('seek', selectionRef.current.end)
      },
    }
  }, [duration, loopRepeat, hasContent])

  useScratchpadAudioShortcuts(editorRootRef, shortcutHandlers, true)

  return (
    <div ref={editorRootRef} className={'scratchpad-audio-editor scratchpad-audio-daw scratchpad-audio-daw--' + layoutTier}>
      <ScratchpadEditorChrome
        item={item}
        tunebook={props.tunebook}
        tunes={props.tunes}
        token={props.token}
        login={props.login}
        onChange={props.onChange}
        onDeleted={props.onDeleted}
        onBack={props.onBack}
        onUndo={hasContent ? handleUndo : undefined}
        onRedo={hasContent ? handleRedo : undefined}
        canUndo={canUndo}
        canRedo={canRedo}
      >
        <ScratchpadAudioMenuBar
          icons={icons}
          ee={eeRef.current}
          editMode={editMode}
          hasContent={hasContent}
          hasSelection={hasSelection}
          canPaste={clipboardHasData}
          stemBusy={stemBusy}
          canSeparate={canSeparateStems}
          trimSuggestion={trimSuggestion}
          trimming={trimming}
          isSaving={isSaving}
          spectrogramVisible={spectrogramVisible}
          advancedFeatures={advancedFeatures}
          selectionBarCompact={narrowLayout && !selectionBarExpanded}
          onEditModeChange={setEditMode}
          onTrim={handleTrimToSelection}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onSilence={handleSilence}
          onReverse={handleReverse}
          onInvert={handleInvert}
          onSplit={handleSplit}
          onAlignStart={function() { alignTracks('start') }}
          onAlignEnd={function() { alignTracks('end') }}
          onAlignTogether={function() { alignTracks('together') }}
          onInsertAudio={function() { setShowInsertModal(true) }}
          onAddMarker={handleAddMarker}
          onApplyEffect={handleApplyEffect}
          onSeparateStems={handleSeparateStems}
          onAutoTrim={handleAutoTrim}
          onAnalyze={handleAnalyze}
          onGenerate={handleGenerate}
          onMix={mixAndSave}
          onOpenExport={function() { setShowExportModal(true) }}
          onToggleSpectrogram={function() { setSpectrogramVisible(function(v) { return !v }) }}
          onZoomToSelection={handleZoomToSelection}
          onExpandSelectionBar={function() { setSelectionBarExpanded(true) }}
          onAdvancedFeaturesChange={setAdvancedFeaturesEnabled}
          macroSteps={(macroRecorderRef.current && macroRecorderRef.current.steps.length) || 0}
          onRunMacro={function() {
            runMacro(macroRecorderRef.current, function(step) {
              return handleApplyEffect(step.effectId, step.params)
            })
          }}
          onRealtimeFx={function() {
            setAnalysisMessage('Realtime FX preview is not available in the browser editor yet.')
          }}
        />
      </ScratchpadEditorChrome>

      {analysisMessage ? (
        <div className="scratchpad-audio-analysis-banner small px-3 py-1 text-muted">{analysisMessage}</div>
      ) : micError ? (
        <div className="scratchpad-audio-analysis-banner small px-3 py-1 text-muted">
          Microphone access required to record — check browser permissions or Audio settings.
        </div>
      ) : null}

      <ScratchpadAudioSelectionBar
        selection={selection}
        duration={duration}
        playhead={currentTime}
        loopRepeat={loopRepeat}
        compact={narrowLayout && !selectionBarExpanded}
        onExpand={function() { setSelectionBarExpanded(true) }}
        onLoopRepeatChange={handleLoopRepeatChange}
        onSetLoopFromSelection={hasSelection ? handleSetLoopFromSelection : null}
        onSelectionChange={function(sel) {
          selectionRef.current = sel
          setSelection(sel)
          if (eeRef.current) eeRef.current.emit('select', sel.start, sel.end)
        }}
        onSeek={function(t) { eeRef.current && eeRef.current.emit('seek', t) }}
      />

      <div className="scratchpad-audio-daw-main">
      <div className="scratchpad-daw-layout d-flex">
        {narrowLayout ? (
          <div className="scratchpad-track-drawer-toggle p-2 border-end">
            <Button size="sm" variant="outline-secondary" onClick={function() { setTrackDrawerOpen(function(v) { return !v }) }}>
              Tracks
            </Button>
          </div>
        ) : null}
        <aside className={'scratchpad-track-sidebar scratchpad-track-sidebar--panel border-end' + (narrowLayout ? ' scratchpad-track-sidebar--drawer' + (trackDrawerOpen ? ' scratchpad-track-sidebar--open' : '') : '')}>
          <ScratchpadTrackPanel
            panelScrollRef={panelScrollRef}
            tracks={audioProject.tracks || []}
            trackFolders={audioProject.trackFolders || []}
            itemId={item.id}
            ee={eeRef.current}
            icons={icons}
            advancedFeatures={advancedFeatures}
            onAddTrack={addTrack}
            onAddTrackAndRecord={addTrackAndRecord}
            onImportFile={importAudioFileAsTrack}
            onArm={armTrack}
            onRename={handleRenameTrack}
            onDuplicate={handleDuplicateTrack}
            onDelete={handleDeleteTrack}
            onCompToggle={function(trackId, enabled) {
              updateTrack(trackId, { compEnabled: enabled })
            }}
            onMuteToggle={function(trackId, muted) {
              updateTrack(trackId, { muted: muted })
            }}
            onSoloToggle={function(trackId, soloed) {
              updateTrack(trackId, { soloed: soloed })
            }}
            onMoveToFolder={handleMoveTrackToFolder}
            onNewFolder={handleNewFolder}
            onToggleFolderCollapse={handleToggleFolderCollapse}
            onRenameFolder={handleRenameFolder}
            onReorder={handleReorderTracks}
            onLaneHeightChange={handleLaneHeightChange}
            onSelectTake={selectTake}
            onEditMidi={setMidiEditTrackId}
          />
        </aside>
        <div className="flex-grow-1 scratchpad-audio-waveform-column">
          <ScratchpadAudioSpectrogramLayer
            visible={spectrogramVisible}
            itemId={item.id}
            track={getTargetTrack()}
            selection={selection}
          />
          <ScratchpadAudioRegionBar
            editorRef={editorRef}
            wrapRef={wrapRef}
            markers={markers}
            duration={duration}
            selection={selection}
            reloadKey={reloadKey}
            onLayoutRefresh={function(fn) { regionRefreshRef.current = fn }}
            onSelectionChange={function(sel) {
              selectionRef.current = sel
              setSelection(sel)
              if (eeRef.current) eeRef.current.emit('select', sel.start, sel.end)
            }}
            onMarkerClick={function(index) {
              eeRef.current && eeRef.current.emit('seek', markers[index].time)
              setEditingMarkerIndex(index)
            }}
            onMarkerDrag={function(index, time) {
              const clamped = clampMarkerTimeContinuous(time, duration)
              setMarkers(markers.map(function(m, i) {
                return i === index ? Object.assign({}, m, { time: clamped }) : m
              }))
            }}
            onMarkerDragEnd={function(index, time, moved) {
              if (!moved) return
              const clamped = clampMarkerTimeContinuous(time, duration)
              saveMarkers(markers.map(function(m, i) {
                return i === index ? normalizeMarker(Object.assign({}, m, { time: clamped }), duration) : m
              }))
            }}
          />
          <div className="scratchpad-audio-waveform-wrap" ref={wrapRef}>
            <div className="scratchpad-audio-waveform" ref={editorRef} />
            <ScratchpadCompRegionOverlay
              editorRef={editorRef}
              wrapRef={wrapRef}
              tracks={audioProject.tracks || []}
              duration={duration}
              reloadKey={reloadKey}
              onLayoutRefresh={function(fn) { overlayRefreshRef.current = fn }}
            />
            <ScratchpadAudioFadeLayer
              editorRef={editorRef}
              wrapRef={wrapRef}
              tracks={audioProject.tracks || []}
              duration={duration}
              reloadKey={reloadKey}
              onFadeChange={handleFadeChange}
            />
          </div>
        </div>
      </div>

      <ScratchpadAudioTransportDock
        icons={icons}
        ee={eeRef.current}
        layoutTier={layoutTier}
        isPlaying={isPlaying}
        isRecording={isRecording}
        armedTrackId={armedTrack && armedTrack.id}
        currentTime={currentTime}
        duration={duration}
        formatTime={formatMarkerTime}
        inputAnalyser={inputAnalyser}
        tempo={audioProject.tempo || 120}
        countInBars={audioProject.countInBars || 0}
        rhythmConfig={audioProject.rhythmConfig}
        punchInEnabled={audioProject.punchInEnabled}
        recordMode={audioProject.recordMode}
        metronomeEnabled={!!audioProject.metronomeEnabled}
        metronomeDuringPlayback={!!audioProject.metronomeDuringPlayback}
        metronomeDuringRecording={!!audioProject.metronomeDuringRecording}
        onPlayPause={togglePlayPause}
        onStop={function() {
          stopMetronome()
          if (eeRef.current) eeRef.current.emit('stop')
          setIsPlaying(false)
        }}
        onRecord={handleRecord}
        onMetronomeEnabledChange={function(v) { persistProject(audioProject, { metronomeEnabled: v }, false) }}
        onMetronomeDuringPlaybackChange={function(v) { persistProject(audioProject, { metronomeDuringPlayback: v }, false) }}
        onMetronomeDuringRecordingChange={function(v) { persistProject(audioProject, { metronomeDuringRecording: v }, false) }}
        onTempoChange={function(v) { persistProject(audioProject, { tempo: v }, false) }}
        onCountInChange={function(v) { persistProject(audioProject, { countInBars: v }, false) }}
        onRhythmConfigChange={function(v) { persistProject(audioProject, { rhythmConfig: v }, false) }}
        onPunchInChange={function(v) { persistProject(audioProject, { punchInEnabled: v }, false) }}
        onRecordModeChange={function(v) { persistProject(audioProject, { recordMode: v }, false) }}
        onOpenSettings={function() { setShowSettingsModal(true) }}
        onOpenRecordSettings={function() { setShowSettingsModal(true) }}
        snapToGrid={audioProject.snapToGrid}
        onSnapChange={function(v) { persistProject(audioProject, { snapToGrid: v, snapInterval: audioProject.snapInterval || 0.25 }, false) }}
        advancedFeatures={advancedFeatures}
      />
      </div>

      <ScratchpadAudioInsertModal
        show={showInsertModal}
        item={item}
        tunes={props.tunes}
        tunebook={props.tunebook}
        token={props.token}
        onHide={function() { setShowInsertModal(false) }}
        onInsert={handleInsertAudio}
      />

      <ScratchpadAudioExportModal
        show={showExportModal}
        busy={isSaving}
        hasSelection={hasSelection}
        defaultTitle={item.title || 'export'}
        defaultMetadata={audioProject.metadata}
        onHide={function() { setShowExportModal(false) }}
        onExport={function(opts) {
          runExport(Object.assign({}, opts, { action: opts.scope === 'project' ? 'mix' : 'download' }))
        }}
      />

      <ScratchpadAudioSettingsModal
        show={showSettingsModal}
        inputDeviceId={audioProject.inputDeviceId}
        outputDeviceId={audioProject.outputDeviceId}
        analyserNode={inputAnalyser}
        onHide={function() { setShowSettingsModal(false) }}
        onRescan={function() {
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices()
          }
        }}
        onSave={function(patch) {
          persistProject(audioProject, patch, false)
          initRecorderWithDevice(patch.inputDeviceId).catch(function() {})
        }}
      />

      <ScratchpadMidiLaneEditor
        show={!!midiEditTrackId && advancedFeatures}
        track={midiTrack}
        tempo={audioProject.tempo}
        duration={duration}
        currentTime={currentTime}
        onHide={function() { setMidiEditTrackId(null) }}
        onSave={function(events) {
          const tracks = audioProject.tracks.map(function(t) {
            if (t.id !== midiEditTrackId) return t
            const takes = t.takes.map(function(take) {
              if (take.id !== t.activeTakeId) return take
              return Object.assign({}, take, { events: events })
            })
            return Object.assign({}, t, { takes: takes })
          })
          persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, true)
          setMidiEditTrackId(null)
        }}
      />

      <MarkerEditModal
        show={editingMarkerIndex != null}
        marker={editingMarker}
        duration={duration}
        onHide={function() { setEditingMarkerIndex(null) }}
        onSave={function(patch) {
          if (editingMarkerIndex == null) return
          let next = markers.map(function(m, i) {
            if (i !== editingMarkerIndex) return m
            const merged = Object.assign({}, m, patch)
            if (!patch.loopRole) delete merged.loopRole
            return merged
          })
          if (patch.loopRole === 'start' || patch.loopRole === 'end') {
            next = setMarkerLoopRole(next, editingMarkerIndex, patch.loopRole)
          }
          saveMarkers(next)
          setEditingMarkerIndex(null)
        }}
        onDelete={function() {
          if (editingMarkerIndex == null) return
          saveMarkers(markers.filter(function(_, i) { return i !== editingMarkerIndex }))
          setEditingMarkerIndex(null)
        }}
      />
    </div>
  )
}
