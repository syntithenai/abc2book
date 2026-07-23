import { Form } from 'react-bootstrap'
import { formatMarkerTime, roundMarkerTime } from '../../scratchpadAudioMarkers'

export default function ScratchpadAudioSelectionBar(props) {
  const selection = props.selection
  const duration = props.duration || 0
  const compact = !!props.compact
  const hasSel = selection && selection.end > selection.start
  const start = hasSel ? selection.start : (props.playhead != null ? props.playhead : 0)
  const end = hasSel ? selection.end : start
  const length = Math.max(0, end - start)

  function emit(startVal, endVal) {
    if (!props.onSelectionChange) return
    const s = roundMarkerTime(Math.max(0, startVal))
    const e = roundMarkerTime(Math.min(duration || endVal, endVal))
    if (e > s) props.onSelectionChange({ start: s, end: e })
    else if (props.onSeek) props.onSeek(s)
  }

  if (compact) {
    return (
      <div className="scratchpad-audio-selection-bar scratchpad-audio-selection-bar--compact">
        <button type="button" className="btn btn-sm btn-link" onClick={props.onExpand}>
          {formatMarkerTime(start)} – {formatMarkerTime(end)} ({formatMarkerTime(length)}s)
        </button>
      </div>
    )
  }

  return (
    <div className="scratchpad-audio-selection-bar">
      <Form className="d-flex flex-wrap align-items-center gap-2">
        <Form.Group className="mb-0 d-flex align-items-center gap-1">
          <Form.Label className="small mb-0">Start</Form.Label>
          <Form.Control
            size="sm"
            type="number"
            min="0"
            step="0.1"
            style={{ width: '5.5rem' }}
            value={formatMarkerTime(start)}
            onChange={function(e) {
              emit(parseFloat(e.target.value) || 0, end)
            }}
          />
        </Form.Group>
        <Form.Group className="mb-0 d-flex align-items-center gap-1">
          <Form.Label className="small mb-0">End</Form.Label>
          <Form.Control
            size="sm"
            type="number"
            min="0"
            step="0.1"
            style={{ width: '5.5rem' }}
            value={formatMarkerTime(end)}
            onChange={function(e) {
              emit(start, parseFloat(e.target.value) || 0)
            }}
          />
        </Form.Group>
        <Form.Group className="mb-0 d-flex align-items-center gap-1">
          <Form.Label className="small mb-0">Length</Form.Label>
          <Form.Control
            size="sm"
            type="number"
            min="0"
            step="0.1"
            readOnly
            style={{ width: '5.5rem' }}
            value={formatMarkerTime(length)}
          />
        </Form.Group>
        {props.loopRepeat != null ? (
          <Form.Check
            type="checkbox"
            className="mb-0 small"
            label="Loop playback"
            checked={!!props.loopRepeat}
            onChange={function(e) {
              if (props.onLoopRepeatChange) props.onLoopRepeatChange(e.target.checked)
            }}
          />
        ) : null}
        {props.onSetLoopFromSelection && hasSel ? (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onSetLoopFromSelection}>
            Set loop
          </button>
        ) : null}
      </Form>
    </div>
  )
}
