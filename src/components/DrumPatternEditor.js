import { useMemo, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import {
  ALL_RHYTHM_PRESETS,
  DRUM_PRESET_CATEGORIES,
  applyRhythmPreset,
  presetLabelForId,
  presetMatchesRhythm,
} from '../drumPatternPresets'
import {
  ENGINE_MODE_CLICK,
  ENGINE_MODE_DRUMS,
  toggleDrumStep,
  setDrumSwing,
} from '../rhythmEngineTypes'
import { slotsPerBar, slotBeatIndex } from '../metronomeRhythmPresets'
import './DrumPatternEditor.css'

const SWING_OPTIONS = [
  { label: 'Straight', value: 0 },
  { label: 'Light', value: 0.15 },
  { label: 'Medium', value: 0.33 },
]

export default function DrumPatternEditor(props) {
  const rhythm = props.rhythm
  const disabled = !!props.disabled
  const compact = !!props.compact
  const [presetOpen, setPresetOpen] = useState(false)
  const [presetFilter, setPresetFilter] = useState('')
  const [editOpen, setEditOpen] = useState(false)

  const engineMode = rhythm.engineMode || ENGINE_MODE_CLICK
  const isDrums = engineMode === ENGINE_MODE_DRUMS
  const totalSlots = slotsPerBar(rhythm)
  const drumPattern = rhythm.drumPattern

  const filteredPresets = useMemo(function() {
    const query = presetFilter.trim().toLowerCase()
    const categoryFilter = props.presetCategory || null
    return ALL_RHYTHM_PRESETS.filter(function(preset) {
      if (categoryFilter && preset.category !== categoryFilter) return false
      if (engineMode === ENGINE_MODE_CLICK && preset.engineMode !== ENGINE_MODE_CLICK) return false
      if (engineMode === ENGINE_MODE_DRUMS && preset.engineMode !== ENGINE_MODE_DRUMS) return false
      if (engineMode === ENGINE_MODE_DRUMS && !presetMatchesRhythm(preset, rhythm)) return false
      if (!query) return true
      return preset.label.toLowerCase().includes(query)
        || preset.category.toLowerCase().includes(query)
        || preset.id.toLowerCase().includes(query)
    })
  }, [presetFilter, engineMode, props.presetCategory, rhythm])

  function selectPreset(preset) {
    const next = applyRhythmPreset(preset.id)
    if (props.onRhythmChange) {
      props.onRhythmChange(next)
    }
    setPresetOpen(false)
  }

  function toggleStep(trackId, stepIndex) {
    if (!drumPattern || !props.onRhythmChange) return
    const nextPattern = toggleDrumStep(drumPattern, trackId, stepIndex)
    props.onRhythmChange(Object.assign({}, rhythm, {
      drumPattern: nextPattern,
      presetId: '',
    }))
  }

  function changeSwing(value) {
    if (!drumPattern || !props.onRhythmChange) return
    props.onRhythmChange(Object.assign({}, rhythm, {
      drumPattern: setDrumSwing(drumPattern, value),
      presetId: '',
    }))
  }

  const presetLabel = rhythm.presetId
    ? presetLabelForId(rhythm.presetId)
  : (isDrums ? 'Custom pattern' : '')

  const gridColumnTemplate = '3.25rem repeat(' + totalSlots + ', 1.35rem)'

  return (
    <div className={'drum-pattern-editor' + (compact ? ' drum-pattern-editor--compact' : '')}>
      <div className="drum-pattern-editor__preset-row">
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

        {isDrums ? (
          <div className="drum-pattern-editor__preset-picker">
            <Button
              variant="outline-secondary"
              className="drum-pattern-editor__preset-button"
              disabled={disabled}
              aria-expanded={presetOpen}
              onClick={function() { setPresetOpen(!presetOpen) }}
            >
              {presetLabel || 'Choose preset'}
            </Button>
            {presetOpen ? (
              <div className="drum-pattern-editor__preset-menu">
                <input
                  type="search"
                  className="drum-pattern-editor__preset-search"
                  placeholder="Search presets…"
                  value={presetFilter}
                  onChange={function(e) { setPresetFilter(e.target.value) }}
                />
                {DRUM_PRESET_CATEGORIES.map(function(category) {
                  const items = filteredPresets.filter(function(p) { return p.category === category })
                  if (items.length === 0) return null
                  return (
                    <div key={category} className="drum-pattern-editor__preset-category">
                      <div className="drum-pattern-editor__preset-category-label">{category}</div>
                      {items.map(function(preset) {
                        const isActive = rhythm.presetId === preset.id
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={'drum-pattern-editor__preset-option' + (isActive ? ' is-active' : '')}
                            onClick={function() { selectPreset(preset) }}
                          >
                            {preset.label}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isDrums && !compact ? (
        <div className="drum-pattern-editor__swing-row">
          <span className="drum-pattern-editor__swing-label">Swing</span>
          <ButtonGroup aria-label="Swing amount">
            {SWING_OPTIONS.map(function(option) {
              const currentSwing = drumPattern ? drumPattern.swing : 0
              const isActive = Math.abs(currentSwing - option.value) < 0.01
              return (
                <Button
                  key={option.label}
                  variant={isActive ? 'primary' : 'outline-primary'}
                  size="sm"
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

      {isDrums && drumPattern && !compact ? (
        <div className="drum-pattern-editor__grid-section">
          <Button
            variant="link"
            className="drum-pattern-editor__edit-toggle"
            disabled={disabled}
            onClick={function() { setEditOpen(!editOpen) }}
          >
            {editOpen ? 'Hide pattern editor' : 'Edit pattern'}
          </Button>
          {editOpen ? (
            <div className="drum-pattern-editor__grid-wrap">
              <div className="drum-pattern-editor__grid" role="grid" aria-label="Drum pattern">
                <div
                  className="drum-pattern-editor__grid-header"
                  role="row"
                  style={{ gridTemplateColumns: gridColumnTemplate }}
                >
                  <div className="drum-pattern-editor__grid-label-cell" role="columnheader" />
                  {Array.from({ length: totalSlots }).map(function(_, slotIndex) {
                    const beatIndex = slotBeatIndex(rhythm, slotIndex)
                    const isBeatStart = slotIndex === 0 || slotBeatIndex(rhythm, slotIndex - 1) !== beatIndex
                    return (
                      <div
                        key={'hdr-' + slotIndex}
                        className={'drum-pattern-editor__grid-slot-header'
                          + (isBeatStart ? ' is-beat-start' : '')
                          + (slotIndex === props.activeSlot ? ' is-active' : '')}
                        role="columnheader"
                      >
                        {isBeatStart ? (beatIndex + 1) : ''}
                      </div>
                    )
                  })}
                </div>
                {(drumPattern.tracks || []).map(function(track) {
                  return (
                    <div
                      key={track.id}
                      className="drum-pattern-editor__grid-row"
                      role="row"
                      style={{ gridTemplateColumns: gridColumnTemplate }}
                    >
                      <div className="drum-pattern-editor__grid-label-cell" role="rowheader">{track.label}</div>
                      {(track.steps || []).map(function(step, stepIndex) {
                        const isActive = stepIndex === props.activeSlot
                        const beatIndex = slotBeatIndex(rhythm, stepIndex)
                        const isBeatStart = stepIndex === 0 || slotBeatIndex(rhythm, stepIndex - 1) !== beatIndex
                        return (
                          <button
                            key={track.id + '-' + stepIndex}
                            type="button"
                            className={'drum-pattern-editor__grid-cell'
                              + (step ? ' is-on' : '')
                              + (isActive ? ' is-active' : '')
                              + (isBeatStart ? ' is-beat-start' : '')}
                            disabled={disabled}
                            aria-label={track.label + ' step ' + (stepIndex + 1)}
                            onClick={function() { toggleStep(track.id, stepIndex) }}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
