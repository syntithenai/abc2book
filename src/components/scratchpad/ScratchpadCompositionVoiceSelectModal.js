import { useEffect, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import { getTuneVoiceKeys } from '../../abcVoiceViewSettings'
import { voiceDisplayLabel } from '../../notation/notationDisplayAbc'

export default function ScratchpadCompositionVoiceSelectModal(props) {
  const tune = props.sourceTune
  const [selected, setSelected] = useState([])

  useEffect(function() {
    if (!props.show) return
    const keys = getTuneVoiceKeys(tune)
    setSelected(keys.slice())
  }, [props.show, tune])

  function toggleVoice(voiceKey, checked) {
    setSelected(function(prev) {
      const set = {}
      prev.forEach(function(key) { set[key] = true })
      if (checked) set[voiceKey] = true
      else delete set[voiceKey]
      return Object.keys(set)
    })
  }

  function handleConfirm() {
    if (props.onConfirm && selected.length) props.onConfirm(selected.slice())
  }

  const voiceKeys = getTuneVoiceKeys(tune)

  return (
    <Modal
      show={!!props.show}
      onHide={props.onHide}
      centered
      className="scratchpad-composition-voice-select-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Select voices</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          This notation has multiple voices. Choose which voices to include in the pairing.
        </p>
        {voiceKeys.map(function(voiceKey) {
          const checked = selected.indexOf(voiceKey) >= 0
          return (
            <Form.Check
              key={voiceKey}
              type="checkbox"
              id={'composition-voice-' + voiceKey}
              className="mb-2"
              label={voiceDisplayLabel(tune, voiceKey)}
              checked={checked}
              onChange={function(e) { toggleVoice(voiceKey, e.target.checked) }}
            />
          )
        })}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" disabled={!selected.length} onClick={handleConfirm}>
          Use selected voices
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
