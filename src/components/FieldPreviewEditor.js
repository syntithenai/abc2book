import { useEffect, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

const PENCIL_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path fill="currentColor" d="M15.728 9.686l-1.414-1.414L5 17.586V19h1.414l9.314-9.314zm1.414-1.414l1.414-1.414-1.414-1.414-1.414 1.414 1.414 1.414zM7.242 21H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 21z" />
  </svg>
);

export default function FieldPreviewEditor(props) {
  const label = props.label || 'Field';
  const value = props.value || '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [previewDraft, setPreviewDraft] = useState(value);
  const previewRows = props.previewLines || 5;
  const emptyMessage = props.emptyMessage || ('No ' + label.toLowerCase() + ' yet.');
  const monospace = !!props.monospace;
  const textareaRef = useRef(null);
  const dialogTextareaRef = useRef(null);
  const usesExternalEdit = typeof props.onEditClick === 'function';

  useEffect(function() {
    if (!editing) {
      setDraft(value);
      setPreviewDraft(value);
    }
  }, [value, editing]);

  useEffect(function() {
    const node = (!usesExternalEdit && editing) ? dialogTextareaRef.current : textareaRef.current;
    if (typeof props.textareaRef === 'function') {
      props.textareaRef(node);
    } else if (props.textareaRef && typeof props.textareaRef === 'object') {
      props.textareaRef.current = node;
    }
  }, [editing, usesExternalEdit, props.textareaRef]);

  function openEditor() {
    if (usesExternalEdit) {
      props.onEditClick();
      return;
    }
    setDraft(value);
    setEditing(true);
  }

  function saveEditor() {
    if (typeof props.onChange === 'function') props.onChange(draft);
    setPreviewDraft(draft);
    setEditing(false);
  }

  function commitPreview() {
    if (previewDraft === value) return;
    if (typeof props.onChange === 'function') props.onChange(previewDraft);
  }

  const textareaStyle = monospace
    ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.86rem' }
    : undefined;

  return (
    <div className="field-preview-editor mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-1">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {props.labelNode || (props.hideLabel ? null : <Form.Label className="mb-0">{label}</Form.Label>)}
          {props.suggestionControl || null}
        </div>
        <Button
          size="sm"
          variant="outline-secondary"
          className="field-preview-editor-pencil"
          onClick={openEditor}
          aria-label={'Edit ' + label}
          title={'Edit ' + label}
        >
          {props.editIcon || PENCIL_ICON}
        </Button>
      </div>

      {props.abovePreview || null}

      <Form.Control
        as="textarea"
        ref={textareaRef}
        className={'field-preview-editor-textarea' + (monospace ? ' field-preview-editor-textarea--mono' : '')}
        rows={previewRows}
        value={previewDraft}
        placeholder={emptyMessage}
        style={textareaStyle}
        onChange={function(e) { setPreviewDraft(e.target.value); }}
        onBlur={commitPreview}
      />

      {!usesExternalEdit ? (
        <Modal
          show={editing}
          onHide={function() { setEditing(false); }}
          fullscreen
          backdrop="static"
          className={'field-preview-editor-modal' + (props.fillDialogHeight ? ' field-preview-editor-modal--fill' : '')}
        >
          <Modal.Header closeButton>
            <Modal.Title>Edit {label}</Modal.Title>
          </Modal.Header>
          <Modal.Body className={'field-preview-editor-modal-body' + (props.fillDialogHeight ? ' field-preview-editor-modal-body--fill' : '')}>
            {props.dialogToolbar ? (
              <div className="field-preview-editor-dialog-toolbar mb-2">
                {typeof props.dialogToolbar === 'function'
                  ? props.dialogToolbar({ draft: draft, setDraft: setDraft, textareaRef: dialogTextareaRef })
                  : props.dialogToolbar}
              </div>
            ) : null}
            {typeof props.renderDialogExtra === 'function'
              ? props.renderDialogExtra(draft, { setDraft: setDraft })
              : (props.dialogPreview || null)}
            <Form.Control
              as="textarea"
              ref={dialogTextareaRef}
              className={'field-preview-editor-dialog-textarea' + (props.fillDialogHeight ? ' field-preview-editor-dialog-textarea--fill' : '')}
              rows={props.fillDialogHeight ? undefined : (props.dialogRows || 22)}
              style={textareaStyle}
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
      ) : null}
    </div>
  );
}
