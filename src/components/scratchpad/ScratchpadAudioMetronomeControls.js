import { useState } from 'react'
import { Button, ButtonGroup, Dropdown, Form, Modal } from 'react-bootstrap'
import MetronomePanel from '../MetronomePanel'
import DrumPatternEditor from '../DrumPatternEditor'
import { normalizeRhythmConfig, createRhythmConfig } from '../../rhythmEngineTypes'
import { SCRATCHPAD_DROPDOWN_POPPER } from '../../scratchpadDropdownPopper'

export default function ScratchpadAudioMetronomeControls(props) {
  const icons = props.icons || {}
  const [showSettings, setShowSettings] = useState(false)
  const enabled = !!props.metronomeEnabled
  const countInBars = props.countInBars != null ? props.countInBars : 0
  const rhythm = normalizeRhythmConfig(props.rhythmConfig || createRhythmConfig(4))
  const narrow = !!props.narrow
  const compact = !!props.compact

  const settingsPanel = (
    <>
      <MetronomePanel
        settingsOnly={true}
        showPreview={true}
        hideTempo={false}
        hideTransport={false}
        rhythm={rhythm}
        previewTempo={props.tempo}
        onTempoChange={props.onTempoChange}
        onRhythmChange={function(next) {
          if (next && next.rhythm && props.onRhythmConfigChange) {
            props.onRhythmConfigChange(next.rhythm)
          }
        }}
      />
      <div className="mb-2">
        <DrumPatternEditor
          rhythm={rhythm}
          compact={true}
          recordingEnabled={false}
          onEngineModeChange={function(mode) {
            if (props.onRhythmConfigChange) {
              props.onRhythmConfigChange(normalizeRhythmConfig(Object.assign({}, rhythm, { engineMode: mode })))
            }
          }}
          onRhythmChange={function(nextRhythm) {
            if (props.onRhythmConfigChange) props.onRhythmConfigChange(nextRhythm)
          }}
        />
      </div>
      <FormChecks props={props} />
      <CountInSelect countInBars={countInBars} onCountInChange={props.onCountInChange} />
    </>
  )

  const settingsMenu = (
    <Dropdown.Menu className="scratchpad-audio-metronome-settings-menu p-2" popperConfig={SCRATCHPAD_DROPDOWN_POPPER}>
      {settingsPanel}
    </Dropdown.Menu>
  )

  return (
    <>
      <Dropdown as={ButtonGroup} align="end" className="scratchpad-audio-metronome-group">
        <Button
          variant={enabled ? 'primary' : 'outline-secondary'}
          title={enabled ? 'Metronome on' : 'Metronome off'}
          aria-pressed={enabled}
          onClick={function() {
            if (props.onMetronomeEnabledChange) props.onMetronomeEnabledChange(!enabled)
          }}
        >
          <span className="scratchpad-audio-metronome-icon">{icons.metronome || (compact ? '♩' : 'Metro')}</span>
        </Button>
        {narrow ? (
          <Button
            variant="outline-secondary"
            title="Metronome settings"
            aria-label="Metronome settings"
            className="scratchpad-audio-dropdown-caret-toggle scratchpad-audio-dropdown-caret-toggle--button"
            onClick={function() { setShowSettings(true) }}
          />
        ) : (
          <>
            <Dropdown.Toggle
              split
              variant={enabled ? 'primary' : 'outline-secondary'}
              title="Metronome settings"
              aria-label="Metronome settings"
              id="scratchpad-metronome-settings-toggle"
            />
            {settingsMenu}
          </>
        )}
      </Dropdown>

      {narrow ? (
        <Modal show={showSettings} onHide={function() { setShowSettings(false) }} centered size="lg">
          <Modal.Header closeButton><Modal.Title>Metronome settings</Modal.Title></Modal.Header>
          <Modal.Body>{settingsPanel}</Modal.Body>
          <Modal.Footer>
            <Button variant="primary" onClick={function() { setShowSettings(false) }}>Done</Button>
          </Modal.Footer>
        </Modal>
      ) : null}
    </>
  )
}

function CountInSelect(props) {
  return (
    <Form.Group className="scratchpad-audio-metronome-countin mb-0 mt-2 pt-2 border-top">
      <Form.Label className="small mb-1">Count-in before record</Form.Label>
      <Form.Select
        size="sm"
        value={props.countInBars != null ? props.countInBars : 0}
        onChange={function(e) {
          if (props.onCountInChange) props.onCountInChange(parseInt(e.target.value, 10) || 0)
        }}
      >
        <option value="0">Off</option>
        <option value="1">1 bar</option>
        <option value="2">2 bars</option>
        <option value="4">4 bars</option>
      </Form.Select>
    </Form.Group>
  )
}

function FormChecks(props) {
  return (
    <div className="scratchpad-audio-metronome-options mt-2">
      <label className="small d-flex align-items-center gap-1 mb-1">
        <input
          type="checkbox"
          checked={!!props.metronomeDuringPlayback}
          onChange={function(e) {
            if (props.onMetronomeDuringPlaybackChange) props.onMetronomeDuringPlaybackChange(e.target.checked)
          }}
        />
        Clicks during playback
      </label>
      <label className="small d-flex align-items-center gap-1 mb-0">
        <input
          type="checkbox"
          checked={!!props.metronomeDuringRecording}
          onChange={function(e) {
            if (props.onMetronomeDuringRecordingChange) props.onMetronomeDuringRecordingChange(e.target.checked)
          }}
        />
        Clicks during recording
      </label>
    </div>
  )
}
