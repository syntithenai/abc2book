import { useCallback } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import { DRUM_TRACK_DEFAULTS } from '../rhythmEngineTypes'
import { primeDrumKit, playDrumHit } from '../drumSampleKit'

export default function DrumRecordPads(props) {
  const disabled = !!props.disabled
  const recording = !!props.recording
  const recordMode = props.recordMode || 'overdub'
  const flashSlot = props.flashSlot

  const hitPad = useCallback(function(trackId) {
    if (!props.onPadHit || disabled) return
    props.onPadHit(trackId)
    if (props.audioContext) {
      const track = DRUM_TRACK_DEFAULTS.find(function(t) { return t.id === trackId })
      if (track) {
        primeDrumKit(props.audioContext).then(function() {
          playDrumHit(props.audioContext, props.audioContext.currentTime, track.sample, track.velocity, 0)
        }).catch(function() { /* ignore */ })
      }
    }
  }, [props.onPadHit, props.audioContext, disabled])

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
        <ButtonGroup size="sm" aria-label="Record mode">
          <Button
            variant={recordMode === 'replace' ? 'primary' : 'outline-primary'}
            disabled={disabled || recording}
            onClick={function() { if (props.onRecordModeChange) props.onRecordModeChange('replace') }}
          >
            Replace
          </Button>
          <Button
            variant={recordMode === 'overdub' ? 'primary' : 'outline-primary'}
            disabled={disabled || recording}
            onClick={function() { if (props.onRecordModeChange) props.onRecordModeChange('overdub') }}
          >
            Overdub
          </Button>
        </ButtonGroup>
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
