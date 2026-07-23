import { useState } from 'react'
import { Button, Dropdown, Form, Modal } from 'react-bootstrap'
import { AUDIO_EFFECTS } from '../../scratchpadAudioEffects'

export default function ScratchpadAudioEffectsPanel(props) {
  const [show, setShow] = useState(false)
  const [effectId, setEffectId] = useState('normalize')
  const [params, setParams] = useState({ targetDb: -1 })
  const [applying, setApplying] = useState(false)

  const effect = AUDIO_EFFECTS.find(function(e) { return e.id === effectId }) || AUDIO_EFFECTS[0]
  const triggerVariant = props.triggerVariant || 'button'

  function openModal() {
    setParams(Object.assign({}, effect.defaultParams))
    setShow(true)
  }

  async function apply() {
    if (!props.onApply || applying) return
    setApplying(true)
    try {
      await props.onApply(effectId, params)
      setShow(false)
    } finally {
      setApplying(false)
    }
  }

  const trigger = triggerVariant === 'menuItem' ? (
    <Dropdown.Item onClick={openModal} disabled={!props.canApply}>
      Effects (FX)
    </Dropdown.Item>
  ) : (
    <Button size="sm" variant="outline-dark" onClick={openModal} disabled={!props.canApply} title="Apply audio effect">
      FX
    </Button>
  )

  return (
    <>
      {trigger}
      <Modal show={show} onHide={function() { setShow(false) }} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title>Audio effect</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Effect</Form.Label>
            <Form.Control
              as="select"
              value={effectId}
              onChange={function(e) {
                const next = e.target.value
                setEffectId(next)
                const def = AUDIO_EFFECTS.find(function(x) { return x.id === next })
                setParams(Object.assign({}, def ? def.defaultParams : {}))
              }}
            >
              {AUDIO_EFFECTS.map(function(eff) {
                return <option key={eff.id} value={eff.id}>{eff.label}</option>
              })}
            </Form.Control>
          </Form.Group>
          {effectId === 'normalize' ? (
            <Form.Group>
              <Form.Label>Target peak (dBFS)</Form.Label>
              <Form.Control
                type="number"
                value={params.targetDb}
                onChange={function(e) { setParams(Object.assign({}, params, { targetDb: parseFloat(e.target.value) })) }}
              />
            </Form.Group>
          ) : null}
          {effectId === 'amplify' ? (
            <Form.Group>
              <Form.Label>Gain (dB)</Form.Label>
              <Form.Control
                type="number"
                value={params.db}
                onChange={function(e) { setParams(Object.assign({}, params, { db: parseFloat(e.target.value) })) }}
              />
            </Form.Group>
          ) : null}
          {effectId === 'eq' ? (
            <>
              <Form.Group className="mb-1">
                <Form.Label>Low (dB)</Form.Label>
                <Form.Control type="number" value={params.lowGainDb || 0} onChange={function(e) { setParams(Object.assign({}, params, { lowGainDb: parseFloat(e.target.value) })) }} />
              </Form.Group>
              <Form.Group className="mb-1">
                <Form.Label>Mid (dB)</Form.Label>
                <Form.Control type="number" value={params.midGainDb || 0} onChange={function(e) { setParams(Object.assign({}, params, { midGainDb: parseFloat(e.target.value) })) }} />
              </Form.Group>
              <Form.Group>
                <Form.Label>High (dB)</Form.Label>
                <Form.Control type="number" value={params.highGainDb || 0} onChange={function(e) { setParams(Object.assign({}, params, { highGainDb: parseFloat(e.target.value) })) }} />
              </Form.Group>
            </>
          ) : null}
          {effectId === 'reverb' ? (
            <>
              <Form.Group className="mb-1">
                <Form.Label>Mix</Form.Label>
                <Form.Control type="number" min="0" max="1" step="0.05" value={params.mix || 0.35} onChange={function(e) { setParams(Object.assign({}, params, { mix: parseFloat(e.target.value) })) }} />
              </Form.Group>
              <Form.Group>
                <Form.Label>Decay (s)</Form.Label>
                <Form.Control type="number" min="0.1" step="0.1" value={params.decay || 1.5} onChange={function(e) { setParams(Object.assign({}, params, { decay: parseFloat(e.target.value) })) }} />
              </Form.Group>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShow(false) }}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
