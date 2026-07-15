import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button, Form, Alert, ToggleButton, ToggleButtonGroup } from 'react-bootstrap'
import { icons } from '../Icons'
import FormFieldHelp from '../components/FormFieldHelp'
import Application, { listAudioInputDevices } from './app'
import TunerVuMeter from './TunerVuMeter'
import TunerPitchGraph from './TunerPitchGraph'
import TunerVolumeMeter from './TunerVolumeMeter'
import TunerStabilityMeter from './TunerStabilityMeter'
import { adaptiveDisplayRange } from './tunerDisplayUtils'
import {
  createPitchStabilizer,
  formatDetectedNoteLabel,
  fineDisplayRange,
  DEFAULT_GATE_THRESHOLD,
  IN_TUNE_HOLD_MS
} from './pitchStabilizer'
import { playInTuneChime } from './tunerInTuneChime'
import {
  TUNER_INSTRUMENTS,
  TUNER_INSTRUMENT_LABELS,
  CHROMATIC_INSTRUMENT,
  isChromaticInstrument,
  isValidTunerInstrumentSelection,
  presetsForInstrument,
  getPreset,
  defaultPresetForInstrument
} from '../instrumentTuningPresets'
import {
  targetFrequenciesForPreset,
  centsForActiveString,
  harmonicTargetForOpenString,
  wrongStringWarning,
  simpleNoteLabel,
  chromaticCentsForFrequency,
  IN_TUNE_CENTS,
  INTONATION_AMBER_CENTS
} from '../tunerTuningUtils'
import { canonicalTuningLabel } from '../tuningPresetResolver'
import './style.css'

const LS_INSTRUMENT = 'bookstorage_last_tuner_instrument'
const LS_A4 = 'bookstorage_tuner_a4'
const LS_DISPLAY_VIEW = 'bookstorage_tuner_display_view'
const LS_GATE = 'bookstorage_tuner_gate_threshold'
const LS_FINE_MODE = 'bookstorage_tuner_fine_mode'
const LS_AUTO_ADVANCE = 'bookstorage_tuner_auto_advance'
const LS_MIC_DEVICE = 'bookstorage_tuner_mic_device'
const LS_SHOW_ADVANCED = 'bookstorage_tuner_show_advanced'
const LS_CHECK_HARMONICS = 'bookstorage_tuner_check_harmonics'
const PITCH_HISTORY_MAX = 600

const FINE_HELP_BODY = (
  <>
    <p>Fine is display zoom only. When you are within about ±8¢ of the target, the needle scale zooms to ±3¢ so you can see small adjustments more clearly.</p>
    <p>It does not change pitch detection — only how the meter is drawn when you are already close to pitch.</p>
  </>
)

const GATE_HELP_BODY = (
  <>
    <p>Gate is a noise gate / input sensitivity. The tuner only listens when the mic volume is above this threshold.</p>
    <ul>
      <li><strong>Lower gate</strong> — more sensitive; picks up quieter playing but may react to room noise.</li>
      <li><strong>Higher gate</strong> — ignores quiet sounds; raise it if background noise causes false readings.</li>
    </ul>
    <p>Use Gate for noisy environments. Use Fine for precise final tuning — they solve different problems.</p>
  </>
)

function tuningStorageKey(instrument) {
  return 'bookstorage_last_tuner_tuning_' + instrument
}

function readStoredA4() {
  const v = parseFloat(localStorage.getItem(LS_A4))
  return Number.isFinite(v) && v >= 400 && v <= 480 ? v : 440
}

function readStoredDisplayView() {
  const v = localStorage.getItem(LS_DISPLAY_VIEW)
  return v === 'graph' ? 'graph' : 'vu'
}

function readStoredGate() {
  const v = parseFloat(localStorage.getItem(LS_GATE))
  return Number.isFinite(v) && v >= 0.01 && v <= 0.2 ? v : DEFAULT_GATE_THRESHOLD
}

function readStoredBool(key, defaultVal) {
  const v = localStorage.getItem(key)
  if (v === '0' || v === 'false') return false
  if (v === '1' || v === 'true') return true
  return defaultVal
}

function meterColor(cents) {
  if (cents == null) return ''
  const a = Math.abs(cents)
  if (a <= IN_TUNE_CENTS) return 'tuner-in-tune'
  if (a <= INTONATION_AMBER_CENTS) return 'tuner-amber'
  return 'tuner-sharp'
}

export default function TunerComponent(props) {
  const initialInstrument = props.instrument && isValidTunerInstrumentSelection(props.instrument)
    ? props.instrument
    : (function() {
      const stored = localStorage.getItem(LS_INSTRUMENT)
      return isValidTunerInstrumentSelection(stored) ? stored : 'guitar'
    }())

  const [instrument, setInstrument] = useState(initialInstrument)
  const isChromatic = isChromaticInstrument(instrument)
  const [presetId, setPresetId] = useState(function() {
    if (isChromaticInstrument(initialInstrument)) return ''
    if (props.tuningPresetId) return props.tuningPresetId
    const stored = localStorage.getItem(tuningStorageKey(initialInstrument))
    if (stored) return stored
    const def = defaultPresetForInstrument(initialInstrument)
    return def ? def.id : ''
  })
  const [a4, setA4] = useState(readStoredA4)
  const [mode, setMode] = useState(function() {
    return readStoredBool(LS_CHECK_HARMONICS, false) ? 'intonation' : 'tune'
  })
  const [activeStringIndex, setActiveStringIndex] = useState(0)
  const [intonationStep, setIntonationStep] = useState('open')
  const [displayCents, setDisplayCents] = useState(null)
  const [detectedFreq, setDetectedFreq] = useState(null)
  const [noteLabel, setNoteLabel] = useState('')
  const [isHeld, setIsHeld] = useState(false)
  const [displayRange, setDisplayRange] = useState(50)
  const [displayView, setDisplayView] = useState(readStoredDisplayView)
  const [inputLevel, setInputLevel] = useState(0)
  const [pitchHistory, setPitchHistory] = useState([])
  const [stabilityCents, setStabilityCents] = useState(null)
  const [inTuneFlash, setInTuneFlash] = useState(false)
  const [gateThreshold, setGateThreshold] = useState(readStoredGate)
  const [fineMode, setFineMode] = useState(function() { return readStoredBool(LS_FINE_MODE, true) })
  const [autoAdvance, setAutoAdvance] = useState(function() { return readStoredBool(LS_AUTO_ADVANCE, false) })
  const [showAdvanced, setShowAdvanced] = useState(function() { return readStoredBool(LS_SHOW_ADVANCED, false) })
  const [micDevices, setMicDevices] = useState([])
  const [selectedMicId, setSelectedMicId] = useState(localStorage.getItem(LS_MIC_DEVICE) || '')
  const [wrongWarn, setWrongWarn] = useState(null)
  const [dismissedWrong, setDismissedWrong] = useState(false)
  const [audioStarted, setAudioStarted] = useState(false)
  const [referencePlaying, setReferencePlaying] = useState(false)
  const [savePrompt, setSavePrompt] = useState(null)

  const notesRef = useRef()
  const appRef = useRef()
  const stabilizerRef = useRef(createPitchStabilizer({ gateThreshold: readStoredGate() }))
  const presetRef = useRef(null)
  const activeStringRef = useRef(0)
  const modeRef = useRef('tune')
  const intonationStepRef = useRef('open')
  const a4Ref = useRef(a4)
  const dismissedWrongRef = useRef(false)
  const instrumentRef = useRef(instrument)
  const inputLevelRef = useRef(0)
  const inTuneSinceRef = useRef(null)
  const autoAdvancedForRef = useRef(-1)
  const fineModeRef = useRef(fineMode)
  const autoAdvanceRef = useRef(autoAdvance)
  const nextStringRef = useRef(function() {})

  const preset = useMemo(function() {
    if (isChromaticInstrument(instrument)) return null
    return getPreset(instrument, presetId) || defaultPresetForInstrument(instrument)
  }, [instrument, presetId])

  const stringTargets = useMemo(function() {
    return preset ? targetFrequenciesForPreset(preset, a4) : []
  }, [preset, a4])

  const activeTargetLabel = useMemo(function() {
    const target = stringTargets[activeStringIndex]
    return target ? simpleNoteLabel(target.note) : ''
  }, [stringTargets, activeStringIndex])

  useEffect(function() { presetRef.current = preset }, [preset])
  useEffect(function() { activeStringRef.current = activeStringIndex }, [activeStringIndex])
  useEffect(function() { modeRef.current = mode }, [mode])
  useEffect(function() { intonationStepRef.current = intonationStep }, [intonationStep])
  useEffect(function() { a4Ref.current = a4 }, [a4])
  useEffect(function() { dismissedWrongRef.current = dismissedWrong }, [dismissedWrong])
  useEffect(function() { instrumentRef.current = instrument }, [instrument])
  useEffect(function() { fineModeRef.current = fineMode }, [fineMode])
  useEffect(function() { autoAdvanceRef.current = autoAdvance }, [autoAdvance])
  useEffect(function() {
    stabilizerRef.current.setGateThreshold(gateThreshold)
  }, [gateThreshold])

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

  function resetReading(clearHistory) {
    stabilizerRef.current.reset()
    inTuneSinceRef.current = null
    autoAdvancedForRef.current = -1
    if (clearHistory) {
      setPitchHistory([])
      setDisplayCents(null)
      setDetectedFreq(null)
      setNoteLabel('')
      setIsHeld(false)
      setStabilityCents(null)
      setDisplayRange(50)
    }
  }

  function computeStringCents(freq) {
    const p = presetRef.current
    if (!p || !freq) return null
    const active = activeStringRef.current
    if (modeRef.current === 'tune') {
      return centsForActiveString(freq, p, active, a4Ref.current)
    }
    const targets = targetFrequenciesForPreset(p, a4Ref.current)
    const openHz = targets[active] ? targets[active].frequency : null
    if (intonationStepRef.current === 'open') {
      return centsForActiveString(freq, p, active, a4Ref.current)
    }
    if (openHz) {
      const harmonicHz = harmonicTargetForOpenString(openHz)
      return (1200 * Math.log(freq / harmonicHz)) / Math.log(2)
    }
    return null
  }

  function computeCentsForFreq(freq) {
    if (!freq) return null
    if (isChromaticInstrument(instrumentRef.current)) {
      return chromaticCentsForFrequency(freq, a4Ref.current)
    }
    return computeStringCents(freq)
  }

  function updateDisplayRange(cents) {
    if (cents == null) return
    const fine = fineDisplayRange(Math.abs(cents), fineModeRef.current)
    if (fine != null) {
      setDisplayRange(fine)
      return
    }
    setDisplayRange(function(current) {
      const next = adaptiveDisplayRange(Math.abs(cents), current)
      return Math.round(next * 10) / 10
    })
  }

  function checkInTuneActions(cents, held) {
    if (held || cents == null || !Number.isFinite(cents)) {
      inTuneSinceRef.current = null
      return
    }
    if (isChromaticInstrument(instrumentRef.current)) return
    if (modeRef.current !== 'tune') return
    if (Math.abs(cents) > IN_TUNE_CENTS) {
      inTuneSinceRef.current = null
      return
    }

    const now = Date.now()
    if (!inTuneSinceRef.current) inTuneSinceRef.current = now

    if (now - inTuneSinceRef.current < IN_TUNE_HOLD_MS) return

    if (autoAdvancedForRef.current === activeStringRef.current) return

    autoAdvancedForRef.current = activeStringRef.current
    inTuneSinceRef.current = null
    playInTuneChime(appRef.current && appRef.current.getAudioContext())
    setInTuneFlash(true)
    window.setTimeout(function() { setInTuneFlash(false) }, 600)

    if (autoAdvanceRef.current) {
      nextStringRef.current(true)
    }
  }

  function applyReading(freq, cents, label, held, appendHistory) {
    if (freq != null) setDetectedFreq(freq)
    if (label) setNoteLabel(label)
    setIsHeld(!!held)
    if (cents == null) return
    setDisplayCents(cents)
    updateDisplayRange(cents)
    setStabilityCents(stabilizerRef.current.getStabilityCents())

    if (appendHistory && !held) {
      const now = Date.now()
      setPitchHistory(function(prev) {
        const next = prev.concat([{ t: now, cents: cents }])
        return next.length > PITCH_HISTORY_MAX ? next.slice(-PITCH_HISTORY_MAX) : next
      })
    }

    checkInTuneActions(cents, held)
  }

  const onPitchSample = useCallback(function(note) {
    const rawFreq = note.frequency
    const label = formatDetectedNoteLabel(note)
    const stab = stabilizerRef.current.process(
      rawFreq,
      inputLevelRef.current,
      null,
      label
    )

    if (!stab.freq) return

    const frameCents = computeCentsForFreq(stab.freq)
    stabilizerRef.current.pushCents(frameCents)
    const displayCentsValue = stabilizerRef.current.getDisplayCents()
    const cents = displayCentsValue != null ? displayCentsValue : frameCents
    applyReading(stab.freq, cents, label, stab.isHeld, !stab.isHeld)

    if (!isChromaticInstrument(instrumentRef.current) && modeRef.current === 'tune' && !dismissedWrongRef.current) {
      const p = presetRef.current
      if (p) {
        const warn = wrongStringWarning(activeStringRef.current, stab.freq, p, a4Ref.current)
        setWrongWarn(warn)
      }
    } else if (modeRef.current !== 'tune') {
      setWrongWarn(null)
    }
  }, [])

  const onNoteDetected = useCallback(function() {
    // Note strip is updated directly by Application
  }, [])

  const onAudioLevel = useCallback(function(level) {
    inputLevelRef.current = level
    setInputLevel(level)
  }, [])

  useEffect(function() {
    if (!notesRef.current) return undefined
    const app = new Application(notesRef.current, {
      a4: a4,
      onNoteDetected: onNoteDetected,
      onPitchSample: onPitchSample,
      onAudioLevel: onAudioLevel
    })
    appRef.current = app
    return function() {
      if (appRef.current) appRef.current.stop()
      appRef.current = null
    }
  }, [onNoteDetected, onPitchSample, onAudioLevel])

  useEffect(function() {
    if (appRef.current) appRef.current.setA4(a4)
    localStorage.setItem(LS_A4, String(a4))
  }, [a4])

  useEffect(function() {
    localStorage.setItem(LS_INSTRUMENT, instrument)
    if (!isChromaticInstrument(instrument)) {
      localStorage.setItem(tuningStorageKey(instrument), presetId)
    }
  }, [instrument, presetId])

  useEffect(function() {
    localStorage.setItem(LS_DISPLAY_VIEW, displayView)
  }, [displayView])

  useEffect(function() {
    localStorage.setItem(LS_GATE, String(gateThreshold))
  }, [gateThreshold])

  useEffect(function() {
    localStorage.setItem(LS_FINE_MODE, fineMode ? '1' : '0')
  }, [fineMode])

  useEffect(function() {
    localStorage.setItem(LS_AUTO_ADVANCE, autoAdvance ? '1' : '0')
  }, [autoAdvance])

  useEffect(function() {
    localStorage.setItem(LS_SHOW_ADVANCED, showAdvanced ? '1' : '0')
  }, [showAdvanced])

  useEffect(function() {
    if (selectedMicId) localStorage.setItem(LS_MIC_DEVICE, selectedMicId)
  }, [selectedMicId])

  useEffect(function() {
    resetReading(true)
  }, [instrument, presetId, activeStringIndex, mode, intonationStep])

  function refreshMicDevices() {
    listAudioInputDevices().then(function(devices) {
      setMicDevices(devices)
    }).catch(function() {})
  }

  function initAudio() {
    if (appRef.current && !audioStarted) {
      if (selectedMicId) appRef.current.setInputDeviceId(selectedMicId)
      appRef.current.init()
      appRef.current.start()
      setAudioStarted(true)
      refreshMicDevices()
    }
  }

  function handleInstrumentChange(e) {
    const instr = e.target.value
    stopReferenceTone()
    setInstrument(instr)
    setDismissedWrong(false)
    setWrongWarn(null)
    if (isChromaticInstrument(instr)) {
      setPresetId('')
      setMode('tune')
      setActiveStringIndex(0)
      setIntonationStep('open')
      return
    }
    const stored = localStorage.getItem(tuningStorageKey(instr))
    const nextId = stored || (defaultPresetForInstrument(instr) || {}).id || ''
    setPresetId(nextId)
    setActiveStringIndex(0)
    setIntonationStep('open')
    setMode(readStoredBool(LS_CHECK_HARMONICS, false) ? 'intonation' : 'tune')
  }

  function handlePresetChange(e) {
    stopReferenceTone()
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

  function handleMicChange(e) {
    const deviceId = e.target.value
    setSelectedMicId(deviceId)
    if (appRef.current && audioStarted) {
      appRef.current.setInputDevice(deviceId || null)
    }
  }

  function stopReferenceTone() {
    if (appRef.current) appRef.current.stopReference()
    setReferencePlaying(false)
  }

  function toggleReferenceTone() {
    initAudio()
    if (referencePlaying) {
      stopReferenceTone()
      return
    }
    const targets = stringTargets
    const index = activeStringIndex
    if (targets[index] && appRef.current) {
      appRef.current.playFrequency(targets[index].frequency)
      setReferencePlaying(true)
    }
  }

  function nextString(fromAutoAdvance) {
    stopReferenceTone()
    setDismissedWrong(false)
    setWrongWarn(null)
    if (!fromAutoAdvance) {
      autoAdvancedForRef.current = -1
    }
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

  nextStringRef.current = nextString

  function toggleCheckHarmonics(on) {
    stopReferenceTone()
    setMode(on ? 'intonation' : 'tune')
    setIntonationStep('open')
    setDismissedWrong(false)
    localStorage.setItem(LS_CHECK_HARMONICS, on ? '1' : '0')
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

  const intonationInstruction = !isChromatic && mode === 'intonation'
    ? (intonationStep === 'open'
      ? 'Pluck the open string, then tap Next for the 12th-fret harmonic check.'
      : 'Lightly touch the 12th-fret harmonic.')
    : ''

  const displayNoteLabel = noteLabel || (!isChromatic ? activeTargetLabel : '')

  return (
    <div className="tuner-root" onClick={initAudio}>
      {!audioStarted && (
        <Alert variant="info" className="tuner-tap-hint">Tap anywhere to enable the microphone</Alert>
      )}

      {props.suggestedForTune && !isChromatic && (
        <p className="tuner-suggested text-muted">Suggested for <strong>{props.suggestedForTune}</strong></p>
      )}

      <div className="tuner-controls">
        <div className="tuner-settings-block">
          <div className="tuner-row tuner-row-primary">
            <Form.Select
              size="sm"
              className="tuner-instrument-select"
              value={instrument}
              onChange={handleInstrumentChange}
              onClick={function(e) { e.stopPropagation() }}
            >
              <option value={CHROMATIC_INSTRUMENT}>{TUNER_INSTRUMENT_LABELS.chromatic}</option>
              {TUNER_INSTRUMENTS.map(function(instr) {
                return (
                  <option key={instr} value={instr}>
                    {TUNER_INSTRUMENT_LABELS[instr] || instr}
                  </option>
                )
              })}
            </Form.Select>

            {!isChromatic && (
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
            )}

            <Form.Check
              type="switch"
              id="tuner-show-advanced"
              className="tuner-advanced-toggle mb-0"
              label="Advanced"
              checked={showAdvanced}
              onChange={function(e) { setShowAdvanced(e.target.checked) }}
              onClick={function(e) { e.stopPropagation() }}
            />

            {!isChromatic && (
              <>
                <Form.Check
                  type="switch"
                  id="tuner-auto-advance"
                  className="tuner-auto-advance-toggle mb-0"
                  label="Auto next"
                  checked={autoAdvance}
                  onChange={function(e) { setAutoAdvance(e.target.checked) }}
                  onClick={function(e) { e.stopPropagation() }}
                  title="Advance to next string after 400ms in tune"
                />

                <Form.Check
                  type="switch"
                  id="tuner-check-harmonics"
                  className="tuner-check-harmonics-toggle mb-0"
                  label="Check Harmonics"
                  checked={mode === 'intonation'}
                  onChange={function(e) { toggleCheckHarmonics(e.target.checked) }}
                  onClick={function(e) { e.stopPropagation() }}
                  title="Check 12th-fret harmonics against open string tuning"
                />
              </>
            )}
          </div>

          {showAdvanced && (
            <div className="tuner-advanced-panel" onClick={function(e) { e.stopPropagation() }}>
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
                />
                Hz
              </Form.Label>

              <div className="tuner-fine-control">
                <Form.Check
                  type="switch"
                  id="tuner-fine-mode"
                  className="tuner-fine-toggle mb-0"
                  label="Fine"
                  checked={fineMode}
                  onChange={function(e) { setFineMode(e.target.checked) }}
                  title="Zoom to ±3¢ when close to pitch"
                />
                <FormFieldHelp
                  title="Fine"
                  body={FINE_HELP_BODY}
                  className="tuner-setting-help-btn"
                  buttonTitle="Help: Fine mode"
                />
              </div>

              <Form.Label className="tuner-gate-label mb-0">
                <span className="tuner-gate-heading">
                  Gate
                  <FormFieldHelp
                    title="Gate"
                    body={GATE_HELP_BODY}
                    className="tuner-setting-help-btn"
                    buttonTitle="Help: Gate"
                  />
                </span>
                <Form.Range
                  min={1}
                  max={20}
                  value={Math.round(gateThreshold * 100)}
                  onChange={function(e) {
                    setGateThreshold(parseInt(e.target.value, 10) / 100)
                  }}
                  title="Noise gate — raise if background noise triggers false readings"
                />
              </Form.Label>

              {audioStarted && micDevices.length > 0 ? (
                <Form.Select
                  size="sm"
                  className="tuner-mic-select"
                  value={selectedMicId}
                  onChange={handleMicChange}
                >
                  <option value="">Default microphone</option>
                  {micDevices.map(function(d) {
                    return (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Microphone ' + d.deviceId.slice(0, 8)}
                      </option>
                    )
                  })}
                </Form.Select>
              ) : (
                <span className="tuner-mic-placeholder" aria-hidden="true" />
              )}
            </div>
          )}
        </div>
      </div>

      {savePrompt && (
        <Alert variant="secondary" className="tuner-save-prompt" onClick={function(e) { e.stopPropagation() }}>
          Save <strong>{savePrompt.label}</strong> to tune tuning field?
          <Button size="sm" className="ms-2" onClick={confirmSaveTuning}>Save</Button>
          <Button size="sm" variant="outline-secondary" className="ms-1" onClick={function() { setSavePrompt(null) }}>Not now</Button>
        </Alert>
      )}

      {wrongWarn && !dismissedWrong && !isChromatic && mode === 'tune' && (
        <Alert variant="warning" dismissible onClose={function() { setDismissedWrong(true) }}>
          {wrongWarn.message}
        </Alert>
      )}

      {intonationInstruction && (
        <p className="tuner-intonation-hint text-muted">{intonationInstruction}</p>
      )}

      {!isChromatic && (
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
                  if (i !== activeStringIndex) stopReferenceTone()
                  autoAdvancedForRef.current = -1
                  setActiveStringIndex(i)
                  setIntonationStep('open')
                  setDismissedWrong(false)
                }}
              >
                <span className="tuner-string-num">{stringTargets.length - i}</span>
                {label}
              </Button>
            )
          })}
          <Button variant="secondary" size="sm" className="tuner-next-string" onClick={function() { nextString(false) }}>Next string</Button>
          <Button
            variant={referencePlaying ? 'danger' : 'outline-secondary'}
            size="sm"
            className="tuner-play-btn"
            onClick={toggleReferenceTone}
            title={referencePlaying ? 'Stop reference tone' : 'Play reference tone for selected string'}
            aria-label={referencePlaying ? 'Stop reference tone' : 'Play reference tone'}
          >
            {referencePlaying ? icons.stopsmall : icons.play}
          </Button>
        </div>
      )}

      <div
        ref={notesRef}
        className={isChromatic ? 'tuner-notes-hidden' : 'notes tuner-notes-strip'}
        aria-hidden={isChromatic ? 'true' : undefined}
      >
        <div className="notes-list"></div>
      </div>

      <div className="tuner-display-toolbar" onClick={function(e) { e.stopPropagation() }}>
        <ToggleButtonGroup
          type="radio"
          name="tuner-display-view"
          value={displayView}
          onChange={setDisplayView}
          size="sm"
        >
          <ToggleButton id="display-vu" value="vu" variant="outline-secondary">Needle</ToggleButton>
          <ToggleButton id="display-graph" value="graph" variant="outline-secondary">Graph</ToggleButton>
        </ToggleButtonGroup>
        <TunerStabilityMeter stabilityCents={stabilityCents} />
      </div>

      <div className={'tuner-display-panel ' + meterColor(displayCents) + (inTuneFlash ? ' tuner-in-tune-flash' : '')}>
        <div className="tuner-display-main">
          {displayView === 'vu' ? (
            <TunerVuMeter
              cents={displayCents}
              frequency={detectedFreq}
              halfRange={displayRange}
              targetLabel={isChromatic ? displayNoteLabel : activeTargetLabel}
              isHeld={isHeld}
              inTuneFlash={inTuneFlash}
            />
          ) : (
            <TunerPitchGraph
              history={pitchHistory}
              targetLabel={isChromatic ? displayNoteLabel : activeTargetLabel}
              active={displayView === 'graph'}
              isHeld={isHeld}
            />
          )}
        </div>
        <TunerVolumeMeter level={inputLevel} />
      </div>
    </div>
  )
}
