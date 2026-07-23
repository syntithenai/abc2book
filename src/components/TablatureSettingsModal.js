import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import { voiceDisplayLabel } from '../notation/notationDisplayAbc'
import SelectInput from './SelectInput'
import {
  TABLATURE_INSTRUMENTS,
  applyTablatureSelection,
  applyTablatureVoiceConfigs,
  disableTablature,
  getTabDisplay,
  getTablatureSelection,
  getTablatureVoiceSettings,
  getTablatureVoices,
  getTablatureTuningValidation,
  normalizeTablatureInstrument,
  resolveVoiceTuningSelection,
  tablatureInstrumentSummary,
  tuningOptionsForInstrument,
} from '../tablatureConfig'
import { canonicalTuningLabel } from '../tuningPresetResolver'

function isActiveTablatureVoice(setting, multiVoice) {
  return multiVoice ? (setting.enabled && setting.instrumentId) : !!setting.instrumentId
}

function TuningField(props) {
  const { setting, tuningOptions, controlId, onChange } = props
  const validation = getTablatureTuningValidation(
    setting.instrumentId,
    setting.tuningText,
    setting.presetId
  )
  const showError = !!String(setting.tuningText || '').trim() && !validation.valid

  return (
    <Form.Group className="mb-0" controlId={controlId}>
      <Form.Label>Tuning</Form.Label>
      <SelectInput
        value={setting.tuningText}
        options={tuningOptions}
        placeholder="Type or select tuning"
        onChange={onChange}
        isInvalid={showError}
        data-testid={controlId ? controlId + '-input' : undefined}
      />
      {showError ? (
        <Form.Text className="text-danger tablature-tuning-feedback" data-testid={controlId ? controlId + '-feedback' : undefined}>
          {validation.message}
        </Form.Text>
      ) : null}
    </Form.Group>
  )
}

function VoiceTablatureRow(props) {
  const { setting, tune, multiVoice, onChange } = props
  const tuningOptions = setting.instrumentId ? tuningOptionsForInstrument(setting.instrumentId) : []

  function update(patch) {
    onChange(setting.voiceKey, patch)
  }

  function handleInstrumentChange(nextInstrumentId) {
    const normalized = normalizeTablatureInstrument(nextInstrumentId)
    if (!normalized) {
      update({
        instrumentId: '',
        presetId: '',
        tuningText: '',
        enabled: false,
      })
      return
    }
    const resolved = resolveVoiceTuningSelection(normalized, '', '')
    update({
      instrumentId: normalized,
      presetId: resolved.presetId,
      tuningText: resolved.tuningText,
      enabled: multiVoice ? true : setting.enabled,
    })
  }

  function handleEnableChange(checked) {
    if (!checked) {
      update({
        enabled: false,
        instrumentId: '',
        presetId: '',
        tuningText: '',
      })
      return
    }
    const instrumentId = setting.instrumentId || 'guitar'
    const resolved = resolveVoiceTuningSelection(
      instrumentId,
      setting.tuningText,
      setting.presetId
    )
    update({
      enabled: true,
      instrumentId: instrumentId,
      presetId: resolved.presetId,
      tuningText: resolved.tuningText,
    })
  }

  function handleTuningChange(text) {
    const resolved = resolveVoiceTuningSelection(
      setting.instrumentId,
      text,
      setting.presetId
    )
    update({
      tuningText: resolved.tuningText,
      presetId: resolved.presetId,
    })
  }

  const showConfig = multiVoice ? setting.enabled : true

  if (multiVoice) {
    return (
      <div className="tablature-voice-card">
        <Form.Check
          type="checkbox"
          id={'tablature-voice-' + setting.voiceKey}
          className="tablature-voice-enable"
          label={voiceDisplayLabel(tune, setting.voiceKey)}
          checked={setting.enabled}
          onChange={function(e) { handleEnableChange(e.target.checked) }}
        />
        {showConfig ? (
          <div className="tablature-voice-config">
            <Form.Group className="mb-3" controlId={'tablature-instrument-' + setting.voiceKey}>
              <Form.Label>Instrument</Form.Label>
              <Form.Select
                value={setting.instrumentId}
                onChange={function(e) { handleInstrumentChange(e.target.value) }}
              >
                {TABLATURE_INSTRUMENTS.map(function(inst) {
                  return (
                    <option key={inst.id} value={inst.id}>{inst.label}</option>
                  )
                })}
              </Form.Select>
            </Form.Group>
            {setting.instrumentId ? (
              <TuningField
                setting={setting}
                tuningOptions={tuningOptions}
                controlId={'tablature-tuning-' + setting.voiceKey}
                onChange={handleTuningChange}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <Form.Group className="mb-3" controlId="tablature-instrument">
        <Form.Label>Instrument</Form.Label>
        <Form.Select
          value={setting.instrumentId}
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

      {setting.instrumentId ? (
        <TuningField
          setting={setting}
          tuningOptions={tuningOptions}
          controlId="tablature-tuning"
          onChange={handleTuningChange}
        />
      ) : (
        <p className="text-muted mb-0">Choose an instrument to show tablature with the notation.</p>
      )}
    </>
  )
}

export default function TablatureSettingsModal(props) {
  const { show, onHide, tune, tunebook, onApply } = props
  const responsiveModalProps = useResponsiveModalProps()
  const [voiceSettings, setVoiceSettings] = useState([])
  const [tabDisplay, setTabDisplay] = useState('both')
  const loadedForRef = useRef('')

  const multiVoice = voiceSettings.length > 1

  useEffect(function() {
    if (!show || !tune) {
      if (!show) loadedForRef.current = ''
      return
    }
    const loadKey = String(tune.id || 'draft') + ':' + String(show)
    if (loadedForRef.current === loadKey) return
    loadedForRef.current = loadKey
    setVoiceSettings(getTablatureVoiceSettings(tune))
    setTabDisplay(getTabDisplay(tune))
  }, [show, tune])

  const updateVoiceSetting = useCallback(function(voiceKey, patch) {
    setVoiceSettings(function(prev) {
      return prev.map(function(setting) {
        if (setting.voiceKey !== voiceKey) return setting
        return Object.assign({}, setting, patch)
      })
    })
  }, [])

  const anyEnabled = voiceSettings.some(function(setting) {
    return isActiveTablatureVoice(setting, multiVoice)
  })

  const hasBlockingTuningError = voiceSettings.some(function(setting) {
    if (!isActiveTablatureVoice(setting, multiVoice)) return false
    return !getTablatureTuningValidation(
      setting.instrumentId,
      setting.tuningText,
      setting.presetId
    ).valid
  })

  function saveAndClose(clearTab) {
    if (!tune) {
      onHide()
      return
    }
    if (clearTab) {
      disableTablature(tune)
    } else if (multiVoice) {
      applyTablatureVoiceConfigs(tune, voiceSettings, tabDisplay)
    } else if (voiceSettings[0] && voiceSettings[0].instrumentId) {
      const single = voiceSettings[0]
      applyTablatureSelection(
        tune,
        single.instrumentId,
        single.presetId,
        tabDisplay,
        single.tuningText
      )
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
        {anyEnabled ? (
          <Form.Group className="mb-3" controlId="tablature-display">
            <Form.Check
              type="checkbox"
              id="tablature-tab-only"
              label="Show tab only (hide notation)"
              checked={tabDisplay === 'tab'}
              onChange={function(e) {
                setTabDisplay(e.target.checked ? 'tab' : 'both')
              }}
            />
          </Form.Group>
        ) : null}

        {multiVoice ? (
          <div className="tablature-voice-list">
            {voiceSettings.map(function(setting) {
              return (
                <VoiceTablatureRow
                  key={setting.voiceKey}
                  tune={tune}
                  setting={setting}
                  multiVoice={true}
                  onChange={updateVoiceSetting}
                />
              )
            })}
            {!anyEnabled ? (
              <p className="text-muted mb-0">Enable tablature on one or more voices and choose instrument and tuning for each.</p>
            ) : null}
          </div>
        ) : voiceSettings[0] ? (
          <VoiceTablatureRow
            tune={tune}
            setting={voiceSettings[0]}
            multiVoice={false}
            onChange={updateVoiceSetting}
          />
        ) : null}
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
          disabled={anyEnabled && hasBlockingTuningError}
          onClick={function() { saveAndClose(false) }}
        >
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export function tablatureSettingsSummary(tune) {
  const summary = tablatureInstrumentSummary(tune)
  if (!summary) return 'Off'

  const selection = getTablatureSelection(tune)
  const tuning = selection.preset ? canonicalTuningLabel(selection.preset) : ''
  const display = getTabDisplay(tune)
  const displaySuffix = display === 'tab' ? ' · tab only' : ''
  const activeKeys = Object.keys(getTablatureVoices(tune) || {})

  if (activeKeys.length > 1) {
    return summary + displaySuffix
  }

  const stored = getTablatureVoices(tune)
  const firstKey = activeKeys[0]
  const storedTuning = firstKey && stored[firstKey] ? stored[firstKey].tuning : ''
  const tuningLabel = storedTuning || tuning

  if (tuningLabel) return summary + ' · ' + tuningLabel + displaySuffix
  return summary + displaySuffix
}
