import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, ProgressBar } from 'react-bootstrap'
import {
  AUDIO_ANALYSIS_INSTRUMENTS,
  TUNER_INSTRUMENT_LABELS,
  normalizeAudioAnalysisInstrument,
  presetsForInstrument,
  defaultPresetForInstrument
} from '../instrumentTuningPresets'
import {
  SEQUENCE_PRESET_OPTIONS,
  defaultSequencePresetId,
  expandSequencePreset
} from '../audioAnalysisSequences'
import { listGroups, saveGroup, saveSet, saveNoteAudioBlob } from '../soundpostSetStore'
import { captureGatedNote, playReferenceTone } from '../audioAnalysisCapture'
import { captureTapImpulse, TAP_TARGET_COUNT, averageTapPeaks, labelLikelyModes } from '../audioAnalysisTapCapture'
import { midiToFrequency, noteNameToMidi, simpleNoteLabel } from '../tunerTuningUtils'
import { listAudioInputDevices } from '../tunerlib/app'
import VoiceFillInput from './VoiceFillInput'

const UNGROUPED = ''

export default function AudioAnalysisWizard(props) {
  const fromProps = normalizeAudioAnalysisInstrument(props.instrument)
  const initialInstrument = fromProps && AUDIO_ANALYSIS_INSTRUMENTS.indexOf(fromProps) >= 0
    ? fromProps
    : 'violin'
  const [step, setStep] = useState('form')
  const [measurementMode, setMeasurementMode] = useState('bowed') // bowed | tap
  const [label, setLabel] = useState('')
  const [groupId, setGroupId] = useState(UNGROUPED)
  const [newGroupName, setNewGroupName] = useState('')
  const [groups, setGroups] = useState([])
  const [instrument, setInstrument] = useState(initialInstrument)
  const [tuningPresetId, setTuningPresetId] = useState(
    props.tuningPresetId || (defaultPresetForInstrument(initialInstrument) || {}).id
  )
  const [sequencePresetId, setSequencePresetId] = useState(defaultSequencePresetId(initialInstrument))
  const [a4] = useState(440)
  const [noteIndex, setNoteIndex] = useState(0)
  const [progress, setProgress] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)
  const [capturedNotes, setCapturedNotes] = useState([])
  const [captureToken, setCaptureToken] = useState(0)
  const [inputDevices, setInputDevices] = useState([])
  const [inputDeviceId, setInputDeviceId] = useState('')
  const [stereoTap, setStereoTap] = useState(false)
  const abortRef = useRef(null)
  const notesRef = useRef([])
  const stereoTapRef = useRef(false)
  const inputDeviceIdRef = useRef('')

  const sequence = useMemo(function() {
    if (measurementMode === 'tap') {
      const taps = []
      for (let i = 0; i < TAP_TARGET_COUNT; i++) {
        taps.push({ targetNote: 'Tap ' + (i + 1), stringIndex: null })
      }
      return taps
    }
    return expandSequencePreset(sequencePresetId, instrument, tuningPresetId)
  }, [measurementMode, sequencePresetId, instrument, tuningPresetId])

  useEffect(function() {
    listGroups().then(setGroups)
  }, [])

  useEffect(function() {
    stereoTapRef.current = stereoTap
  }, [stereoTap])

  useEffect(function() {
    inputDeviceIdRef.current = inputDeviceId
  }, [inputDeviceId])

  useEffect(function() {
    if (measurementMode !== 'tap') return
    let cancelled = false
    async function loadDevices() {
      try {
        // Permission unlocks device labels in most browsers
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(function(t) { t.stop() })
      } catch (e) { /* labels may stay blank */ }
      if (cancelled) return
      try {
        const devices = await listAudioInputDevices()
        if (!cancelled) setInputDevices(devices)
      } catch (e) {
        if (!cancelled) setInputDevices([])
      }
    }
    loadDevices()
    return function() { cancelled = true }
  }, [measurementMode])

  useEffect(function() {
    const p = defaultPresetForInstrument(instrument)
    if (p) setTuningPresetId(p.id)
    setSequencePresetId(defaultSequencePresetId(instrument))
  }, [instrument])

  const presetOptions = presetsForInstrument(instrument)

  async function resolveGroupId() {
    if (newGroupName.trim()) {
      const g = await saveGroup({ label: newGroupName.trim() })
      return g.id
    }
    return groupId || null
  }

  async function finishSetWithNotes(notes) {
    setStatus('Saving set…')
    try {
      const gid = await resolveGroupId()
      const payload = {
        label: label.trim(),
        groupId: gid,
        instrument: instrument,
        tuningPresetId: tuningPresetId,
        a4: a4,
        measurementMode: measurementMode,
        sequencePresetId: measurementMode === 'tap' ? 'tapImpulse' : sequencePresetId,
        notes: notes,
        needsSync: true
      }
      if (measurementMode === 'tap') {
        payload.tapPeaks = labelLikelyModes(averageTapPeaks(notes))
        const hasR = notes.some(function(n) { return n.channelCount === 2 && n.featuresR })
        if (hasR) {
          payload.tapPeaksR = labelLikelyModes(averageTapPeaks(notes, 15, 'featuresR'))
          payload.channelCount = 2
        }
      }
      const saved = await saveSet(payload)
      setStep('done')
      setStatus('Saved "' + saved.label + '" with ' + (saved.notes || []).length +
        (measurementMode === 'tap' ? ' taps.' : ' notes.'))
      if (props.onComplete) props.onComplete(saved)
    } catch (err) {
      setError((err && err.message) || String(err))
    }
  }

  function startWizard(e) {
    e.preventDefault()
    if (!label.trim()) {
      setError('Please enter a label for this set.')
      return
    }
    if (!sequence.length) {
      setError('No notes in the selected sequence.')
      return
    }
    setError(null)
    notesRef.current = []
    setCapturedNotes([])
    setNoteIndex(0)
    setCaptureToken(function(t) { return t + 1 })
    setStep('capture')
    setStatus('Preparing…')
  }

  useEffect(function() {
    if (step !== 'capture') return
    if (noteIndex >= sequence.length) return

    let cancelled = false
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    abortRef.current = controller

    async function run() {
      const target = sequence[noteIndex]
      setProgress(null)
      setError(null)
      try {
        let result
        if (measurementMode === 'tap') {
          const stereo = stereoTapRef.current
          setStatus(
            'Tap ' + (noteIndex + 1) + ' / ' + sequence.length +
              (stereo
                ? ' — damp strings; L=mic, R=piezo; tap bridge top'
                : ' — damp strings, then tap bridge top')
          )
          result = await captureTapImpulse({
            signal: controller && controller.signal,
            stereo: stereo,
            deviceId: inputDeviceIdRef.current || undefined,
            onProgress: function(info) {
              setProgress(info)
              if (info && info.stereoFallback && noteIndex === 0) {
                setStatus('Stereo requested but only one channel available — recording mono.')
              }
            }
          })
        } else {
          const targetNote = simpleNoteLabel(target.targetNote)
          setStatus('Playing reference for ' + targetNote)
          const midi = noteNameToMidi(targetNote)
          const hz = midiToFrequency(midi, a4)
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          await playReferenceTone(ctx, hz, 700)
          try { await ctx.close() } catch (e) {}
          if (cancelled) return
          setStatus('Play and hold ' + targetNote + ' (in tune for 2 seconds)')
          result = await captureGatedNote({
            targetNote: targetNote,
            a4: a4,
            signal: controller && controller.signal,
            onProgress: function(info) { setProgress(info) }
          })
        }
        if (cancelled) return
        const blobKey = await saveNoteAudioBlob(result.wavBlob)
        const noteRec = {
          id: 'note_' + Date.now().toString(36) + '_' + noteIndex,
          targetNote: measurementMode === 'tap' ? ('Tap ' + (noteIndex + 1)) : simpleNoteLabel(target.targetNote),
          stringIndex: target.stringIndex,
          audioBlobKey: blobKey,
          durationMs: result.durationMs,
          features: result.features,
          channelCount: result.channelCount || 1
        }
        if (result.featuresR) {
          noteRec.featuresR = result.featuresR
        }
        const nextNotes = notesRef.current.concat([noteRec])
        notesRef.current = nextNotes
        setCapturedNotes(nextNotes)
        if (noteIndex + 1 >= sequence.length) {
          await finishSetWithNotes(nextNotes)
        } else {
          setNoteIndex(noteIndex + 1)
        }
      } catch (err) {
        if (cancelled || (err && err.message === 'aborted')) return
        setError((err && err.message) || String(err))
        setStatus('Capture failed — you can retry or skip.')
      }
    }

    run()
    return function() {
      cancelled = true
      if (controller) controller.abort()
    }
  }, [step, noteIndex, captureToken, sequence, a4, measurementMode])

  function skipNote() {
    if (abortRef.current) abortRef.current.abort()
    if (noteIndex + 1 >= sequence.length) {
      finishSetWithNotes(notesRef.current)
    } else {
      setNoteIndex(noteIndex + 1)
    }
  }

  function retryNote() {
    if (abortRef.current) abortRef.current.abort()
    setError(null)
    setCaptureToken(function(t) { return t + 1 })
  }

  function cancelWizard() {
    if (abortRef.current) abortRef.current.abort()
    if (props.onCancel) props.onCancel()
  }

  if (step === 'done') {
    return (
      <div>
        <Alert variant="success">{status}</Alert>
        <Button variant="primary" onClick={function() { if (props.onCancel) props.onCancel() }}>
          Back to history
        </Button>
      </div>
    )
  }

  if (step === 'capture') {
    const target = sequence[noteIndex] || sequence[sequence.length - 1]
    const pct = progress && progress.needMs
      ? Math.min(100, Math.round((100 * (progress.heldMs || 0)) / progress.needMs))
      : (progress && progress.phase === 'capturing' ? 50 : 0)
    return (
      <div className="audio-analysis-wizard-capture">
        <Alert variant="info" className="small">
          {measurementMode === 'tap' ? (
            <div>
              {stereoTap ? (
                <>
                  <strong>Tap mode (stereo).</strong> Damp all strings.
                  Channel L = flat mic (XLR); R = piezo on Instrument jack.
                  Tap the <em>bridge top</em> lightly — same spot each time. Fixed gains; quiet room.
                </>
              ) : (
                <>
                  <strong>Tap mode (phone mic OK).</strong> Damp all strings with a cloth or fingers.
                  Hold the phone ~30–50 cm from the treble side. Tap the <em>bridge top</em> lightly with a finger
                  or pencil eraser — same spot each time. Quiet room; avoid handling noise.
                </>
              )}
            </div>
          ) : (
            <div>
              <strong>Bowed mode.</strong> Match mic distance and bow force across sets.
              Hold each note in tune (~±15¢) for 2 seconds until the bar fills.
            </div>
          )}
        </Alert>
        <h5>
          {measurementMode === 'tap' ? 'Tap' : 'Note'}{' '}
          {Math.min(noteIndex + 1, sequence.length)} / {sequence.length}
          {target && measurementMode !== 'tap' ? ': ' + simpleNoteLabel(target.targetNote) : ''}
        </h5>
        <p>{status}</p>
        {progress ? (
          <div className="mb-3">
            <div className="small text-muted mb-1">
              {progress.message || ''}
              {progress.cents != null
                ? ' · ' + (progress.cents >= 0 ? '+' : '') + progress.cents.toFixed(1) + ' cents'
                : ''}
              {progress.level != null ? ' · level ' + progress.level.toFixed(3) : ''}
              {progress.channelCount === 2 ? ' · stereo' : ''}
            </div>
            {measurementMode === 'bowed' || progress.needMs ? (
              <ProgressBar now={pct} label={pct >= 100 ? 'Locked' : pct + '%'} />
            ) : null}
          </div>
        ) : null}
        {error ? <Alert variant="warning">{error}</Alert> : null}
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-secondary" onClick={skipNote}>Skip</Button>
          <Button variant="outline-primary" onClick={retryNote}>Retry</Button>
          <Button variant="outline-danger" onClick={cancelWizard}>Cancel</Button>
        </div>
        <p className="small text-muted mt-3 mb-0">Captured so far: {capturedNotes.length}</p>
      </div>
    )
  }

  return (
    <Form onSubmit={startWizard} className="audio-analysis-wizard-form" style={{ maxWidth: '36rem' }}>
      <h5>New recording set</h5>
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <Form.Group className="mb-3">
        <Form.Label>Measurement mode</Form.Label>
        <Form.Select value={measurementMode} onChange={function(e) { setMeasurementMode(e.target.value) }}>
          <option value="bowed">Bowed notes (pitch-gated)</option>
          <option value="tap">Tap body response (Tier‑1)</option>
        </Form.Select>
        <Form.Text muted>
          {measurementMode === 'tap'
            ? 'Records ' + TAP_TARGET_COUNT + ' bridge taps to map body resonances (A0 / B1±). Best with damped strings.'
            : 'Records a note sequence for tonality / soundpost A–B compare.'}
        </Form.Text>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Label</Form.Label>
        <VoiceFillInput
          value={label}
          onChange={function(e) { setLabel(e.target.value) }}
          placeholder={measurementMode === 'tap' ? 'e.g. Tap after post toward bridge' : 'e.g. Post toward bridge 1mm'}
          required
          fieldKind="search"
          token={props.token}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Group</Form.Label>
        <Form.Select value={groupId} onChange={function(e) { setGroupId(e.target.value); setNewGroupName('') }}>
          <option value={UNGROUPED}>Ungrouped</option>
          {groups.map(function(g) {
            return <option key={g.id} value={g.id}>{g.label}</option>
          })}
        </Form.Select>
        <VoiceFillInput
          className="mt-2"
          placeholder="Or create new group…"
          value={newGroupName}
          onChange={function(e) { setNewGroupName(e.target.value) }}
          fieldKind="search"
          token={props.token}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Instrument</Form.Label>
        <Form.Select value={instrument} onChange={function(e) { setInstrument(e.target.value) }}>
          {AUDIO_ANALYSIS_INSTRUMENTS.map(function(id) {
            return <option key={id} value={id}>{TUNER_INSTRUMENT_LABELS[id] || id}</option>
          })}
        </Form.Select>
      </Form.Group>
      {measurementMode === 'bowed' ? (
        <>
          <Form.Group className="mb-3">
            <Form.Label>Tuning</Form.Label>
            <Form.Select value={tuningPresetId} onChange={function(e) { setTuningPresetId(e.target.value) }}>
              {presetOptions.map(function(p) {
                return <option key={p.id} value={p.id}>{p.label}</option>
              })}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Note sequence</Form.Label>
            <Form.Select value={sequencePresetId} onChange={function(e) { setSequencePresetId(e.target.value) }}>
              {SEQUENCE_PRESET_OPTIONS.map(function(o) {
                return <option key={o.id} value={o.id}>{o.label}</option>
              })}
            </Form.Select>
            <Form.Text muted>{sequence.length} notes will be recorded.</Form.Text>
          </Form.Group>
        </>
      ) : (
        <>
          <Form.Group className="mb-3">
            <Form.Label>Input device</Form.Label>
            <Form.Select
              value={inputDeviceId}
              onChange={function(e) { setInputDeviceId(e.target.value) }}
            >
              <option value="">Default microphone</option>
              {inputDevices.map(function(d) {
                return (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || ('Input ' + d.deviceId.slice(0, 8))}
                  </option>
                )
              })}
            </Form.Select>
            <Form.Text muted>Choose your USB interface (e.g. UMC22) when using an external mic.</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              id="stereo-tap-check"
              label="Stereo (mic + piezo)"
              checked={stereoTap}
              onChange={function(e) { setStereoTap(e.target.checked) }}
            />
            <Form.Text muted>
              L = radiated mic (XLR), R = contact/piezo (Instrument jack). Requires a 2-in interface.
            </Form.Text>
          </Form.Group>
          <Alert variant="secondary" className="small">
            You will capture <strong>{TAP_TARGET_COUNT} taps</strong>. Use the same mic/piezo setup for baseline and
            candidate sets. Radiated tap response is relative (not a force-hammer admittance lab).
          </Alert>
        </>
      )}
      <div className="d-flex gap-2">
        <Button type="submit" variant="primary">Start wizard</Button>
        <Button type="button" variant="secondary" onClick={cancelWizard}>Cancel</Button>
      </div>
    </Form>
  )
}
