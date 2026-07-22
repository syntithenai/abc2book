import { useState, useCallback } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import useMidiInput from '../../notation/useMidiInput'
import { getActiveTake } from '../../scratchpadAudioProject'

const ROWS = 24
const ROW_HEIGHT = 14
const PX_PER_SEC = 80

function midiToRow(midi) {
  return ROWS - 1 - ((midi - 48) % ROWS)
}

export default function ScratchpadMidiLaneEditor(props) {
  const track = props.track
  const tempo = props.tempo || 120
  const [events, setEvents] = useState(function() {
    const take = getActiveTake(track)
    return (take && take.events) ? take.events.slice() : []
  })
  const [recording, setRecording] = useState(false)
  const recordStartRef = { current: 0 }

  const onNoteOn = useCallback(function(note) {
    if (!recording) return
    const start = props.currentTime || 0
    setEvents(function(prev) {
      return prev.concat([{
        id: 'n-' + Date.now(),
        start: start,
        end: start + 0.25,
        midi: note.midi,
        velocity: note.velocity || 80,
      }])
    })
  }, [recording, props.currentTime])

  useMidiInput({
    enabled: props.show,
    onNoteOn: onNoteOn,
    recordActive: recording,
  })

  function save() {
    if (props.onSave) props.onSave(events)
    if (props.onHide) props.onHide()
  }

  const width = Math.max(400, (props.duration || 8) * PX_PER_SEC)

  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{track ? track.name : 'MIDI'} — Piano roll</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-flex gap-2 mb-2">
          <Button
            size="sm"
            variant={recording ? 'danger' : 'outline-danger'}
            onClick={function() {
              setRecording(!recording)
              recordStartRef.current = props.currentTime || 0
            }}
          >
            {recording ? 'Recording…' : 'Record MIDI'}
          </Button>
          <span className="small text-muted">Tempo {tempo} BPM · playhead {Number(props.currentTime || 0).toFixed(1)}s</span>
        </div>
        <div className="scratchpad-midi-roll border" style={{ overflow: 'auto', maxHeight: '320px' }}>
          <svg width={width} height={ROWS * ROW_HEIGHT + 20}>
            {events.map(function(ev) {
              const x = ev.start * PX_PER_SEC
              const w = Math.max(4, (ev.end - ev.start) * PX_PER_SEC)
              const y = midiToRow(ev.midi) * ROW_HEIGHT + 2
              return (
                <rect
                  key={ev.id}
                  x={x}
                  y={y}
                  width={w}
                  height={ROW_HEIGHT - 4}
                  fill="#4a90d9"
                  rx="2"
                />
              )
            })}
            <line
              x1={(props.currentTime || 0) * PX_PER_SEC}
              y1="0"
              x2={(props.currentTime || 0) * PX_PER_SEC}
              y2={ROWS * ROW_HEIGHT}
              stroke="#c00"
              strokeWidth="2"
            />
          </svg>
        </div>
        <Form.Text className="text-muted">Connect a MIDI keyboard to record notes at the current playhead.</Form.Text>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save MIDI take</Button>
      </Modal.Footer>
    </Modal>
  )
}
