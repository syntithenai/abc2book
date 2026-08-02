import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Form } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { icons } from '../Icons'
import {
  applyRhythmPreset,
  getSearchableRhythmPresets,
  groupPresetsForPicker,
  PRESET_CATEGORY_MY_PATTERNS,
} from '../drumPatternPresets'
import { METRONOME_PULSE_OPTIONS } from '../metronomeRhythmPresets'
import {
  ENGINE_MODE_CLICK,
  ENGINE_MODE_DRUMS,
  setDrumSwing,
  toggleDrumStep,
  DRUM_TRACK_DEFAULTS,
  DRUM_TRACK_IDS,
} from '../rhythmEngineTypes'
import {
  applyEditorSubdivision,
  editorSubdivisionHint,
  getEditorSlotCount,
  getEditorSubdivisionOptions,
  EDITOR_SUBDIVISION_PULSES,
  EDITOR_SUBDIVISION_HALF_PULSES,
  beatGroupIsOn,
  setDrumBeatSteps,
} from '../rhythmGranularity'
import { isUserDrumPresetId } from '../userDrumPresets'
import useUserDrumPresets from '../useUserDrumPresets'
import {
  createDrumPatternUndoStack,
  pushDrumPatternState,
  undoDrumPattern,
  redoDrumPattern,
  canUndoDrumPattern,
  canRedoDrumPattern,
} from '../drumPatternUndo'
import {
  loadEditorSubdivision,
  saveEditorSubdivision,
} from '../drumPatternEditorPrefs'
import { createRecordingSession } from '../drumPatternRecorder'
import { auditionDrumSample } from '../drumSampleKit'
import DrumPatternGrid from './DrumPatternGrid'
import DrumPatternToolbar from './DrumPatternToolbar'
import DrumRecordPads from './DrumRecordPads'
import './DrumPatternEditor.css'

const SWING_OPTIONS = [
  { label: 'Straight', value: 0 },
  { label: 'Light', value: 0.15 },
  { label: 'Medium', value: 0.33 },
]

function SectionDivider() {
  return <hr className="drum-pattern-editor__section-divider" aria-hidden="true" />
}

export default function DrumPatternEditor(props) {
  const rhythm = props.rhythm
  const disabled = !!props.disabled
  const compact = !!props.compact
  const recordingEnabled = props.recordingEnabled !== false
  const showMeterControls = props.showMeterControls !== false
  const [presetOpen, setPresetOpen] = useState(false)
  const [presetFilter, setPresetFilter] = useState('')
  const [showVelocityLanes, setShowVelocityLanes] = useState(false)
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0)
  const [selectedStep, setSelectedStep] = useState(0)
  const [recording, setRecording] = useState(false)
  const [flashSlot, setFlashSlot] = useState(null)
  const [countInBarsRemaining, setCountInBarsRemaining] = useState(0)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [editorSubdivision, setEditorSubdivision] = useState(loadEditorSubdivision)
  const undoStackRef = useRef(createDrumPatternUndoStack(null))
  const [, forceUndoRender] = useState(0)
  const recordSessionRef = useRef(null)
  const editorRef = useRef(null)
  const presetPickerRef = useRef(null)
  const prevActiveSlotRef = useRef(-1)
  const countInRef = useRef(0)
  const { presets: userPresets, save: saveUserPreset, remove: removeUserPreset } = useUserDrumPresets()

  const engineMode = rhythm.engineMode || ENGINE_MODE_CLICK
  const isDrums = engineMode === ENGINE_MODE_DRUMS
  const drumPattern = rhythm.drumPattern
  const subdivisionOptions = useMemo(function() {
    return getEditorSubdivisionOptions(rhythm)
  }, [rhythm.beatsPerBar, rhythm.pulsesPerBeat])
  const effectiveSubdivision = useMemo(function() {
    if (subdivisionOptions.some(function(option) { return option.id === editorSubdivision })) {
      return editorSubdivision
    }
    return EDITOR_SUBDIVISION_PULSES
  }, [editorSubdivision, subdivisionOptions])
  const editorColumnCount = useMemo(function() {
    return getEditorSlotCount(rhythm, effectiveSubdivision)
  }, [rhythm, effectiveSubdivision])
  const showGrid = isDrums && drumPattern

  const searchablePresets = useMemo(function() {
    return getSearchableRhythmPresets(rhythm, {
      engineMode: engineMode,
      query: presetFilter,
      userPresets: userPresets,
    })
  }, [presetFilter, engineMode, rhythm, userPresets])

  const groupedPresets = useMemo(function() {
    return groupPresetsForPicker(searchablePresets, rhythm)
  }, [searchablePresets, rhythm])

  const canSavePattern = isDrums && drumPattern && !disabled
  const showSaveButton = canSavePattern && (!rhythm.presetId || !isUserDrumPresetId(rhythm.presetId))
  const hasMeterRow = showMeterControls && (
    props.onDrumVolumeChange != null
    || props.onBeatsPerBarChange != null
    || props.onPulsesForBeatChange != null
    || (isDrums && subdivisionOptions.length > 0)
    || (isDrums && drumPattern)
  )

  useEffect(function() {
    if (!presetOpen) return
    function onPointerDown(event) {
      if (!presetPickerRef.current || presetPickerRef.current.contains(event.target)) return
      setPresetOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return function() { document.removeEventListener('mousedown', onPointerDown) }
  }, [presetOpen])

  const commitPatternChange = useCallback(function(nextPattern, options) {
    if (!nextPattern || !props.onRhythmChange) return
    const opts = options || {}
    if (!opts.skipUndo && drumPattern) {
      undoStackRef.current = pushDrumPatternState(undoStackRef.current, drumPattern)
      forceUndoRender(function(n) { return n + 1 })
    }
    props.onRhythmChange(Object.assign({}, rhythm, {
      drumPattern: nextPattern,
      presetId: opts.keepPreset ? rhythm.presetId : '',
    }), { preserveTransport: !!opts.preserveTransport || recording })
  }, [drumPattern, props.onRhythmChange, recording, rhythm])

  function selectPreset(preset) {
    const next = applyRhythmPreset(preset.id)
    undoStackRef.current = createDrumPatternUndoStack(next.drumPattern)
    forceUndoRender(function(n) { return n + 1 })
    saveEditorSubdivision(EDITOR_SUBDIVISION_PULSES)
    setEditorSubdivision(EDITOR_SUBDIVISION_PULSES)
    if (props.onRhythmChange) {
      props.onRhythmChange(next)
    }
    setPresetOpen(false)
    setPresetFilter('')
  }

  function handleSubdivisionChange(nextSubdivision) {
    const previousSubdivision = effectiveSubdivision
    saveEditorSubdivision(nextSubdivision)
    setEditorSubdivision(nextSubdivision)
    if (!props.onRhythmChange) return
    const next = applyEditorSubdivision(rhythm, nextSubdivision, previousSubdivision)
    if (next === rhythm) return
    undoStackRef.current = createDrumPatternUndoStack(next.drumPattern)
    forceUndoRender(function(n) { return n + 1 })
    props.onRhythmChange(next)
  }

  function handleDeleteUserPreset(event, preset) {
    event.preventDefault()
    event.stopPropagation()
    if (!preset || !isUserDrumPresetId(preset.id)) return
    if (!window.confirm('Delete saved pattern “' + preset.label + '”?')) return
    removeUserPreset(preset.id).then(function() {
      if (rhythm.presetId === preset.id && props.onRhythmChange) {
        props.onRhythmChange(Object.assign({}, rhythm, { presetId: '' }))
      }
      toast.info('Deleted from My patterns')
    })
  }

  function handleSavePattern() {
    const label = saveLabel.trim()
    if (!label || !props.onRhythmChange) return
    setSaveBusy(true)
    saveUserPreset({ label: label, rhythm: rhythm }).then(function(preset) {
      const next = applyRhythmPreset(preset.id)
      props.onRhythmChange(next)
      setSaveOpen(false)
      setSaveLabel('')
      toast.success('Saved to My patterns')
    }).catch(function() {
      toast.error('Could not save pattern')
    }).finally(function() {
      setSaveBusy(false)
    })
  }

  function renderPresetGroup(title, items) {
    if (!items || items.length === 0) return null
    return (
      <div key={title} className="drum-pattern-editor__preset-category">
        <div className="drum-pattern-editor__preset-category-label">{title}</div>
        {items.map(function(preset) {
          const isUser = preset.category === PRESET_CATEGORY_MY_PATTERNS
          return (
            <div key={preset.id} className="drum-pattern-editor__preset-option-row">
              <button
                type="button"
                className="drum-pattern-editor__preset-option"
                onClick={function() { selectPreset(preset) }}
              >
                {preset.label}
              </button>
              {isUser ? (
                <button
                  type="button"
                  className="drum-pattern-editor__preset-delete"
                  aria-label={'Delete ' + preset.label}
                  title="Delete pattern"
                  onClick={function(e) { handleDeleteUserPreset(e, preset) }}
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  function changeSwing(value) {
    if (!drumPattern || !props.onRhythmChange) return
    commitPatternChange(setDrumSwing(drumPattern, value))
  }

  function handleUndo() {
    if (!canUndoDrumPattern(undoStackRef.current)) return
    const next = undoDrumPattern(undoStackRef.current)
    undoStackRef.current = next
    forceUndoRender(function(n) { return n + 1 })
    if (next.present && props.onRhythmChange) {
      props.onRhythmChange(Object.assign({}, rhythm, {
        drumPattern: next.present,
        presetId: '',
      }), { skipUndo: true })
    }
  }

  function handleRedo() {
    if (!canRedoDrumPattern(undoStackRef.current)) return
    const next = redoDrumPattern(undoStackRef.current)
    undoStackRef.current = next
    forceUndoRender(function(n) { return n + 1 })
    if (next.present && props.onRhythmChange) {
      props.onRhythmChange(Object.assign({}, rhythm, {
        drumPattern: next.present,
        presetId: '',
      }), { skipUndo: true })
    }
  }

  const stopRecording = useCallback(function() {
    setRecording(false)
    setCountInBarsRemaining(0)
    countInRef.current = 0
    recordSessionRef.current = null
    if (props.onRecordingStop) props.onRecordingStop()
  }, [props.onRecordingStop])

  const startRecording = useCallback(function() {
    if (!drumPattern || !recordingEnabled) return
    recordSessionRef.current = createRecordingSession({
      rhythm: rhythm,
      tempo: props.tempo || 120,
      initialPattern: drumPattern,
    })
    setRecording(true)
    countInRef.current = 1
    setCountInBarsRemaining(1)
    if (props.onRecordingStart) {
      props.onRecordingStart({
        onBarDownbeat: function(time) {
          const session = recordSessionRef.current
          if (!session) return
          if (countInRef.current > 0) {
            countInRef.current -= 1
            setCountInBarsRemaining(countInRef.current)
            if (countInRef.current <= 0) {
              session.arm()
              session.setDownbeatTime(time)
            }
          } else {
            session.setDownbeatTime(time)
          }
        },
      })
    }
  }, [drumPattern, props.onRecordingStart, props.tempo, recordingEnabled, rhythm])

  function toggleRecording() {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  function handlePadHit(trackId) {
    if (!props.audioContext) return
    const track = DRUM_TRACK_DEFAULTS.find(function(t) { return t.id === trackId })
    if (track) {
      auditionDrumSample(props.audioContext, track.sample, track.velocity)
    }
    if (!recording || !recordSessionRef.current) return
    const preferredSlot = props.activeSlot != null && props.activeSlot >= 0
      ? props.activeSlot
      : null
    const result = recordSessionRef.current.noteHit(
      trackId,
      props.audioContext.currentTime,
      preferredSlot
    )
    if (!result) return
    commitPatternChange(result.pattern, { skipUndo: true, preserveTransport: true })
    setFlashSlot({ trackId: result.trackId, slotIndex: result.slotIndex })
    setTimeout(function() { setFlashSlot(null) }, 120)
  }

  function handleUndoHit() {
    const session = recordSessionRef.current
    if (!session) return
    const pattern = session.undoLastHit()
    if (pattern) commitPatternChange(pattern, { skipUndo: true })
  }

  useEffect(function() {
    if (drumPattern && !undoStackRef.current.present) {
      undoStackRef.current = createDrumPatternUndoStack(drumPattern)
    }
  }, [drumPattern && drumPattern.resolution])

  useEffect(function() {
    const activeSlot = props.activeSlot
    if (activeSlot == null || activeSlot < 0) return
    if (prevActiveSlotRef.current >= 0 && activeSlot === 0 && prevActiveSlotRef.current !== 0) {
      if (recording && recordSessionRef.current && countInRef.current > 0) {
        countInRef.current -= 1
        setCountInBarsRemaining(countInRef.current)
        if (countInRef.current <= 0) {
          recordSessionRef.current.arm()
          if (props.audioContext) {
            recordSessionRef.current.setDownbeatTime(props.audioContext.currentTime)
          }
        }
      }
    }
    prevActiveSlotRef.current = activeSlot
  }, [props.activeSlot, recording, props.audioContext])

  useEffect(function() {
    function onKeyDown(e) {
      if (!editorRef.current || !editorRef.current.contains(document.activeElement)
          && document.activeElement !== editorRef.current) {
        return
      }
      if (!isDrums || disabled) return
      const key = e.key
      if (key >= '1' && key <= '5') {
        const index = parseInt(key, 10) - 1
        if (recording) {
          e.preventDefault()
          handlePadHit(DRUM_TRACK_IDS[index])
        } else {
          setSelectedTrackIndex(index)
        }
        return
      }
      if (key === ' ' && showGrid && drumPattern) {
        e.preventDefault()
        const trackId = DRUM_TRACK_IDS[selectedTrackIndex]
        if (trackId) {
          const track = drumPattern.tracks.find(function(t) { return t.id === trackId })
          if (effectiveSubdivision === EDITOR_SUBDIVISION_HALF_PULSES
              || effectiveSubdivision === EDITOR_SUBDIVISION_PULSES) {
            const steps = track && track.steps ? track.steps : []
            const stepIndex = selectedStep % steps.length
            commitPatternChange(
              toggleDrumStep(drumPattern, trackId, stepIndex)
            )
          } else if (track) {
            const beatIndex = selectedStep % rhythm.beatsPerBar
            const on = !beatGroupIsOn(track, rhythm, beatIndex)
            commitPatternChange(setDrumBeatSteps(drumPattern, trackId, beatIndex, rhythm, on))
          }
        }
        return
      }
      if (key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedStep(function(s) { return Math.max(0, s - 1) })
        return
      }
      if (key === 'ArrowRight') {
        e.preventDefault()
        setSelectedStep(function(s) { return Math.min(editorColumnCount - 1, s + 1) })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return function() { window.removeEventListener('keydown', onKeyDown) }
  })

  function renderMeterControls() {
    if (!hasMeterRow) return null
    return (
      <div className="drum-pattern-editor__section drum-pattern-editor__section--meter">
        <div className="drum-pattern-editor__meter-row drum-pattern-editor__meter-row--primary">
          {props.onBeatsPerBarChange != null ? (
            <label className="drum-pattern-editor__beats-control">
              <span className="drum-pattern-editor__control-label">Beats</span>
              <Form.Control
                type="number"
                size="sm"
                className="drum-pattern-editor__beats-input"
                min={1}
                max={16}
                disabled={disabled}
                aria-label="Beats per bar"
                value={rhythm.beatsPerBar}
                onChange={function(e) {
                  const next = parseInt(e.target.value, 10)
                  if (!Number.isNaN(next)) {
                    props.onBeatsPerBarChange(next)
                  }
                }}
              />
            </label>
          ) : null}

          {props.onPulsesForBeatChange != null ? (
            <div className="drum-pattern-editor__pulses-control" aria-label="Pulses per beat">
              <span className="drum-pattern-editor__control-label">Pulses</span>
              {rhythm.pulsesPerBeat.map(function(pulses, beatIndex) {
                return (
                  <select
                    key={'pulses-' + beatIndex}
                    className="drum-pattern-editor__pulse-select"
                    value={pulses}
                    disabled={disabled}
                    aria-label={'Pulses for beat ' + (beatIndex + 1)}
                    title={'Pulses for beat ' + (beatIndex + 1)}
                    onChange={function(e) {
                      props.onPulsesForBeatChange(beatIndex, parseInt(e.target.value, 10))
                    }}
                  >
                    {METRONOME_PULSE_OPTIONS.map(function(option) {
                      return (
                        <option key={option} value={option}>{option}</option>
                      )
                    })}
                  </select>
                )
              })}
            </div>
          ) : null}

          {isDrums && subdivisionOptions.length > 0 ? (
            <div
              className="drum-pattern-editor__granularity-row"
              title={editorSubdivisionHint(rhythm, effectiveSubdivision)}
            >
              <span className="drum-pattern-editor__granularity-label">Subdivision</span>
              {compact ? (
                <Form.Select
                  size="sm"
                  className="drum-pattern-editor__granularity-select"
                  disabled={disabled}
                  aria-label="Editor subdivision"
                  value={effectiveSubdivision}
                  onChange={function(e) {
                    handleSubdivisionChange(e.target.value)
                  }}
                >
                  {subdivisionOptions.map(function(option) {
                    return (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    )
                  })}
                </Form.Select>
              ) : (
                <ButtonGroup size="sm" aria-label="Editor subdivision">
                  {subdivisionOptions.map(function(option) {
                    return (
                      <Button
                        key={option.id}
                        variant={effectiveSubdivision === option.id ? 'primary' : 'outline-primary'}
                        disabled={disabled}
                        onClick={function() { handleSubdivisionChange(option.id) }}
                      >
                        {option.label}
                      </Button>
                    )
                  })}
                </ButtonGroup>
              )}
            </div>
          ) : null}
        </div>

        <div className="drum-pattern-editor__meter-row drum-pattern-editor__meter-row--volume-swing">
          {props.onDrumVolumeChange != null ? (
            <label className="drum-pattern-editor__volume-control">
              <span className="drum-pattern-editor__control-label">Volume</span>
              <input
                type="range"
                className="drum-pattern-editor__volume-slider"
                min="0"
                max="100"
                step="1"
                disabled={disabled}
                value={Math.round((props.drumVolume != null ? props.drumVolume : 0) * 100)}
                aria-label="Drum volume"
                onChange={function(e) {
                  props.onDrumVolumeChange(parseInt(e.target.value, 10) / 100)
                }}
              />
              <span className="drum-pattern-editor__volume-value">
                {Math.round((props.drumVolume != null ? props.drumVolume : 0) * 100)}
              </span>
            </label>
          ) : null}

          {isDrums && drumPattern ? (
            <div className="drum-pattern-editor__swing-row">
              <span className="drum-pattern-editor__swing-label">Swing</span>
              <input
                type="range"
                className="drum-pattern-editor__swing-slider"
                min="0"
                max="50"
                step="1"
                disabled={disabled}
                value={Math.round((drumPattern.swing || 0) * 100)}
                aria-label="Swing amount"
                onChange={function(e) {
                  changeSwing(parseInt(e.target.value, 10) / 100)
                }}
              />
              <ButtonGroup size="sm" aria-label="Swing presets">
                {SWING_OPTIONS.map(function(option) {
                  const currentSwing = drumPattern.swing || 0
                  const isActive = Math.abs(currentSwing - option.value) < 0.01
                  return (
                    <Button
                      key={option.label}
                      variant={isActive ? 'primary' : 'outline-primary'}
                      disabled={disabled}
                      onClick={function() { changeSwing(option.value) }}
                    >
                      {option.label}
                    </Button>
                  )
                })}
              </ButtonGroup>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={editorRef}
      className={'drum-pattern-editor' + (compact ? ' drum-pattern-editor--compact' : '')}
      tabIndex={-1}
    >
      <div className="drum-pattern-editor__mode-row">
        <ButtonGroup aria-label="Sound mode">
          <Button
            variant={engineMode === ENGINE_MODE_CLICK ? 'primary' : 'outline-primary'}
            disabled={disabled}
            onClick={function() {
              if (props.onEngineModeChange) props.onEngineModeChange(ENGINE_MODE_CLICK)
            }}
          >
            Click
          </Button>
          <Button
            variant={engineMode === ENGINE_MODE_DRUMS ? 'primary' : 'outline-primary'}
            disabled={disabled}
            onClick={function() {
              if (props.onEngineModeChange) props.onEngineModeChange(ENGINE_MODE_DRUMS)
            }}
          >
            Drums
          </Button>
        </ButtonGroup>
      </div>

      {isDrums ? (
        <>
          {hasMeterRow ? <SectionDivider /> : null}
          {renderMeterControls()}
          {hasMeterRow ? <SectionDivider /> : null}

          {recordingEnabled && drumPattern ? (
            <>
              <div className="drum-pattern-editor__section drum-pattern-editor__section--record">
                <DrumRecordPads
                  disabled={disabled}
                  recording={recording}
                  flashSlot={flashSlot}
                  audioContext={props.audioContext}
                  onToggleRecord={toggleRecording}
                  onPadHit={handlePadHit}
                  onUndoHit={handleUndoHit}
                />
                {recording && countInBarsRemaining > 0 ? (
                  <p className="drum-pattern-editor__count-in text-muted small">Count-in…</p>
                ) : null}
              </div>
              <SectionDivider />
            </>
          ) : null}

          {showGrid ? (
            <div className="drum-pattern-editor__section drum-pattern-editor__section--pattern">
              <div className="drum-pattern-editor__pattern-header">
                <div className="drum-pattern-editor__preset-picker" ref={presetPickerRef}>
                  <Button
                    variant="outline-secondary"
                    className="drum-pattern-editor__preset-icon-button"
                    disabled={disabled}
                    aria-expanded={presetOpen}
                    aria-label="Load pattern template"
                    title="Load pattern template"
                    onClick={function() { setPresetOpen(!presetOpen) }}
                  >
                    {icons.wizard}
                  </Button>
                  {presetOpen ? (
                    <div className="drum-pattern-editor__preset-menu">
                      <input
                        type="search"
                        className="drum-pattern-editor__preset-search"
                        placeholder="Search templates…"
                        value={presetFilter}
                        onChange={function(e) { setPresetFilter(e.target.value) }}
                      />
                      {groupedPresets.myPatterns.length > 0
                        ? renderPresetGroup('My patterns', groupedPresets.myPatterns)
                        : null}
                      {renderPresetGroup('Matching grid', groupedPresets.exact)}
                      {renderPresetGroup('Other patterns (changes grid)', groupedPresets.compatible)}
                      {searchablePresets.length === 0 ? (
                        <p className="drum-pattern-editor__preset-empty text-muted small">
                          No patterns for this meter — try changing subdivision above
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {showSaveButton ? (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={disabled || saveBusy}
                    onClick={function() {
                      setSaveLabel('')
                      setSaveOpen(!saveOpen)
                    }}
                  >
                    Save pattern…
                  </Button>
                ) : null}
              </div>

              {saveOpen ? (
                <div className="drum-pattern-editor__save-row">
                  <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Pattern name"
                    value={saveLabel}
                    disabled={disabled || saveBusy}
                    onChange={function(e) { setSaveLabel(e.target.value) }}
                    onKeyDown={function(e) {
                      if (e.key === 'Enter') handleSavePattern()
                    }}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={disabled || saveBusy || !saveLabel.trim()}
                    onClick={handleSavePattern}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={saveBusy}
                    onClick={function() { setSaveOpen(false) }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}

              <DrumPatternToolbar
                drumPattern={drumPattern}
                disabled={disabled}
                canUndo={canUndoDrumPattern(undoStackRef.current)}
                canRedo={canRedoDrumPattern(undoStackRef.current)}
                showVelocityLanes={showVelocityLanes}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onToggleVelocityLanes={function() { setShowVelocityLanes(!showVelocityLanes) }}
                onPatternChange={commitPatternChange}
              />
              <DrumPatternGrid
                rhythm={rhythm}
                drumPattern={drumPattern}
                subdivision={effectiveSubdivision}
                totalSlots={editorColumnCount}
                disabled={disabled}
                activeSlot={props.activeSlot}
                selectedTrackIndex={selectedTrackIndex}
                selectedStep={selectedStep}
                showVelocityLanes={showVelocityLanes}
                flashSlot={flashSlot}
                audioContext={props.audioContext}
                tracks={drumPattern.tracks}
                onPatternChange={commitPatternChange}
                onSelectionChange={function(trackId, stepIndex) {
                  const idx = DRUM_TRACK_IDS.indexOf(trackId)
                  if (idx >= 0) setSelectedTrackIndex(idx)
                  if (stepIndex != null) setSelectedStep(stepIndex)
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
