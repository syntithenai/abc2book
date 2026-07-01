import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import Abc from '../Abc';
import LocalSearchSelectorModal from '../LocalSearchSelectorModal';
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
    && Number(left.quantizeStrength) === Number(right.quantizeStrength)
    && !!left.snapToScale === !!right.snapToScale;
}

const EMPTY_METADATA = {};

export default function MediaImportNotationStep(props) {
  const { draft, onChange, tunebook } = props;
  const metadata = draft.metadata || EMPTY_METADATA;
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

  useEffect(function() {
    if (userEditedRef.current) return;
    const next = draft.melodyNotesText || '';
    setNotesText(next);
    setDebouncedPreview(buildMelodyPreviewAbc(metadata, next));
  }, [draft.melodyNotesText, metadata]);

  useEffect(function() {
    setDebouncedPreview(buildMelodyPreviewAbc(metadata, notesText));
  }, [notesText, metadata]);

  useEffect(function() {
    const timer = setTimeout(function() {
      setDebouncedPreview(buildMelodyPreviewAbc(metadata, notesText));
      onChange({
        melodyNotesText: notesText,
        melodyNotesEdited: userEditedRef.current,
      });
    }, 300);
    return function() { clearTimeout(timer); };
  }, [notesText, onChange, metadata]);

  function handleChange(value) {
    userEditedRef.current = true;
    setNotesText(value);
  }

  function applyNoteSettings(nextSettings) {
    const patch = applyMelodyNoteSettingsToDraft(draft, nextSettings, tunebook);
    userEditedRef.current = false;
    setNotesText(patch.melodyNotesText || '');
    setDebouncedPreview(buildMelodyPreviewAbc(metadata, patch.melodyNotesText || ''));
    onChange(patch);
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

  function handleNotationImport(mergedTune) {
    if (!mergedTune) return;
    const abcTools = tunebook.abcTools;
    const importedAbc = abcTools.json2abc(mergedTune);
    const importedNotes = abcTools.justNotesNoMeta
      ? abcTools.justNotesNoMeta(importedAbc)
      : abcTools.justNotes(importedAbc);
    userEditedRef.current = true;
    setNotesText(importedNotes);
    setDebouncedPreview(buildMelodyPreviewAbc(
      Object.assign({}, metadata, {
        key: mergedTune.key || metadata.key,
        meter: mergedTune.meter || metadata.meter,
        noteLength: mergedTune.noteLength || metadata.noteLength,
      }),
      importedNotes
    ));
    props.onChange({
      melodyNotesText: importedNotes,
      melodyNotesEdited: true,
      metadata: Object.assign({}, metadata, {
        key: mergedTune.key || metadata.key,
        meter: mergedTune.meter || metadata.meter,
        noteLength: mergedTune.noteLength || metadata.noteLength,
      }),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5em', alignItems: 'center', marginBottom: '0.75em', flexWrap: 'wrap' }}>
        <LocalSearchSelectorModal
          value={metadata.name || ''}
          currentTune={props.tune || { id: 'wizard', name: metadata.name || '', rhythm: metadata.rhythm || '' }}
          tunebook={props.tunebook}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          onStageImport={handleNotationImport}
          token={props.token}
        />
        <span style={{ fontSize: '0.9em', color: '#666' }}>
          Look up ABC notation from your collection, The Session, or the web.
        </span>
      </div>
      <Alert variant="info" style={{ marginBottom: '1em' }}>
        Edit the melody below. Changes are previewed with the key and meter from the Metadata step.
        The tune is not updated until you click Finish.
      </Alert>
      {(draft.melodySourceNotes || []).length > 0 && props.resolverAvailable !== false && (
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
            placeholder="Paste or edit ABC notes here"
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
