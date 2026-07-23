import { useState } from 'react'
import { Button, ButtonGroup, Dropdown, Modal } from 'react-bootstrap'
import MetronomePanel from '../MetronomePanel'
import { normalizeRhythmConfig, createRhythmConfig } from '../../rhythmEngineTypes'

const COUNT_IN_CYCLE = [0, 1, 2, 4]

function nextCountInBars(current) {
  const idx = COUNT_IN_CYCLE.indexOf(current != null ? current : 0)
  const next = idx < 0 ? 0 : (idx + 1) % COUNT_IN_CYCLE.length
  return COUNT_IN_CYCLE[next]
}

export default function ScratchpadAudioMetronomeControls(props) {
  const icons = props.icons || {}
  const [showSettings, setShowSettings] = useState(false)
  const enabled = !!props.metronomeEnabled
  const countInBars = props.countInBars != null ? props.countInBars : 0
  const rhythm = normalizeRhythmConfig(props.rhythmConfig || createRhythmConfig(4))
  const narrow = !!props.narrow

  function cycleCountIn() {
    if (!props.onCountInChange) return
    props.onCountInChange(nextCountInBars(countInBars))
  }

  const settingsPanel = (
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
  )

  return (
    <>
      <div className="scratchpad-audio-metronome-controls">
        <ButtonGroup size="sm">
          <Button
            variant={enabled ? 'primary' : 'outline-secondary'}
            title={enabled ? 'Metronome on' : 'Metronome off'}
            aria-pressed={enabled}
            onClick={function() {
              if (props.onMetronomeEnabledChange) props.onMetronomeEnabledChange(!enabled)
            }}
          >
            <span className="scratchpad-audio-metronome-icon">{icons.metronome || 'Metro'}</span>
          </Button>
          {enabled ? (
            <Button
              variant="outline-secondary"
              title="Count-in bars (click to cycle)"
              onClick={cycleCountIn}
            >
              {countInBars > 0 ? countInBars + ' bar' + (countInBars > 1 ? 's' : '') : 'No count-in'}
            </Button>
          ) : null}
          {narrow ? (
            <Button
              variant="outline-secondary"
              title="Metronome settings"
              onClick={function() { setShowSettings(true) }}
            >
              …
            </Button>
          ) : (
            <Dropdown align="end">
              <Dropdown.Toggle variant="outline-secondary" title="Metronome settings">
                …
              </Dropdown.Toggle>
              <Dropdown.Menu className="scratchpad-audio-metronome-settings-menu p-2">
                {settingsPanel}
                <FormChecks props={props} />
              </Dropdown.Menu>
            </Dropdown>
          )}
        </ButtonGroup>
      </div>

      {narrow ? (
        <Modal show={showSettings} onHide={function() { setShowSettings(false) }} centered size="lg">
          <Modal.Header closeButton><Modal.Title>Metronome settings</Modal.Title></Modal.Header>
          <Modal.Body>{settingsPanel}<FormChecks props={props} /></Modal.Body>
          <Modal.Footer>
            <Button variant="primary" onClick={function() { setShowSettings(false) }}>Done</Button>
          </Modal.Footer>
        </Modal>
      ) : null}
    </>
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
