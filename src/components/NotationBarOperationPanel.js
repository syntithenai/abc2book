import { Form } from 'react-bootstrap'
import { NotationPreview } from './SuggestionPreviewDialog'

function modeDescription(mode, fromBar, toBar) {
  if (mode === 'insert') {
    return 'Insert clipboard bars at bar ' + fromBar + '. Later bars shift right.'
  }
  const rangeNote = toBar != null
    ? ' Only bars ' + fromBar + '–' + toBar + ' are replaced.'
    : ''
  if (mode === 'replace') {
    return 'Replace tune bars from bar ' + fromBar + ' with clipboard content.' + rangeNote
  }
  return 'Merge clipboard notes into bars from ' + fromBar + ', keeping existing notes.' + rangeNote
}

export default function NotationBarOperationPanel(props) {
  const mode = props.mode || 'merge'
  const fromBar = Math.max(1, parseInt(props.fromBar, 10) || 1)
  const toBar = props.toBar == null || props.toBar === '' ? null : Math.max(fromBar, parseInt(props.toBar, 10) || fromBar)
  const previewAbc = props.previewAbc || ''
  const strainWarnings = Array.isArray(props.strainWarnings) ? props.strainWarnings : []
  const modeOptions = props.modeOptions || ['insert', 'replace', 'merge']

  return (
    <div className="notation-bar-operation-panel">
      <div className="notation-paste-mode-options">
        {modeOptions.map(function(option) {
          return (
            <Form.Check
              key={option}
              type="radio"
              id={'bar-op-mode-' + option}
              name="bar-op-mode"
              label={option.charAt(0).toUpperCase() + option.slice(1)}
              checked={mode === option}
              onChange={function() {
                if (props.onModeChange) props.onModeChange(option)
              }}
              inline
            />
          )
        })}
      </div>
      <p className="text-muted notation-paste-mode-help">{modeDescription(mode, fromBar, toBar)}</p>
      <div className="notation-paste-mode-bars">
        <Form.Group className="notation-paste-bar-field">
          <Form.Label>From bar</Form.Label>
          <Form.Control
            type="number"
            min={1}
            value={fromBar}
            onChange={function(e) {
              if (props.onFromBarChange) props.onFromBarChange(e.target.value)
            }}
          />
        </Form.Group>
        {mode !== 'insert' ? (
          <Form.Group className="notation-paste-bar-field">
            <Form.Label>To bar (optional)</Form.Label>
            <Form.Control
              type="number"
              min={fromBar}
              value={toBar == null ? '' : toBar}
              onChange={function(e) {
                if (props.onToBarChange) props.onToBarChange(e.target.value)
              }}
            />
          </Form.Group>
        ) : null}
      </div>
      {strainWarnings.length > 0 ? (
        <div className="notation-paste-strain-warnings">
          {strainWarnings.map(function(item, index) {
            return (
              <p key={item.code + '-' + index} className={'notation-paste-strain-warning text-' + (item.severity === 'warning' ? 'warning' : 'muted')}>
                {item.message}
              </p>
            )
          })}
        </div>
      ) : null}
      {previewAbc ? (
        <div className="notation-paste-preview">
          <NotationPreview abc={previewAbc} />
        </div>
      ) : null}
    </div>
  )
}
