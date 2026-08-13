import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import {
  PRESET_ORDER,
  TASK_LINKED_COVER,
  audioGenerationUnavailableMessage,
  defaultPresetForTask,
  mergeBackendsPresets,
  presetLabel,
} from '../audioGenerationPresets';

export default function RegenerateCoverModal(props) {
  const {
    show,
    link,
    tune,
    defaultStylePrompt,
    backends,
    busy,
    error: submitError,
    onHide,
    onConfirm,
  } = props;

  const providerUnavailableMessage = audioGenerationUnavailableMessage(backends);
  const presetOptions = mergeBackendsPresets(backends, TASK_LINKED_COVER);
  const availablePresets = presetOptions.length
    ? presetOptions.filter(function(preset) { return preset.available !== false; })
    : (providerUnavailableMessage
      ? []
      : PRESET_ORDER.map(function(id) {
        return { id: id, label: presetLabel(id), available: true };
      }));

  const [stylePrompt, setStylePrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [presetId, setPresetId] = useState(defaultPresetForTask(TASK_LINKED_COVER));
  const [validationError, setValidationError] = useState('');

  useEffect(function() {
    if (!show) return;
    setStylePrompt(defaultStylePrompt || '');
    setLyrics('');
    setValidationError('');
    const unavailable = audioGenerationUnavailableMessage(backends);
    const options = presetOptions.length
      ? presetOptions.filter(function(preset) { return preset.available !== false; })
      : (unavailable
        ? []
        : PRESET_ORDER.map(function(id) {
          return { id: id, label: presetLabel(id), available: true };
        }));
    const defaultPreset = options.find(function(item) { return item.default; })
      || options[0];
    setPresetId(defaultPreset ? defaultPreset.id : defaultPresetForTask(TASK_LINKED_COVER));
  }, [show, defaultStylePrompt, backends]);

  function handleSubmit(event) {
    event.preventDefault();
    if (providerUnavailableMessage || availablePresets.length === 0) {
      setValidationError(providerUnavailableMessage || 'Audio generation is not available.');
      return;
    }
    const trimmed = stylePrompt.trim();
    if (!trimmed) {
      setValidationError('Enter a style prompt for the cover.');
      return;
    }
    if (typeof onConfirm === 'function') {
      onConfirm({
        stylePrompt: trimmed,
        lyrics: lyrics.trim(),
        presetId: presetId,
      });
    }
  }

  const linkTitle = (link && link.title) || (tune && tune.name) || 'Linked recording';

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title>Regenerate cover</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <p className="text-muted mb-3">
            Create a new AI cover from <strong>{linkTitle}</strong>. Describe the style you want.
          </p>
          {providerUnavailableMessage ? (
            <div className="alert alert-warning py-2" role="alert">
              {providerUnavailableMessage}
            </div>
          ) : null}
          {availablePresets.length > 1 ? (
            <Form.Group className="mb-3">
              <Form.Label>Quality</Form.Label>
              <Form.Select
                value={presetId}
                onChange={function(e) { setPresetId(e.target.value); }}
                disabled={busy}
              >
                {availablePresets.map(function(preset) {
                  return (
                    <option key={preset.id} value={preset.id}>
                      {preset.label || presetLabel(preset.id)}
                    </option>
                  );
                })}
              </Form.Select>
            </Form.Group>
          ) : null}
          <Form.Group className="mb-3">
            <Form.Label>Style prompt</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={stylePrompt}
              onChange={function(e) { setStylePrompt(e.target.value); }}
              disabled={busy}
              placeholder="e.g. upbeat jazz trio with brushed drums"
              autoFocus
            />
          </Form.Group>
          <Form.Group className="mb-0">
            <Form.Label>Lyrics (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={lyrics}
              onChange={function(e) { setLyrics(e.target.value); }}
              disabled={busy}
            />
          </Form.Group>
          {(submitError || validationError) ? (
            <div className="text-danger small mt-2">{submitError || validationError}</div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !!providerUnavailableMessage || availablePresets.length === 0}
          >
            {busy ? 'Starting…' : 'Regenerate'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
