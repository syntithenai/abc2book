import { useEffect, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

export const FULLSCREEN_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z" />
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

  function applyValue(next) {
    const text = next == null ? '' : String(next);
    setDraft(text);
    setPreviewDraft(text);
    if (typeof props.onChange === 'function') props.onChange(text);
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
          className="field-preview-editor-fullscreen-btn"
          onClick={openEditor}
          aria-label={'Edit ' + label + ' fullscreen'}
          title={'Edit ' + label + ' fullscreen'}
        >
          {props.editIcon || FULLSCREEN_ICON}
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
          className={'field-preview-editor-modal' + (props.fillDialogHeight ? ' field-preview-editor-modal--fill' : '')}
        >
          <Modal.Header closeButton>
            <Modal.Title>Edit {label}</Modal.Title>
          </Modal.Header>
          <Modal.Body className={'field-preview-editor-modal-body' + (props.fillDialogHeight ? ' field-preview-editor-modal-body--fill' : '')}>
            {props.dialogToolbar ? (
              <div className="field-preview-editor-dialog-toolbar mb-2">
                {typeof props.dialogToolbar === 'function'
                  ? props.dialogToolbar({
                    draft: draft,
                    setDraft: applyValue,
                    textareaRef: dialogTextareaRef,
                  })
                  : props.dialogToolbar}
              </div>
            ) : null}
            {typeof props.renderDialogExtra === 'function'
              ? props.renderDialogExtra(draft, { setDraft: applyValue })
              : (props.dialogPreview || null)}
            <Form.Control
              as="textarea"
              ref={dialogTextareaRef}
              className={'field-preview-editor-dialog-textarea' + (props.fillDialogHeight ? ' field-preview-editor-dialog-textarea--fill' : '')}
              rows={props.fillDialogHeight ? undefined : (props.dialogRows || 22)}
              style={textareaStyle}
              value={draft}
              onChange={function(e) { applyValue(e.target.value); }}
              autoFocus
            />
          </Modal.Body>
        </Modal>
      ) : null}
    </div>
  );
}
