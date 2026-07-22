import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, ButtonGroup, Form, Modal } from 'react-bootstrap'
import WaveformPlaylist from 'waveform-playlist'
import ensureWaveformPlayoutDisconnectGuard from '../../waveformPlaylistPlayoutPatch'
import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import ScratchpadAudioTransport from './ScratchpadAudioTransport'
import ScratchpadNewTrackDialog from './ScratchpadNewTrackDialog'
import ScratchpadAudioEditModes from './ScratchpadAudioEditModes'
import ScratchpadAudioEffectsPanel from './ScratchpadAudioEffectsPanel'
import { ScratchpadTrackList } from './ScratchpadTakeLaneStack'
import ScratchpadMidiLaneEditor from './ScratchpadMidiLaneEditor'
import ScratchpadStemActions from './ScratchpadStemActions'
import { getScratchpadBlob, putScratchpadBlob, scratchpadMixdownBlobKey } from '../../scratchpadBlobs'
import { updateScratchpadItem, markScratchpadUploadPending } from '../../scratchpadStore'
import Metronome from '../../Metronome'
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
} from '../../scratchpadAudioMarkers'
import ScratchpadAudioMarkerLayer, {
  normalizeMarker,
  setMarkerLoopRole,
} from './ScratchpadAudioMarkerLayer'
import {
  normalizeAudioProject,
  loadProjectTracks,
  getProjectDuration,
  getActiveTake,
  getTrackById,
  addTakeToTrack,
  setActiveTakeOnTrack,
  assignCompRegion,
  snapshotProject,
  restoreProjectSnapshot,
  MAX_PROJECT_UNDO,
} from '../../scratchpadAudioProject'
import { applyAudioEffectToBlob } from '../../scratchpadAudioEffects'
import { separateScratchpadStems } from '../../scratchpadStemSeparation'

const WAVEFORM_ZOOM_LEVELS = [50, 75, 100, 250, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12500, 15000, 20000, 30000, 40000, 50000]

ensureWaveformPlayoutDisconnectGuard()

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
          <Form.Group className="mb-0">
            <Form.Label>Time (seconds)</Form.Label>
            <Form.Control type="number" min="0" step="0.1" value={time} onChange={function(e) { setTime(e.target.value) }} />
          </Form.Group>
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
  const editorRef = useRef(null)
  const wrapRef = useRef(null)
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
  const audioProjectRef = useRef(normalizeAudioProject(item))

  const [audioProject, setAudioProject] = useState(function() { return normalizeAudioProject(item) })
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

  audioProjectRef.current = audioProject

  useEffect(function() { loopRepeatRef.current = loopRepeat }, [loopRepeat])
  useEffect(function() {
    loopRegionRef.current = getLoopRegion(markers, item.audio && item.audio.loopRegion)
  }, [markers, item.audio && item.audio.loopRegion])

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

  function persistProject(nextAudio, extraPatch, notifyParent) {
    const merged = Object.assign({}, nextAudio, extraPatch || {})
    setAudioProject(merged)
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

  const armedTrack = (audioProject.tracks || []).find(function(t) { return t.armed })

  useEffect(function() {
    let cancelled = false
    getProjectDuration(audioProject).then(function(d) {
      if (!cancelled) setDuration(d)
    })
    loadProjectTracks({ id: item.id, audio: audioProject }).then(function(specs) {
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
        show: true,
        width: 150,
        widgets: { muteOrSolo: true, volume: true, stereoPan: true, collapse: true, remove: true },
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
    ee.on('removeTrack', schedulePersistArrangement)
    ee.on('shift', schedulePersistArrangement)
    ee.on('mute', schedulePersistArrangement)
    ee.on('solo', schedulePersistArrangement)
    ee.on('volumechange', schedulePersistArrangement)
    ee.on('stereopan', schedulePersistArrangement)

    ee.on('audiorenderingfinished', async function(type, data) {
      setIsSaving(false)
      if (type === 'audio/wav' || type === 'wav') {
        const mixKey = scratchpadMixdownBlobKey(item.id)
        await putScratchpadBlob(mixKey, data)
        persistProject(audioProjectRef.current, { mixdownBlobKey: mixKey }, true)
      }
    })

    loadProjectTracks({ id: item.id, audio: audioProjectRef.current }).then(async function(specs) {
      if (cancelled) return
      if (specs.length) {
        await playlist.load(specs)
        setHasContent(true)
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
    })

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        if (!cancelled) playlist.initRecorder(stream)
      }).catch(function() {})
    }

    return function() {
      cancelled = true
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
  }, [item.id, reloadKey])

  function getPlayheadTime() {
    const playlist = playlistRef.current
    if (playlist && typeof playlist.getCurrentTime === 'function') {
      const t = playlist.getCurrentTime()
      if (Number.isFinite(t)) return Math.max(0, t)
    }
    return Math.max(0, currentTime)
  }

  function togglePlayPause() {
    const ee = eeRef.current
    if (!ee) return
    if (isPlaying) {
      ee.emit('pause')
      setIsPlaying(false)
    } else {
      ee.emit('play')
      setIsPlaying(true)
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
    const tracks = (audioProject.tracks || []).concat([Object.assign({}, track, { armed: true })])
    const next = Object.assign({}, audioProject, {
      tracks: tracks.map(function(t) {
        return Object.assign({}, t, { armed: t.id === track.id })
      }),
    })
    persistProject(next, {}, true)
    setReloadKey(function(n) { return n + 1 })
  }

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
  }

  async function handleRecord() {
    const track = armedTrack
    if (!track || track.type === 'midi') return
    const ee = eeRef.current
    const ac = audioContextRef.current
    if (!ee || !ac) return

    const countInBars = audioProject.countInBars || 0
    const doRecord = async function() {
      setIsRecording(true)
      if (audioProject.punchInEnabled && selectionRef.current) {
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
      const metro = new Metronome(ac, audioProject.tempo || 120, 4, countInBars * 4)
      metronomeRef.current = metro
      metro.start()
      setTimeout(function() {
        metro.stop()
        doRecord()
      }, countInBars * 4 * (60 / (audioProject.tempo || 120)) * 1000)
    } else {
      await doRecord()
    }
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
    const ee = eeRef.current
    if (!ee) return
    setIsSaving(true)
    ee.emit('startaudiorendering', 'wav')
  }

  async function downloadMixdown(fmt) {
    const ee = eeRef.current
    if (!ee) return
    return new Promise(function(resolve) {
      const handler = async function(type, data) {
        ee.off('audiorenderingfinished', handler)
        let blob = data
        if (fmt === 'mp3' && blob) {
          const converter = new MP3Converter()
          blob = await new Promise(function(res) {
            converter.convert(blob, { bitRate: 128 }, res)
          })
        }
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (item.title || 'mixdown') + (fmt === 'mp3' ? '.mp3' : '.wav')
          a.click()
          URL.revokeObjectURL(url)
        }
        resolve()
      }
      ee.on('audiorenderingfinished', handler)
      ee.emit('startaudiorendering', 'wav')
    })
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

  const midiTrack = midiEditTrackId ? getTrackById(audioProject, midiEditTrackId) : null
  const editingMarker = editingMarkerIndex != null ? markers[editingMarkerIndex] : null
  const loopRegion = getLoopRegion(markers, item.audio && item.audio.loopRegion)

  return (
    <div className="scratchpad-audio-editor scratchpad-audio-daw">
      <ScratchpadEditorChrome
        item={item}
        tunebook={props.tunebook}
        tunes={props.tunes}
        token={props.token}
        onChange={props.onChange}
        onDeleted={props.onDeleted}
        onBack={props.onBack}
        onUndo={hasContent ? handleUndo : undefined}
        onRedo={hasContent ? handleRedo : undefined}
        canUndo={canUndo}
        canRedo={canRedo}
      >
        <div className="scratchpad-audio-toolbar-groups d-flex flex-wrap align-items-center gap-2">
          <ScratchpadNewTrackDialog
            itemId={item.id}
            trackCount={(audioProject.tracks || []).length}
            ee={eeRef.current}
            icons={icons}
            onAddTrack={addTrack}
            onImport={schedulePersistArrangement}
          />
          <ScratchpadAudioTransport
            icons={icons}
            ee={eeRef.current}
            isPlaying={isPlaying}
            isRecording={isRecording}
            tempo={audioProject.tempo || 120}
            countInBars={audioProject.countInBars || 0}
            punchInEnabled={audioProject.punchInEnabled}
            recordMode={audioProject.recordMode}
            armedTrackId={armedTrack && armedTrack.id}
            currentTime={currentTime}
            duration={duration}
            formatTime={formatMarkerTime}
            onPlayPause={togglePlayPause}
            onStop={function() { setIsPlaying(false); setIsRecording(false) }}
            onRecord={handleRecord}
            onTempoChange={function(v) { persistProject(audioProject, { tempo: v }, false) }}
            onCountInChange={function(v) { persistProject(audioProject, { countInBars: v }, false) }}
            onPunchInChange={function(v) { persistProject(audioProject, { punchInEnabled: v }, false) }}
            onRecordModeChange={function(v) { persistProject(audioProject, { recordMode: v }, false) }}
          />
          <ScratchpadAudioEditModes
            icons={icons}
            mode={editMode}
            ee={eeRef.current}
            onModeChange={setEditMode}
            onTrim={schedulePersistArrangement}
          />
          <ScratchpadAudioEffectsPanel canApply={hasContent} onApply={handleApplyEffect} />
          <ScratchpadStemActions
            busy={stemBusy}
            canSeparate={hasContent}
            onSeparate={handleSeparateStems}
          />
          <ButtonGroup size="sm">
            <Button
              variant="outline-primary"
              title="Add marker at playhead"
              onClick={function() {
                const time = roundMarkerTime(Math.min(getPlayheadTime(), duration || Infinity))
                const next = markers.concat([{ time: time, label: 'Marker ' + (markers.length + 1) }])
                saveMarkers(next)
                setEditingMarkerIndex(next.length - 1)
              }}
            >
              {icons.add || icons.plus || '+'} Marker
            </Button>
          </ButtonGroup>
          <ButtonGroup size="sm">
            <Button variant="success" disabled={isSaving} onClick={mixAndSave}>
              Mix {isSaving ? '…' : ''}
            </Button>
            <Button variant="outline-secondary" onClick={function() { downloadMixdown('wav') }}>WAV</Button>
            <Button variant="outline-secondary" onClick={function() { downloadMixdown('mp3') }}>MP3</Button>
          </ButtonGroup>
          {trimSuggestion ? (
            <Button size="sm" variant="warning" disabled={trimming} onClick={async function() {
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
            }}>
              Auto-trim
            </Button>
          ) : null}
        </div>
      </ScratchpadEditorChrome>

      <div className="scratchpad-daw-layout d-flex">
        <aside className="scratchpad-track-sidebar p-2 border-end" style={{ minWidth: '200px', maxWidth: '240px' }}>
          <ScratchpadTrackList
            tracks={audioProject.tracks || []}
            selection={selection}
            onArm={armTrack}
            onSelectTake={selectTake}
            onNewTake={handleNewTake}
            onCompToggle={function(trackId, enabled) {
              const tracks = audioProject.tracks.map(function(t) {
                if (t.id !== trackId) return t
                return Object.assign({}, t, { compEnabled: enabled })
              })
              persistProject(Object.assign({}, audioProject, { tracks: tracks }), {}, false)
            }}
            onAssignComp={handleAssignComp}
            onEditMidi={setMidiEditTrackId}
          />
        </aside>
        <div className="flex-grow-1">
          <div className="scratchpad-audio-waveform-wrap" ref={wrapRef}>
            <div className="scratchpad-audio-marker-rail" aria-hidden="true" />
            <div className="scratchpad-audio-waveform" ref={editorRef} />
            <ScratchpadAudioMarkerLayer
              editorRef={editorRef}
              wrapRef={wrapRef}
              markers={markers}
              duration={duration}
              reloadKey={reloadKey}
              onMarkerClick={function(index) {
                eeRef.current && eeRef.current.emit('seek', markers[index].time)
                setEditingMarkerIndex(index)
              }}
              onMarkerDrag={function(index, time) {
                setMarkers(markers.map(function(m, i) {
                  return i === index ? Object.assign({}, m, { time: roundMarkerTime(time) }) : m
                }))
              }}
              onMarkerDragEnd={function(index, time, moved) {
                if (!moved) return
                saveMarkers(markers.map(function(m, i) {
                  return i === index ? normalizeMarker(Object.assign({}, m, { time: time }), duration) : m
                }))
              }}
            />
          </div>
        </div>
      </div>

      <ScratchpadMidiLaneEditor
        show={!!midiEditTrackId}
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
