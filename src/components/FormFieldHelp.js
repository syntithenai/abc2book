import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { icons } from '../Icons';

export function FieldHelpModal({ show, title, body, fields, onHide }) {
  const items = fields && fields.length > 0
    ? fields
    : (title && body ? [{ title: title, body: body }] : []);

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Help'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {items.map(function(field) {
          return (
            <div key={field.title} style={{ marginBottom: '1em' }}>
              <strong>{field.title}</strong>
              <div style={{ marginTop: '0.25em' }}>{field.body}</div>
            </div>
          );
        })}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function FormFieldHelp({ title, body, fields, className, buttonTitle }) {
  const [show, setShow] = useState(false);
  const modalTitle = title || (fields && fields[0] ? fields[0].title : 'Help');
  const ariaLabel = buttonTitle || ('Help: ' + modalTitle);

  return (
    <>
      <Button
        variant="outline-secondary"
        size="sm"
        className={'form-field-help-btn' + (className ? ' ' + className : '')}
        onClick={function(e) { e.preventDefault(); e.stopPropagation(); setShow(true); }}
        title={ariaLabel}
        aria-label={ariaLabel}
      >
        {icons.question}
      </Button>
      <FieldHelpModal
        show={show}
        title={modalTitle}
        body={body}
        fields={fields}
        onHide={function() { setShow(false); }}
      />
    </>
  );
}

export function FormLabelWithHelp({ label, helpTitle, helpBody, helpFields, htmlFor, className, style }) {
  return (
    <span className={'form-label-with-help' + (className ? ' ' + className : '')} style={style}>
      <label htmlFor={htmlFor} className="form-label form-label-with-help-text">{label}</label>
      <FormFieldHelp title={helpTitle || label} body={helpBody} fields={helpFields} />
    </span>
  );
}
