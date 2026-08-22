import { Button, Form, Modal } from 'react-bootstrap'
import { FormLabelWithHelp } from './FormFieldHelp'
import { PLAYALONG_FIELD_HELP } from '../formFieldHelpText'
import {
  PLAYALONG_INSTRUMENTS,
  clampCutoffPercent,
  clampPlayalongRepeats,
} from '../playalongSettings'
import {
  referenceGainToSliderPercent,
  sliderPercentToReferenceGain,
} from '../practiceSessionSettings'

export default function PlayalongRecordConfigModal(props) {
  const settings = props.settings || {}
  const tempoBpm = Number.isFinite(props.tempoBpm) && props.tempoBpm > 0 ? props.tempoBpm : 120
  const cutoffPercent = clampCutoffPercent(settings.cutoffPercent)
  const volumePercent = referenceGainToSliderPercent(settings.playbackGain)
  const instrumentId = settings.instrumentId || 'whistle'
  const repeats = clampPlayalongRepeats(settings.repeats)
  const canClear = !!props.canClear
  const hasExistingTakes = !!props.hasExistingTakes

  function patchSettings(partial) {
    if (props.onSettingsChange) {
      props.onSettingsChange(Object.assign({}, settings, partial))
    }
  }

  return (
    <Modal
      show={!!props.show}
      onHide={props.onHide}
      centered
      size="md"
    >
      <Modal.Header closeButton>
        <Modal.Title>Record play-along</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
            Tempo: {Math.round(tempoBpm)} bpm
          </div>
          <Form.Range
            min={40}
            max={240}
            step={1}
            value={tempoBpm}
            data-testid="playalong-tempo-slider"
            onChange={function(e) {
              if (props.onTempoChange) props.onTempoChange(parseFloat(e.target.value))
            }}
          />
        </div>
        <div style={{ marginBottom: '0.85rem' }}>
          <FormLabelWithHelp
            label={'Cutoff: ' + cutoffPercent + '%'}
            helpTitle={PLAYALONG_FIELD_HELP.cutoff.title}
            helpBody={PLAYALONG_FIELD_HELP.cutoff.body}
          />
          <Form.Range
            min={0}
            max={100}
            step={1}
            value={cutoffPercent}
            data-testid="playalong-cutoff-slider"
            onChange={function(e) {
              patchSettings({ cutoffPercent: parseFloat(e.target.value) })
            }}
          />
        </div>
        <div style={{ marginBottom: '0.85rem' }}>
          <FormLabelWithHelp
            label={'Playback volume: ' + volumePercent + '%'}
            helpTitle={PLAYALONG_FIELD_HELP.playbackVolume.title}
            helpBody={PLAYALONG_FIELD_HELP.playbackVolume.body}
          />
          <Form.Range
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            data-testid="playalong-volume-slider"
            onChange={function(e) {
              patchSettings({ playbackGain: sliderPercentToReferenceGain(e.target.value) })
            }}
          />
          <div className="text-muted small" style={{ marginTop: '0.35rem' }} data-testid="playalong-output-latency-note">
            {PLAYALONG_FIELD_HELP.outputLatency.body}
          </div>
        </div>
        <div style={{ marginBottom: '0.85rem' }}>
          <FormLabelWithHelp
            label="Instrument"
            helpTitle={PLAYALONG_FIELD_HELP.instrument.title}
            helpBody={PLAYALONG_FIELD_HELP.instrument.body}
            htmlFor="playalong-instrument-select"
          />
          <Form.Select
            id="playalong-instrument-select"
            data-testid="playalong-instrument-select"
            value={instrumentId}
            onChange={function(e) {
              patchSettings({ instrumentId: e.target.value })
            }}
          >
            {PLAYALONG_INSTRUMENTS.map(function(item) {
              return (
                <option key={item.id} value={item.id}>{item.label}</option>
              )
            })}
          </Form.Select>
          <div className="text-muted small" style={{ marginTop: '0.35rem' }}>
            Tracking follows one melody line. Chords and drones are not tracked.
          </div>
        </div>
        <div style={{ marginBottom: '0.85rem' }}>
          <FormLabelWithHelp
            label="Repeats"
            helpTitle={PLAYALONG_FIELD_HELP.repeats.title}
            helpBody={PLAYALONG_FIELD_HELP.repeats.body}
            htmlFor="playalong-repeats-input"
          />
          <Form.Control
            id="playalong-repeats-input"
            type="number"
            min={1}
            max={10}
            step={1}
            value={repeats}
            data-testid="playalong-repeats-input"
            onChange={function(e) {
              patchSettings({ repeats: clampPlayalongRepeats(e.target.value) })
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline-danger"
          data-testid="playalong-clear-recordings"
          disabled={!canClear}
          onClick={function(e) {
            e.preventDefault()
            e.stopPropagation()
            if (props.onClearTakes) props.onClearTakes()
          }}
        >
          Clear recordings
        </Button>
      </Modal.Body>
      <Modal.Footer>
        {hasExistingTakes ? (
          <Button
            type="button"
            variant="outline-primary"
            className="me-auto"
            data-testid="playalong-compare-existing"
            onClick={function() {
              if (props.onCompareExisting) props.onCompareExisting(settings)
            }}
          >
            Compare existing
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={props.onHide}
        >
          Close
        </Button>
        <Button
          type="button"
          variant="primary"
          data-testid="playalong-start-recording"
          onClick={function() {
            if (props.onStart) props.onStart(settings)
          }}
        >
          Start
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
