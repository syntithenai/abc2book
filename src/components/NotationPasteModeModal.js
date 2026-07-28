import { useMemo } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import { NotationPreview } from './SuggestionPreviewDialog'
import { applyBarOperationToVoice, tuneMeta, voiceBodyFromNotes } from '../scratchpadNotationBarUtils'
import { serializeVoiceEvents } from '../notation/abcVoiceSerializer'
import { parseVoiceEvents } from '../notation/voiceEventModel'
import { injectAbcBarNumbers } from '../scratchpadNotationMerge'

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

export default function NotationPasteModeModal(props) {
  const show = !!props.show
  const mode = props.mode || 'merge'
  const fromBar = Math.max(1, parseInt(props.fromBar, 10) || 1)
  const toBar = props.toBar == null || props.toBar === '' ? null : Math.max(fromBar, parseInt(props.toBar, 10) || fromBar)
  const targetNotes = props.targetNotes || []
  const sourceNotes = props.sourceNotes || []
  const tune = props.tune

  const previewNotes = useMemo(function() {
    if (!tune || !sourceNotes.length) return null
    return applyBarOperationToVoice(targetNotes, sourceNotes, tune, fromBar, mode, {
      toBar: toBar,
    })
  }, [tune, targetNotes, sourceNotes, fromBar, toBar, mode])

  const previewAbc = useMemo(function() {
    if (!previewNotes || !tune) return ''
    const meta = tuneMeta(tune)
    const body = serializeVoiceEvents(
      parseVoiceEvents(voiceBodyFromNotes(previewNotes), meta),
      meta
    )
    const headers = [
      'X:1',
      'T:Preview',
      'M:' + meta.meter,
      'L:' + meta.noteLength,
      'K:' + meta.key,
      body,
    ].join('\n')
    return injectAbcBarNumbers(headers)
  }, [previewNotes, tune])

  return (
    <Modal show={show} onHide={props.onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Paste notation</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="notation-paste-mode-options">
          {['insert', 'replace', 'merge'].map(function(option) {
            return (
              <Form.Check
                key={option}
                type="radio"
                id={'paste-mode-' + option}
                name="paste-mode"
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
        {previewAbc ? (
          <div className="notation-paste-preview">
            <NotationPreview abc={previewAbc} />
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" onClick={props.onConfirm}>Paste</Button>
      </Modal.Footer>
    </Modal>
  )
}
