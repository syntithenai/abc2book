import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import KeySignatureInput from './KeySignatureInput';

/**
 * Pick a key or meter for inline [K:…] / [M:…] insertion or edit.
 */
export default function NotationInlineSignatureModal(props) {
  const kind = props.kind || 'key';
  const isKey = kind === 'key';
  const [key, setKey] = useState(props.initialKey || 'C');
  const [meter, setMeter] = useState(props.initialMeter || '4/4');

  useEffect(function() {
    if (!props.show) return;
    setKey(props.initialKey || 'C');
    setMeter(props.initialMeter || '4/4');
  }, [props.show, props.initialKey, props.initialMeter, kind]);

  function handleClose() {
    if (typeof props.onHide === 'function') props.onHide();
  }

  function handleApply(value, opts) {
    if (typeof props.onApply === 'function') {
      props.onApply(value, opts);
    }
    if (!(opts && opts.keepOpen)) {
      handleClose();
    }
  }

  function handleMeterChange(val) {
    const next = val ? val.value : '4/4';
    setMeter(next);
    handleApply(next, { keepOpen: !!props.eventId });
  }

  const meterOptions = props.tunebook && props.tunebook.abcTools && props.tunebook.abcTools.getTimeSignatureTypes
    ? props.tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
      return { value: type, label: type };
    })
    : [];

  const title = props.eventId
    ? (isKey ? 'Edit key change' : 'Edit time signature change')
    : (isKey ? 'Insert key change' : 'Insert time signature change');

  return (
    <Modal show={!!props.show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isKey ? (
          <Form.Group controlId="notation-inline-signature-key">
            <Form.Label>Key</Form.Label>
            <KeySignatureInput
              value={key}
              onChange={setKey}
              aria-label="Key signature"
            />
          </Form.Group>
        ) : (
          <Form.Group controlId="notation-inline-signature-meter">
            <Form.Label>Time signature</Form.Label>
            <CreatableSelect
              inputId="notation-inline-signature-meter-select"
              aria-label="Time signature"
              value={meter ? { value: meter, label: meter } : null}
              onChange={handleMeterChange}
              options={meterOptions}
              isClearable={false}
              blurInputOnSelect={true}
              createOptionPosition="first"
              allowCreateWhileLoading={true}
            />
            <Form.Text className="text-muted">
              Time signature changes are inserted at the start of the bar.
            </Form.Text>
          </Form.Group>
        )}
      </Modal.Body>
      {isKey ? (
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={function() { handleApply(key); }}>
            {props.eventId ? 'Update' : 'Insert'}
          </Button>
        </Modal.Footer>
      ) : null}
    </Modal>
  );
}
