import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { icons } from '../Icons';

const CHROME_EXTENSIONS_URL = 'chrome://extensions';

export function ChromeExtensionsAddress({ showHint }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return;
    navigator.clipboard.writeText(CHROME_EXTENSIONS_URL).then(function() {
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 2000);
    }).catch(function() {});
  }

  return (
    <span className="chrome-extensions-address">
      <code className="user-select-all">{CHROME_EXTENSIONS_URL}</code>
      {' '}
      <Button
        type="button"
        size="sm"
        variant="outline-secondary"
        className="align-baseline"
        onClick={handleCopy}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {showHint !== false ? (
        <span className="text-muted small d-block mt-1">
          Browsers block web pages from opening internal Chrome addresses — copy and paste this into the address bar.
        </span>
      ) : null}
    </span>
  );
}

function renderHelpBody(body) {
  if (Array.isArray(body)) {
    return body.map(function(part, index) {
      if (typeof part === 'string') return part;
      return <span key={'help-body-part-' + index}>{part}</span>;
    });
  }
  return body;
}

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
        {items.map(function(field, index) {
          return (
            <div key={(field.title || 'help') + '-' + index} style={{ marginBottom: '1em' }}>
              <strong>{field.title}</strong>
              <div style={{ marginTop: '0.25em' }}>{renderHelpBody(field.body)}</div>
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
