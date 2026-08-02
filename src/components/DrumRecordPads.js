import { useCallback, useEffect } from 'react'
import { Button } from 'react-bootstrap'
import { DRUM_TRACK_DEFAULTS } from '../rhythmEngineTypes'
import { primeDrumKit } from '../drumSampleKit'

export default function DrumRecordPads(props) {
  const disabled = !!props.disabled
  const recording = !!props.recording
  const flashSlot = props.flashSlot

  useEffect(function() {
    if (props.audioContext) {
      primeDrumKit(props.audioContext).catch(function() { /* ignore */ })
    }
  }, [props.audioContext])

  const hitPad = useCallback(function(trackId) {
    if (disabled || !props.onPadHit) return
    props.onPadHit(trackId)
  }, [props.onPadHit, disabled])

  return (
    <div className="drum-pattern-editor__record-pads">
      <div className="drum-pattern-editor__record-controls">
        <Button
          variant={recording ? 'danger' : 'outline-danger'}
          disabled={disabled}
          onClick={function() {
            if (props.onToggleRecord) props.onToggleRecord()
          }}
        >
          {recording ? 'Stop recording' : 'Record'}
        </Button>
        {recording && props.onUndoHit ? (
          <Button variant="outline-secondary" size="sm" disabled={disabled} onClick={props.onUndoHit}>
            Undo hit
          </Button>
        ) : null}
      </div>
      <div className="drum-pattern-editor__pad-row" role="group" aria-label="Drum pads">
        {DRUM_TRACK_DEFAULTS.map(function(track) {
          const isFlash = flashSlot && flashSlot.trackId === track.id
          return (
            <button
              key={track.id}
              type="button"
              className={'drum-pattern-editor__pad' + (isFlash ? ' is-flash' : '')}
              disabled={disabled}
              onClick={function() { hitPad(track.id) }}
              onTouchStart={function(e) {
                e.preventDefault()
                hitPad(track.id)
              }}
            >
              {track.label}
            </button>
          )
        })}
      </div>
      <p className="drum-pattern-editor__record-hint text-muted small mb-0">
        Tap pads while the loop plays. Keys 1–5 also trigger pads when the editor is focused.
      </p>
    </div>
  )
}
