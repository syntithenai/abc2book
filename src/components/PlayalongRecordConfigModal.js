import { Button, Form, Modal } from 'react-bootstrap'
import { useEffect, useRef, useState } from 'react'
import { FormLabelWithHelp } from './FormFieldHelp'
import { PLAYALONG_FIELD_HELP } from '../formFieldHelpText'
import {
  PLAYALONG_INSTRUMENTS,
  clampCutoffPercent,
  clampPlayalongRepeats,
} from '../playalongSettings'
import {
  PLAYALONG_TEMPO_MULTIPLIER_MAX,
  PLAYALONG_TEMPO_MULTIPLIER_MIN,
  clampPlayalongTempoMultiplier,
} from '../bulkPlayalongSession'
import {
  referenceGainToSliderPercent,
  sliderPercentToReferenceGain,
} from '../practiceSessionSettings'
import PlayalongClapCalibrationModal from './PlayalongClapCalibrationModal'

export default function PlayalongRecordConfigModal(props) {
  const settings = props.settings || {}
  const tempoBpm = Number.isFinite(props.tempoBpm) && props.tempoBpm > 0 ? props.tempoBpm : 120
  const cutoffPercent = clampCutoffPercent(settings.cutoffPercent)
  const volumePercent = referenceGainToSliderPercent(settings.playbackGain)
  const instrumentId = settings.instrumentId || 'whistle'
  const repeats = clampPlayalongRepeats(settings.repeats)
  const calibratedMs = settings.calibratedOutputLatencySeconds > 0
    ? Math.round(settings.calibratedOutputLatencySeconds * 1000)
    : null
  const canClear = !!props.canClear
  const [showCalibration, setShowCalibration] = useState(false)
  const settingsRef = useRef(settings)
  const onStartRef = useRef(props.onStart)
  settingsRef.current = settings
  onStartRef.current = props.onStart

  function patchSettings(partial) {
    if (props.onSettingsChange) {
      props.onSettingsChange(Object.assign({}, settings, partial))
    }
  }

  function startRecording() {
    if (onStartRef.current) onStartRef.current(settingsRef.current)
  }

  useEffect(function() {
    if (!props.show || showCalibration) return undefined
    function onKeyDown(e) {
      if (e.code !== 'Space' && e.key !== ' ') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      if (target) {
        const tag = String(target.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if (target.isContentEditable) return
      }
      e.preventDefault()
      startRecording()
    }
    window.addEventListener('keydown', onKeyDown)
    return function() {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [props.show, showCalibration])

  return (
    <>
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
        {props.bulkTuneCount > 0 ? (
          <div
            className="text-muted"
            style={{ marginBottom: '0.85rem' }}
            data-testid="playalong-bulk-summary"
          >
            {props.bulkTuneCount} tune{props.bulkTuneCount === 1 ? '' : 's'} selected
            {props.bulkDurationLabel ? (
              <>
                {' · '}
                {props.bulkDurationLabel} total with {repeats} repeat{repeats === 1 ? '' : 's'}
              </>
            ) : null}
          </div>
        ) : null}
        {props.tempoAsMultiplier ? (
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
            Tempo: {Math.round(clampPlayalongTempoMultiplier(props.tempoMultiplier) * 100)}% of written
          </div>
          <Form.Range
            min={PLAYALONG_TEMPO_MULTIPLIER_MIN * 100}
            max={PLAYALONG_TEMPO_MULTIPLIER_MAX * 100}
            step={5}
            value={Math.round(clampPlayalongTempoMultiplier(props.tempoMultiplier) * 100)}
            data-testid="playalong-tempo-slider"
            onChange={function(e) {
              if (props.onTempoMultiplierChange) {
                props.onTempoMultiplierChange(parseFloat(e.target.value) / 100)
              }
            }}
          />
          <div className="text-muted small" style={{ marginTop: '0.35rem' }}>
            Multiplies each tune&apos;s written tempo (or 100 bpm when unset).
          </div>
        </div>
        ) : (
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
        )}
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
          <div style={{ marginTop: '0.5rem' }}>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              data-testid="playalong-open-calibration"
              onClick={function() { setShowCalibration(true) }}
            >
              Calibrate latency…
            </Button>
            {calibratedMs != null ? (
              <span className="text-muted small ms-2" data-testid="playalong-calibrated-latency-label">
                Using {calibratedMs} ms
              </span>
            ) : null}
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
          onClick={startRecording}
        >
          Start
        </Button>
      </Modal.Footer>
    </Modal>
    <PlayalongClapCalibrationModal
      show={showCalibration}
      onHide={function() { setShowCalibration(false) }}
      currentLatencySeconds={settings.calibratedOutputLatencySeconds}
      onSave={function(seconds) {
        patchSettings({ calibratedOutputLatencySeconds: seconds })
        setShowCalibration(false)
      }}
    />
    </>
  )
}
