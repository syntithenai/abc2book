import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

function truncatePreview(text, maxLines) {
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length <= maxLines) return { text: lines.join('\n'), truncated: false };
  return {
    text: lines.slice(0, maxLines).join('\n'),
    truncated: true,
  };
}

export default function FieldPreviewEditor(props) {
  const label = props.label || 'Field';
  const value = props.value || '';
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const maxLines = props.previewLines || 4;
  const preview = truncatePreview(value, expanded ? 9999 : maxLines);
  const emptyMessage = props.emptyMessage || ('No ' + label.toLowerCase() + ' yet.');
  const monospace = !!props.monospace;

  useEffect(function() {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function openEditor() {
    setDraft(value);
    setEditing(true);
  }

  function saveEditor() {
    if (typeof props.onChange === 'function') props.onChange(draft);
    setEditing(false);
  }

  return (
    <div className="field-preview-editor mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-1">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {props.labelNode || <Form.Label className="mb-0">{label}</Form.Label>}
          {props.suggestionControl || null}
        </div>
        <Button size="sm" variant="outline-secondary" onClick={openEditor}>
          Edit
        </Button>
      </div>

      {props.abovePreview || null}

      <div className={'field-preview-editor-body' + (monospace ? ' field-preview-editor-body--mono' : '')}>
        {String(value || '').trim() ? (
          <pre className="field-preview-editor-text mb-0">{preview.text}</pre>
        ) : (
          <div className="text-muted small">{emptyMessage}</div>
        )}
      </div>

      {preview.truncated || (expanded && String(value || '').split(/\r?\n/).length > maxLines) ? (
        <Button
          size="sm"
          variant="link"
          className="px-0 mt-1"
          onClick={function() { setExpanded(function(open) { return !open; }); }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      ) : null}

      <Modal
        show={editing}
        onHide={function() { setEditing(false); }}
        size="lg"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title>Edit {label}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {typeof props.renderDialogExtra === 'function' ? props.renderDialogExtra(draft) : (props.dialogPreview || null)}
          <Form.Control
            as="textarea"
            rows={props.dialogRows || 16}
            style={monospace ? { fontFamily: 'monospace' } : undefined}
            value={draft}
            onChange={function(e) { setDraft(e.target.value); }}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setEditing(false); }}>Cancel</Button>
          <Button variant="success" onClick={saveEditor}>Save</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
