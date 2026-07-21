import { useEffect, useState } from 'react'
import { Button, Form, ListGroup, Modal } from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import {
  TABLATURE_INSTRUMENTS,
  applyTablatureSelection,
  getTabDisplay,
  getTablatureSelection,
  normalizeTablatureInstrument,
  presetsForTabInstrument,
  tabInstrumentLabel,
} from '../tablatureConfig'
import { canonicalTuningLabel } from '../tuningPresetResolver'

export default function TablatureSettingsModal(props) {
  const { show, onHide, tune, tunebook, onApply } = props
  const responsiveModalProps = useResponsiveModalProps()
  const [instrumentId, setInstrumentId] = useState('')
  const [presetId, setPresetId] = useState('')
  const [tabDisplay, setTabDisplay] = useState('both')

  useEffect(function() {
    if (!show || !tune) return
    const selection = getTablatureSelection(tune)
    setInstrumentId(selection.instrumentId || '')
    setPresetId(selection.presetId || '')
    setTabDisplay(getTabDisplay(tune))
  }, [show, tune])

  const presets = instrumentId ? presetsForTabInstrument(instrumentId) : []

  useEffect(function() {
    if (!instrumentId || !presets.length) {
      setPresetId('')
      return
    }
    if (presetId && presets.some(function(p) { return p.id === presetId })) return
    setPresetId(presets[0].id)
  }, [instrumentId, presets, presetId])

  function handleInstrumentChange(nextInstrumentId) {
    const normalized = normalizeTablatureInstrument(nextInstrumentId)
    setInstrumentId(normalized)
    const nextPresets = normalized ? presetsForTabInstrument(normalized) : []
    setPresetId(nextPresets.length ? nextPresets[0].id : '')
    if (normalized && tabDisplay === 'tab') {
      setTabDisplay('both')
    }
  }

  function saveAndClose(clearTab) {
    if (!tune) {
      onHide()
      return
    }
    if (clearTab) {
      applyTablatureSelection(tune, '', '')
    } else if (instrumentId) {
      applyTablatureSelection(tune, instrumentId, presetId, tabDisplay)
    } else {
      applyTablatureSelection(tune, '', '')
    }
    if (tune.id && tunebook && tunebook.saveTune) {
      tunebook.saveTune(tune)
    }
    if (onApply) onApply()
    onHide()
  }

  return (
    <Modal
      show={!!show}
      onHide={onHide}
      onClick={function(e) { e.stopPropagation() }}
      {...responsiveModalProps}
      className="tablature-settings-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Tablature</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3" controlId="tablature-instrument">
          <Form.Label>Instrument</Form.Label>
          <Form.Select
            value={instrumentId}
            onChange={function(e) { handleInstrumentChange(e.target.value) }}
          >
            <option value="">(none)</option>
            {TABLATURE_INSTRUMENTS.map(function(inst) {
              return (
                <option key={inst.id} value={inst.id}>{inst.label}</option>
              )
            })}
          </Form.Select>
        </Form.Group>

        {instrumentId ? (
          <>
            <Form.Group className="mb-3" controlId="tablature-display">
              <Form.Check
                type="checkbox"
                id="tablature-tab-only"
                label="Show tab only (hide notation)"
                checked={tabDisplay === 'tab'}
                onChange={function(e) { setTabDisplay(e.target.checked ? 'tab' : 'both') }}
              />
            </Form.Group>

            <Form.Group className="mb-2" controlId="tablature-tuning">
              <Form.Label>Tuning</Form.Label>
              <ListGroup className="tablature-preset-list">
                {presets.map(function(preset) {
                  const active = preset.id === presetId
                  return (
                    <ListGroup.Item
                      key={preset.id}
                      action
                      active={active}
                      onClick={function() { setPresetId(preset.id) }}
                    >
                      <div className="tablature-preset-label">{canonicalTuningLabel(preset)}</div>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </Form.Group>
          </>
        ) : (
          <p className="text-muted mb-0">Choose an instrument to show tablature with the notation.</p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={function() { saveAndClose(true) }}>
          Turn off
        </Button>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!!instrumentId && !presetId}
          onClick={function() { saveAndClose(false) }}
        >
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export function tablatureSettingsSummary(tune) {
  const selection = getTablatureSelection(tune)
  if (!selection.instrumentId) return 'Off'
  const instrument = tabInstrumentLabel(selection.instrumentId)
  const tuning = selection.preset ? canonicalTuningLabel(selection.preset) : ''
  const display = getTabDisplay(tune)
  const displaySuffix = display === 'tab' ? ' · tab only' : ''
  if (tuning) return instrument + ' · ' + tuning + displaySuffix
  return instrument + displaySuffix
}
