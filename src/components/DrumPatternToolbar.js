import { Button, ButtonGroup } from 'react-bootstrap'
import {
  clearDrumPattern,
  clearDrumTrack,
  fillDrumTrack,
  invertDrumTrack,
  shiftDrumPattern,
  applyAccentTemplate,
  copyDrumTrack,
} from '../rhythmEngineTypes'

export default function DrumPatternToolbar(props) {
  const drumPattern = props.drumPattern
  const disabled = !!props.disabled
  const canUndo = !!props.canUndo
  const canRedo = !!props.canRedo
  const showVelocityLanes = !!props.showVelocityLanes

  function change(pattern) {
    if (!props.onPatternChange) return
    props.onPatternChange(pattern)
  }

  if (!drumPattern) return null

  return (
    <div className="drum-pattern-editor__toolbar">
      <ButtonGroup size="sm" aria-label="Pattern tools">
        <Button variant="outline-secondary" disabled={disabled} title="Shift left" onClick={function() {
          change(shiftDrumPattern(drumPattern, -1))
        }}>◀</Button>
        <Button variant="outline-secondary" disabled={disabled} title="Shift right" onClick={function() {
          change(shiftDrumPattern(drumPattern, 1))
        }}>▶</Button>
        <Button variant="outline-secondary" disabled={disabled} title="Clear pattern" onClick={function() {
          change(clearDrumPattern(drumPattern))
        }}>Clear</Button>
        <Button variant="outline-secondary" disabled={disabled || !canUndo} title="Undo" onClick={props.onUndo}>Undo</Button>
        <Button variant="outline-secondary" disabled={disabled || !canRedo} title="Redo" onClick={props.onRedo}>Redo</Button>
        {props.onToggleVelocityLanes ? (
          <Button
            variant={showVelocityLanes ? 'primary' : 'outline-secondary'}
            disabled={disabled}
            title="Toggle velocity lanes"
            onClick={props.onToggleVelocityLanes}
          >
            Velocity
          </Button>
        ) : null}
        <Button variant="outline-secondary" disabled={disabled} title="Backbeat accent template" onClick={function() {
          change(applyAccentTemplate(drumPattern))
        }}>Accent</Button>
      </ButtonGroup>

      <div className="drum-pattern-editor__row-tools">
        {drumPattern.tracks.map(function(track) {
          return (
            <div key={track.id} className="drum-pattern-editor__row-tool-group">
              <span className="drum-pattern-editor__row-tool-label">{track.label}</span>
              <ButtonGroup size="sm">
                <Button variant="outline-secondary" disabled={disabled} title="Clear row" onClick={function() {
                  change(clearDrumTrack(drumPattern, track.id))
                }}>Clr</Button>
                <Button variant="outline-secondary" disabled={disabled} title="Fill every 2nd step" onClick={function() {
                  change(fillDrumTrack(drumPattern, track.id, 2))
                }}>½</Button>
                <Button variant="outline-secondary" disabled={disabled} title="Fill every 4th step" onClick={function() {
                  change(fillDrumTrack(drumPattern, track.id, 4))
                }}>¼</Button>
                <Button variant="outline-secondary" disabled={disabled} title="Invert row" onClick={function() {
                  change(invertDrumTrack(drumPattern, track.id))
                }}>Inv</Button>
                {track.id !== 'kick' ? (
                  <Button variant="outline-secondary" disabled={disabled} title="Copy kick row" onClick={function() {
                    change(copyDrumTrack(drumPattern, 'kick', track.id))
                  }}>K→</Button>
                ) : null}
              </ButtonGroup>
            </div>
          )
        })}
      </div>
    </div>
  )
}
