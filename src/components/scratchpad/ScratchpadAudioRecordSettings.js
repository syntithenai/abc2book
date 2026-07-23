import { Button, Dropdown, Form } from 'react-bootstrap'
import DrumPatternEditor from '../DrumPatternEditor'
import { normalizeRhythmConfig, createRhythmConfig } from '../../rhythmEngineTypes'

export default function ScratchpadAudioRecordSettings(props) {
  const tempo = props.tempo != null ? props.tempo : 120
  const countInBars = props.countInBars != null ? props.countInBars : 0
  const punchInEnabled = !!props.punchInEnabled
  const recordMode = props.recordMode || 'newTake'
  const rhythm = normalizeRhythmConfig(props.rhythmConfig || createRhythmConfig(4))

  return (
    <Dropdown className="scratchpad-audio-record-settings">
      <Dropdown.Toggle variant="outline-secondary" size="sm">
        Record settings
      </Dropdown.Toggle>
      <Dropdown.Menu className="scratchpad-audio-record-settings-menu p-3">
        <Form.Group className="mb-2">
          <Form.Label className="small mb-1">Tempo (BPM)</Form.Label>
          <Form.Control
            size="sm"
            type="number"
            min="20"
            max="300"
            value={tempo}
            onChange={function(e) {
              if (props.onTempoChange) props.onTempoChange(parseFloat(e.target.value) || 120)
            }}
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label className="small mb-1">Count-in</Form.Label>
          <Form.Control
            size="sm"
            as="select"
            value={countInBars}
            onChange={function(e) {
              if (props.onCountInChange) props.onCountInChange(parseInt(e.target.value, 10) || 0)
            }}
          >
            <option value="0">Off</option>
            <option value="1">1 bar</option>
            <option value="2">2 bars</option>
            <option value="4">4 bars</option>
          </Form.Control>
        </Form.Group>
        <div className="mb-2">
          <DrumPatternEditor
            rhythm={rhythm}
            compact={true}
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
        <Form.Check
          type="checkbox"
          className="mb-2 small"
          label="Punch-in (record into selection)"
          checked={punchInEnabled}
          onChange={function(e) {
            if (props.onPunchInChange) props.onPunchInChange(e.target.checked)
          }}
        />
        <Form.Group className="mb-0">
          <Form.Label className="small mb-1">Record mode</Form.Label>
          <Form.Control
            size="sm"
            as="select"
            value={recordMode}
            onChange={function(e) {
              if (props.onRecordModeChange) props.onRecordModeChange(e.target.value)
            }}
          >
            <option value="newTake">New take</option>
            <option value="replace">Replace take</option>
          </Form.Control>
        </Form.Group>
        {props.onSnapChange ? (
          <Form.Check
            type="checkbox"
            className="mb-0 mt-2 small"
            label="Snap to grid"
            checked={!!props.snapToGrid}
            onChange={function(e) { props.onSnapChange(e.target.checked) }}
          />
        ) : null}
        {props.onOpenSettings ? (
          <Button variant="link" size="sm" className="px-0 mt-2" onClick={props.onOpenSettings}>
            Audio &amp; MIDI settings…
          </Button>
        ) : null}
      </Dropdown.Menu>
    </Dropdown>
  )
}
