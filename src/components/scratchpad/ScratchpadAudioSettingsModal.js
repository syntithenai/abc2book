import { useEffect, useState } from 'react'
import { Modal, Form, Button } from 'react-bootstrap'

export default function ScratchpadAudioSettingsModal(props) {
  const [devices, setDevices] = useState([])
  const [inputId, setInputId] = useState(props.inputDeviceId || '')
  const [outputId, setOutputId] = useState(props.outputDeviceId || '')
  const [level, setLevel] = useState(0)

  useEffect(function() {
    if (!props.show) return undefined
    let cancelled = false
    async function load() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
      const list = await navigator.mediaDevices.enumerateDevices()
      if (!cancelled) setDevices(list)
    }
    load()
    return function() { cancelled = true }
  }, [props.show])

  useEffect(function() {
    if (!props.show || !props.analyserNode) return undefined
    const analyser = props.analyserNode
    const data = new Uint8Array(analyser.frequencyBinCount)
    const id = setInterval(function() {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i] - 128) / 128
        if (v > peak) peak = v
      }
      setLevel(peak)
    }, 100)
    return function() { clearInterval(id) }
  }, [props.show, props.analyserNode])

  const inputs = devices.filter(function(d) { return d.kind === 'audioinput' })
  const outputs = devices.filter(function(d) { return d.kind === 'audioutput' })

  function handleSave(e) {
    e.preventDefault()
    if (props.onSave) props.onSave({ inputDeviceId: inputId, outputDeviceId: outputId })
    if (props.onHide) props.onHide()
  }

  return (
    <Modal show={props.show} onHide={props.onHide} centered>
      <Form onSubmit={handleSave}>
        <Modal.Header closeButton><Modal.Title>Audio &amp; MIDI settings</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Input device</Form.Label>
            <Form.Control size="sm" as="select" value={inputId} onChange={function(e) { setInputId(e.target.value) }}>
              <option value="">Default</option>
              {inputs.map(function(d) {
                return <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
              })}
            </Form.Control>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Output device</Form.Label>
            <Form.Control size="sm" as="select" value={outputId} onChange={function(e) { setOutputId(e.target.value) }} disabled={!outputs.length}>
              <option value="">Default</option>
              {outputs.map(function(d) {
                return <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>
              })}
            </Form.Control>
            {!outputs.length ? (
              <Form.Text className="text-muted">Output device selection requires browser support (e.g. Chrome).</Form.Text>
            ) : null}
          </Form.Group>
          <Form.Group className="mb-0">
            <Form.Label>Input level</Form.Label>
            <div className="scratchpad-audio-input-meter">
              <div className="scratchpad-audio-input-meter-fill" style={{ width: Math.round(level * 100) + '%' }} />
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" type="button" onClick={props.onRescan}>Rescan devices</Button>
          <Button variant="primary" type="submit">Save</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}
