import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import Abc from '../Abc';
import MelodyProcessingPanel from '../MelodyProcessingPanel';
import { applyMelodyNoteSettingsToDraft } from '../../melodyRefilterUtils';

function buildMelodyPreviewAbc(metadata, melodyNotesText) {
  const meta = metadata || {};
  return [
    'X:1',
    'M:' + (meta.meter || '4/4'),
    'L:' + (meta.noteLength || '1/8'),
    'K:' + (meta.key || 'C'),
    melodyNotesText || '',
  ].join('\n');
}

function settingsEqual(left, right) {
  if (!left || !right) return false;
  return left.noiseMode === right.noiseMode
    && Number(left.confidenceThreshold) === Number(right.confidenceThreshold)
    && Number(left.minNoteSeconds) === Number(right.minNoteSeconds)
    && Number(left.quantizeStrength) === Number(right.quantizeStrength);
}

export default function MediaImportNotationStep(props) {
  const draft = props.draft;
  const metadata = draft.metadata || {};
  const userEditedRef = useRef(!!draft.melodyNotesEdited);
  const [notesText, setNotesText] = useState(draft.melodyNotesText || '');
  const [debouncedPreview, setDebouncedPreview] = useState(
    buildMelodyPreviewAbc(metadata, draft.melodyNotesText || '')
  );
  const [pendingNoteSettings, setPendingNoteSettings] = useState(null);
  const [showSettingsWarning, setShowSettingsWarning] = useState(false);

  useEffect(function() {
    userEditedRef.current = !!draft.melodyNotesEdited;
  }, [draft.melodyNotesEdited]);

  // When analysis or note settings refresh melodyNotesText, load it unless the user has edited.
  useEffect(function() {
    if (userEditedRef.current) return;
    const next = draft.melodyNotesText || '';
    setNotesText(next);
    setDebouncedPreview(buildMelodyPreviewAbc(metadata, next));
  }, [draft.melodyNotesText]);

  // Re-render preview when metadata key/meter changes (e.g. detected key on Metadata tab).
  useEffect(function() {
    setDebouncedPreview(buildMelodyPreviewAbc(metadata, notesText));
  }, [metadata.key, metadata.meter, metadata.noteLength]);

  useEffect(function() {
    const timer = setTimeout(function() {
      setDebouncedPreview(buildMelodyPreviewAbc(metadata, notesText));
      props.onChange({
        melodyNotesText: notesText,
        melodyNotesEdited: userEditedRef.current,
      });
    }, 300);
    return function() { clearTimeout(timer); };
  }, [notesText]);

  function handleChange(value) {
    userEditedRef.current = true;
    setNotesText(value);
  }

  function applyNoteSettings(nextSettings) {
    const patch = applyMelodyNoteSettingsToDraft(draft, nextSettings, props.tunebook);
    userEditedRef.current = false;
    setNotesText(patch.melodyNotesText || '');
    setDebouncedPreview(buildMelodyPreviewAbc(metadata, patch.melodyNotesText || ''));
    props.onChange(patch);
  }

  function handleNoteSettingsChange(nextSettings) {
    if (settingsEqual(nextSettings, draft.melodyNoteSettings)) {
      return;
    }
    if (draft.melodyNotesEdited || userEditedRef.current) {
      setPendingNoteSettings(nextSettings);
      setShowSettingsWarning(true);
      return;
    }
    applyNoteSettings(nextSettings);
  }

  function confirmSettingsChange() {
    if (pendingNoteSettings) {
      applyNoteSettings(pendingNoteSettings);
    }
    setPendingNoteSettings(null);
    setShowSettingsWarning(false);
  }

  function cancelSettingsChange() {
    setPendingNoteSettings(null);
    setShowSettingsWarning(false);
  }

  if (!draft.melodyAbcText && !notesText.trim() && !(draft.melodySourceNotes || []).length) {
    return (
      <Alert variant="info">
        No transcribed melody is available yet. Run analysis on the Analyze step, or paste ABC notes here after analysis completes.
      </Alert>
    );
  }

  return (
    <div>
      <Alert variant="info" style={{ marginBottom: '1em' }}>
        Edit the transcribed melody below. Changes are previewed with the key and meter from the Metadata step.
        The tune is not updated until you click Finish.
      </Alert>
      {(draft.melodySourceNotes || []).length > 0 && (
        <MelodyProcessingPanel
          variant="notation"
          settings={draft.melodyNoteSettings}
          persist={false}
          onChange={handleNoteSettingsChange}
        />
      )}
      {draft.melodyNotesEdited && (
        <Alert variant="warning" style={{ marginBottom: '1em' }}>
          You have edited the melody manually. Changing note detection settings will replace your edits.
        </Alert>
      )}
      <div className="media-import-wizard-split">
        <div>
          <Abc
            tunebook={props.tunebook}
            abc={debouncedPreview}
            hidePlayer={true}
            hideSvg={false}
            editableTempo={false}
            autoStart={false}
          />
        </div>
        <div>
          <textarea
            value={notesText}
            onChange={function(e) { handleChange(e.target.value); }}
            placeholder="Transcribed melody (ABC notes only)"
          />
        </div>
      </div>

      <Modal show={showSettingsWarning} onHide={cancelSettingsChange}>
        <Modal.Header closeButton>
          <Modal.Title>Replace manual melody edits?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Changing note detection settings will discard your manual melody edits and rebuild the notation
          from the detected pitch data using the new confidence, length, and quantize filters.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={cancelSettingsChange}>
            Cancel
          </Button>
          <Button variant="warning" onClick={confirmSettingsChange}>
            Replace melody
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
