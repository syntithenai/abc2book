import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import KeySignatureInput from './KeySignatureInput';
import {
  DEFAULT_VOICE_CLEF,
  VOICE_CLEFS,
  formatVoiceMeta,
  parseVoiceMeta,
} from '../notation/voiceMeta';

/**
 * Edit tune-level key/meter and per-voice clef from the notation staff header.
 */
export default function NotationTuneMetaModal(props) {
  const tune = props.tune || {};
  const voiceKey = props.voiceKey || '1';
  const voice = tune.voices && tune.voices[voiceKey] ? tune.voices[voiceKey] : null;
  const parsedMeta = parseVoiceMeta(voice && voice.meta);

  const [key, setKey] = useState(tune.key || 'C');
  const [meter, setMeter] = useState(tune.meter || '4/4');
  const [clef, setClef] = useState(parsedMeta.clef || DEFAULT_VOICE_CLEF);

  useEffect(function() {
    if (!props.show) return;
    setKey(tune.key || 'C');
    setMeter(tune.meter || '4/4');
    const v = tune.voices && tune.voices[voiceKey] ? tune.voices[voiceKey] : null;
    setClef(parseVoiceMeta(v && v.meta).clef || DEFAULT_VOICE_CLEF);
  }, [props.show, tune.key, tune.meter, tune.voices, voiceKey]);

  function handleClose() {
    if (typeof props.onHide === 'function') props.onHide();
  }

  function handleSave() {
    if (!props.tunebook || typeof props.tunebook.saveTune !== 'function' || !tune.id) {
      handleClose();
      return;
    }
    const next = Object.assign({}, tune, {
      key: key || 'C',
      meter: meter || '4/4',
    });
    const voices = Object.assign({}, tune.voices || {});
    const currentVoice = voices[voiceKey] || { meta: '', notes: [''] };
    const metaFields = parseVoiceMeta(currentVoice.meta);
    voices[voiceKey] = Object.assign({}, currentVoice, {
      meta: formatVoiceMeta(Object.assign({}, metaFields, { clef: clef || DEFAULT_VOICE_CLEF })),
    });
    next.voices = voices;
    props.tunebook.saveTune(next);
    if (typeof props.forceRefresh === 'function') props.forceRefresh();
    handleClose();
  }

  const meterOptions = props.tunebook && props.tunebook.abcTools && props.tunebook.abcTools.getTimeSignatureTypes
    ? props.tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
      return { value: type, label: type };
    })
    : [];

  const title = props.focusField === 'clef'
    ? 'Clef'
    : props.focusField === 'meter'
      ? 'Time signature'
      : props.focusField === 'key'
        ? 'Key signature'
        : 'Tune attributes';

  return (
    <Modal show={!!props.show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3" controlId="notation-tune-meta-key">
          <Form.Label>Key</Form.Label>
          <KeySignatureInput
            value={key}
            onChange={setKey}
            aria-label="Key signature"
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="notation-tune-meta-meter">
          <Form.Label>Time signature</Form.Label>
          <CreatableSelect
            inputId="notation-tune-meta-meter-select"
            aria-label="Time signature"
            value={meter ? { value: meter, label: meter } : null}
            onChange={function(val) { setMeter(val ? val.value : '4/4'); }}
            options={meterOptions}
            isClearable={false}
            blurInputOnSelect={true}
            createOptionPosition="first"
            allowCreateWhileLoading={true}
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="notation-tune-meta-clef">
          <Form.Label>Clef ({voiceKey})</Form.Label>
          <Form.Select
            value={clef || DEFAULT_VOICE_CLEF}
            aria-label="Clef"
            onChange={function(e) { setClef(e.target.value || DEFAULT_VOICE_CLEF); }}
          >
            {VOICE_CLEFS.map(function(c) {
              return <option key={c} value={c}>{c}</option>;
            })}
          </Form.Select>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </Modal.Footer>
    </Modal>
  );
}
