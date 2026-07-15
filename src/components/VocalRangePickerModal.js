import { useEffect, useRef, useState } from 'react'
import { Button, Form, InputGroup, Modal } from 'react-bootstrap'
import SoundfontProvider from '../SoundfontProvider'
import {
  midiToScientificName,
  normalizeVocalNoteName,
} from '../practiceInstrumentProfiles'
import './VocalRangePickerModal.css'

const SOUND_FONT_HOST = 'https://d1pzp51pvbm36p.cloudfront.net'

const WHITE_KEYS = [
  { midi: 60, label: 'C' }, { midi: 62, label: 'D' }, { midi: 64, label: 'E' },
  { midi: 65, label: 'F' }, { midi: 67, label: 'G' }, { midi: 69, label: 'A' }, { midi: 71, label: 'B' },
  { midi: 72, label: 'c' }, { midi: 74, label: 'd' }, { midi: 76, label: 'e' },
  { midi: 77, label: 'f' }, { midi: 79, label: 'g' }, { midi: 81, label: 'a' }, { midi: 83, label: 'b' },
]

const BLACK_KEYS = [
  { midi: 61, left: 1 }, { midi: 63, left: 2 }, { midi: 66, left: 4 },
  { midi: 68, left: 5 }, { midi: 70, left: 6 }, { midi: 73, left: 8 },
  { midi: 75, left: 9 }, { midi: 78, left: 11 }, { midi: 80, left: 12 }, { midi: 82, left: 13 },
]

function RangePiano(props) {
  const { playNote, stopNote, disabled, onNote } = props
  const [octaveShift, setOctaveShift] = useState(0)
  const [activeMidi, setActiveMidi] = useState(null)

  function handleClick(baseMidi) {
    const midi = baseMidi + octaveShift * 12
    const name = midiToScientificName(midi)
    setActiveMidi(midi)
    if (onNote) onNote(name, midi)
    if (playNote && !disabled) {
      try {
        playNote(midi)
        window.setTimeout(function() {
          if (stopNote) stopNote(midi)
        }, 400)
      } catch (e) {
        // ignore playback errors
      }
    }
  }

  return (
    <div className="virtual-piano vocal-range-piano d-flex align-items-stretch gap-1" data-testid="vocal-range-piano">
      <div className="virtual-piano-octave-controls d-flex flex-column gap-1">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={function() { setOctaveShift(octaveShift - 1) }}
          title="Octave down"
        >◀ Oct</button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={function() { setOctaveShift(octaveShift + 1) }}
          title="Octave up"
        >Oct ▶</button>
      </div>
      <div className="virtual-piano-keys flex-grow-1">
        {WHITE_KEYS.map(function(key) {
          const midi = key.midi + octaveShift * 12
          return (
            <button
              key={key.midi}
              type="button"
              className={'virtual-piano-white' + (activeMidi === midi ? ' active' : '')}
              onClick={function() { handleClick(key.midi) }}
            >{key.label}</button>
          )
        })}
        {BLACK_KEYS.map(function(key) {
          const midi = key.midi + octaveShift * 12
          return (
            <button
              key={'b' + key.midi}
              type="button"
              className={'virtual-piano-black' + (activeMidi === midi ? ' active' : '')}
              style={{ left: 'calc(' + (key.left * 100 / 14) + '% - 10px)' }}
              onClick={function() { handleClick(key.midi) }}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function VocalRangePickerModal(props) {
  const [low, setLow] = useState('')
  const [high, setHigh] = useState('')
  const [lastNote, setLastNote] = useState('')
  const audioContextRef = useRef(null)

  useEffect(function() {
    if (!props.show) return
    setLow(normalizeVocalNoteName(props.vocalRangeLow) || '')
    setHigh(normalizeVocalNoteName(props.vocalRangeHigh) || '')
    setLastNote('')
    if (!audioContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) audioContextRef.current = new AC()
    }
  }, [props.show, props.vocalRangeLow, props.vocalRangeHigh])

  function handleSave() {
    if (props.onSave) {
      props.onSave({
        vocalRangeLow: normalizeVocalNoteName(low),
        vocalRangeHigh: normalizeVocalNoteName(high),
      })
    }
  }

  const audioContext = audioContextRef.current

  return (
    <Modal show={!!props.show} onHide={props.onHide} fullscreen scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Vocal Range</Modal.Title>
      </Modal.Header>
      <Modal.Body className="vocal-range-picker-body">
        <div className="vocal-range-last-note" data-testid="vocal-range-last-note">
          {lastNote || '—'}
        </div>
        <div className="vocal-range-set-row">
          <Form.Group className="vocal-range-field">
            <Form.Label>Low</Form.Label>
            <InputGroup>
              <Form.Control
                value={low}
                onChange={function(e) { setLow(e.target.value) }}
                placeholder="e.g. G3"
                aria-label="Vocal range low"
              />
              <Button
                variant="outline-secondary"
                disabled={!lastNote}
                onClick={function() { setLow(lastNote) }}
              >Set</Button>
            </InputGroup>
          </Form.Group>
          <Form.Group className="vocal-range-field">
            <Form.Label>High</Form.Label>
            <InputGroup>
              <Form.Control
                value={high}
                onChange={function(e) { setHigh(e.target.value) }}
                placeholder="e.g. G4"
                aria-label="Vocal range high"
              />
              <Button
                variant="outline-secondary"
                disabled={!lastNote}
                onClick={function() { setHigh(lastNote) }}
              >Set</Button>
            </InputGroup>
          </Form.Group>
        </div>
        <p className="text-muted small mb-2">Click a key to hear it, then use Set to fill Low or High.</p>
        {audioContext ? (
          <SoundfontProvider
            instrumentName="acoustic_grand_piano"
            audioContext={audioContext}
            hostname={SOUND_FONT_HOST}
            render={function(sf) {
              return (
                <RangePiano
                  playNote={sf.playNote}
                  stopNote={sf.stopNote}
                  disabled={sf.isLoading}
                  onNote={function(name) { setLastNote(name) }}
                />
              )
            }}
          />
        ) : (
          <RangePiano
            onNote={function(name) { setLastNote(name) }}
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </Modal.Footer>
    </Modal>
  )
}
