import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button, Form, Alert, ToggleButton, ToggleButtonGroup } from 'react-bootstrap'
import Application from './app'
import {
  TUNER_INSTRUMENTS,
  TUNER_INSTRUMENT_LABELS,
  presetsForInstrument,
  getPreset,
  defaultPresetForInstrument
} from '../instrumentTuningPresets'
import {
  targetFrequenciesForPreset,
  centsForActiveString,
  nearestStringForFrequency,
  harmonicTargetForOpenString,
  wrongStringWarning,
  simpleNoteLabel,
  IN_TUNE_CENTS,
  INTONATION_AMBER_CENTS
} from '../tunerTuningUtils'
import { canonicalTuningLabel } from '../tuningPresetResolver'
import './style.css'

const LS_INSTRUMENT = 'bookstorage_last_tuner_instrument'
const LS_A4 = 'bookstorage_tuner_a4'

function tuningStorageKey(instrument) {
  return 'bookstorage_last_tuner_tuning_' + instrument
}

function readStoredA4() {
  const v = parseFloat(localStorage.getItem(LS_A4))
  return Number.isFinite(v) && v >= 400 && v <= 480 ? v : 440
}

function meterColor(cents) {
  if (cents == null) return ''
  const a = Math.abs(cents)
  if (a <= IN_TUNE_CENTS) return 'tuner-in-tune'
  if (a <= INTONATION_AMBER_CENTS) return 'tuner-amber'
  return 'tuner-sharp'
}

export default function TunerComponent(props) {
  const initialInstrument = props.instrument && TUNER_INSTRUMENTS.indexOf(props.instrument) !== -1
    ? props.instrument
    : (localStorage.getItem(LS_INSTRUMENT) || 'guitar')

  const [instrument, setInstrument] = useState(initialInstrument)
  const [presetId, setPresetId] = useState(function() {
    if (props.tuningPresetId) return props.tuningPresetId
    const stored = localStorage.getItem(tuningStorageKey(initialInstrument))
    if (stored) return stored
    const def = defaultPresetForInstrument(initialInstrument)
    return def ? def.id : ''
  })
  const [a4, setA4] = useState(readStoredA4)
  const [mode, setMode] = useState('tune')
  const [activeStringIndex, setActiveStringIndex] = useState(0)
  const [intonationStep, setIntonationStep] = useState('open')
  const [detectedFreq, setDetectedFreq] = useState(null)
  const [displayCents, setDisplayCents] = useState(null)
  const [wrongWarn, setWrongWarn] = useState(null)
  const [dismissedWrong, setDismissedWrong] = useState(false)
  const [audioStarted, setAudioStarted] = useState(false)
  const [savePrompt, setSavePrompt] = useState(null)

  const meterRef = useRef()
  const notesRef = useRef()
  const frequencyBarsRef = useRef()
  const appRef = useRef()
  const presetRef = useRef(null)
  const activeStringRef = useRef(0)
  const modeRef = useRef('tune')
  const intonationStepRef = useRef('open')
  const a4Ref = useRef(a4)
  const dismissedWrongRef = useRef(false)

  const preset = useMemo(function() {
    return getPreset(instrument, presetId) || defaultPresetForInstrument(instrument)
  }, [instrument, presetId])

  const stringTargets = useMemo(function() {
    return preset ? targetFrequenciesForPreset(preset, a4) : []
  }, [preset, a4])

  useEffect(function() { presetRef.current = preset }, [preset])
  useEffect(function() { activeStringRef.current = activeStringIndex }, [activeStringIndex])
  useEffect(function() { modeRef.current = mode }, [mode])
  useEffect(function() { intonationStepRef.current = intonationStep }, [intonationStep])
  useEffect(function() { a4Ref.current = a4 }, [a4])
  useEffect(function() { dismissedWrongRef.current = dismissedWrong }, [dismissedWrong])

  useEffect(function() {
    if (props.instrument && props.instrument !== instrument) {
      setInstrument(props.instrument)
    }
  }, [props.instrument])

  useEffect(function() {
    if (props.tuningPresetId) setPresetId(props.tuningPresetId)
  }, [props.tuningPresetId])

  useEffect(function() {
    if (!props.instrument && !props.tuningPresetId) return
    if (props.instrument) setInstrument(props.instrument)
    if (props.tuningPresetId) setPresetId(props.tuningPresetId)
  }, [props.instrument, props.tuningPresetId])

  const onNoteDetected = useCallback(function(note) {
    const p = presetRef.current
    if (!p) return
    const freq = note.frequency
    setDetectedFreq(freq)
    const active = activeStringRef.current
    let cents = null

    if (modeRef.current === 'tune') {
      cents = centsForActiveString(freq, p, active, a4Ref.current)
      setDisplayCents(cents)
      if (!dismissedWrongRef.current) {
        const warn = wrongStringWarning(active, freq, p, a4Ref.current)
        setWrongWarn(warn)
      }
      if (cents != null && Math.abs(cents) <= IN_TUNE_CENTS) {
        // stable in tune — optional auto-advance could go here
      }
    } else {
      const targets = targetFrequenciesForPreset(p, a4Ref.current)
      const openHz = targets[active] ? targets[active].frequency : null
      if (intonationStepRef.current === 'open') {
        cents = centsForActiveString(freq, p, active, a4Ref.current)
        setDisplayCents(cents)
      } else if (openHz) {
        const harmonicHz = harmonicTargetForOpenString(openHz)
        cents = Math.floor(1200 * Math.log(freq / harmonicHz) / Math.log(2))
        setDisplayCents(cents)
      }
      setWrongWarn(null)
    }
  }, [])

  useEffect(function() {
    if (!meterRef.current || !notesRef.current || !frequencyBarsRef.current) return undefined
    const app = new Application(
      meterRef.current,
      notesRef.current,
      frequencyBarsRef.current,
      { a4: a4, onNoteDetected: onNoteDetected }
    )
    appRef.current = app
    return function() {
      if (appRef.current) appRef.current.stop()
      appRef.current = null
    }
  }, [onNoteDetected])

  useEffect(function() {
    if (appRef.current) appRef.current.setA4(a4)
    localStorage.setItem(LS_A4, String(a4))
  }, [a4])

  useEffect(function() {
    localStorage.setItem(LS_INSTRUMENT, instrument)
    localStorage.setItem(tuningStorageKey(instrument), presetId)
  }, [instrument, presetId])

  function initAudio() {
    if (appRef.current && !audioStarted) {
      appRef.current.init()
      appRef.current.start()
      setAudioStarted(true)
    }
  }

  function handleInstrumentChange(instr) {
    setInstrument(instr)
    setDismissedWrong(false)
    setWrongWarn(null)
    const stored = localStorage.getItem(tuningStorageKey(instr))
    const nextId = stored || (defaultPresetForInstrument(instr) || {}).id || ''
    setPresetId(nextId)
    setActiveStringIndex(0)
    setIntonationStep('open')
  }

  function handlePresetChange(e) {
    const nextId = e.target.value
    setPresetId(nextId)
    setDismissedWrong(false)
    setWrongWarn(null)
    setActiveStringIndex(0)
    setIntonationStep('open')
    if (props.tuneId && props.onPresetChange) {
      const p = getPreset(instrument, nextId)
      if (p) {
        setSavePrompt({ label: canonicalTuningLabel(p), preset: p })
      }
    }
  }

  function playStringReference(index) {
    initAudio()
    const targets = stringTargets
    if (targets[index] && appRef.current) {
      appRef.current.playFrequency(targets[index].frequency)
    }
  }

  function nextString() {
    setDismissedWrong(false)
    setWrongWarn(null)
    if (mode === 'intonation' && intonationStep === 'open') {
      setIntonationStep('harmonic')
      return
    }
    setIntonationStep('open')
    setActiveStringIndex(function(i) {
      const max = stringTargets.length - 1
      return i >= max ? 0 : i + 1
    })
  }

  function confirmSaveTuning() {
    if (savePrompt && props.onSaveTuning) {
      props.onSaveTuning(canonicalTuningLabel(savePrompt.preset))
    }
    setSavePrompt(null)
  }

  const presetOptions = presetsForInstrument(instrument)
  const aliasHint = preset && preset.aliases && preset.aliases.length
    ? preset.aliases.slice(0, 4).join(', ')
    : ''

  const intonationInstruction = mode === 'intonation'
    ? (intonationStep === 'open'
      ? 'Pluck the open string, then tap Next for the 12th-fret harmonic check.'
      : 'Lightly touch the 12th-fret harmonic.')
    : ''

  return (
    <div className="tuner-root" onClick={initAudio}>
      {!audioStarted && (
        <Alert variant="info" className="tuner-tap-hint">Tap anywhere to enable the microphone</Alert>
      )}

      {props.suggestedForTune && (
        <p className="tuner-suggested text-muted">Suggested for <strong>{props.suggestedForTune}</strong></p>
      )}

      <div className="tuner-controls">
        <div className="tuner-instruments">
          {TUNER_INSTRUMENTS.map(function(instr) {
            return (
              <Button
                key={instr}
                size="sm"
                variant={instrument === instr ? 'info' : 'outline-primary'}
                onClick={function(e) { e.stopPropagation(); handleInstrumentChange(instr) }}
              >
                {TUNER_INSTRUMENT_LABELS[instr] || instr}
              </Button>
            )
          })}
        </div>

        <div className="tuner-row">
          <Form.Select
            size="sm"
            className="tuner-preset-select"
            value={presetId}
            onChange={handlePresetChange}
            onClick={function(e) { e.stopPropagation() }}
            title={aliasHint}
          >
            {presetOptions.map(function(p) {
              return <option key={p.id} value={p.id}>{p.label}</option>
            })}
          </Form.Select>

          <ToggleButtonGroup
            type="radio"
            name="tuner-mode"
            value={mode}
            onChange={function(val) {
              setMode(val)
              setIntonationStep('open')
              setDismissedWrong(false)
            }}
            size="sm"
          >
            <ToggleButton id="mode-tune" value="tune" variant="outline-secondary">Tune</ToggleButton>
            <ToggleButton id="mode-intonation" value="intonation" variant="outline-secondary">Intonation</ToggleButton>
          </ToggleButtonGroup>

          <Form.Label className="tuner-a4-label mb-0">
            A<sub>4</sub> =
            <Form.Control
              type="number"
              className="tuner-a4-input"
              min={400}
              max={480}
              step={0.1}
              value={a4}
              onChange={function(e) {
                const v = parseFloat(e.target.value)
                if (Number.isFinite(v)) setA4(v)
              }}
              onClick={function(e) { e.stopPropagation() }}
            />
            Hz
          </Form.Label>
        </div>
      </div>

      {savePrompt && (
        <Alert variant="secondary" className="tuner-save-prompt" onClick={function(e) { e.stopPropagation() }}>
          Save <strong>{savePrompt.label}</strong> to tune tuning field?
          <Button size="sm" className="ms-2" onClick={confirmSaveTuning}>Save</Button>
          <Button size="sm" variant="outline-secondary" className="ms-1" onClick={function() { setSavePrompt(null) }}>Not now</Button>
        </Alert>
      )}

      {wrongWarn && !dismissedWrong && mode === 'tune' && (
        <Alert variant="warning" dismissible onClose={function() { setDismissedWrong(true) }}>
          {wrongWarn.message}
        </Alert>
      )}

      {intonationInstruction && (
        <p className="tuner-intonation-hint text-muted">{intonationInstruction}</p>
      )}

      <div className="tuner-strings" onClick={function(e) { e.stopPropagation() }}>
        {stringTargets.map(function(t, i) {
          const isActive = i === activeStringIndex
          const label = simpleNoteLabel(t.note)
          let cls = 'tuner-string-btn'
          if (isActive) cls += ' active'
          if (isActive && displayCents != null) cls += ' ' + meterColor(displayCents)
          return (
            <Button
              key={i}
              variant={isActive ? 'danger' : 'outline-dark'}
              className={cls}
              onClick={function() {
                setActiveStringIndex(i)
                setIntonationStep('open')
                setDismissedWrong(false)
                playStringReference(i)
              }}
            >
              <span className="tuner-string-num">{stringTargets.length - i}</span>
              {label}
            </Button>
          )
        })}
        <Button variant="secondary" size="sm" className="tuner-next-string" onClick={nextString}>Next string</Button>
      </div>

      <div className={'tuner-meter-wrap ' + meterColor(displayCents)}>
        <canvas ref={frequencyBarsRef} className="frequency-bars"></canvas>
        <div ref={meterRef} className="meter">
          <div className="meter-dot"></div>
          <div className="meter-pointer"></div>
        </div>
        <div ref={notesRef} className="notes">
          <div className="notes-list"></div>
          <div className="frequency"><span>{detectedFreq ? detectedFreq.toFixed(1) : '—'}</span> Hz</div>
        </div>
      </div>
    </div>
  )
}
