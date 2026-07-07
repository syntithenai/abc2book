import { useEffect, useState } from 'react';
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap';
import Abc from '../Abc';
import LocalSearchSelectorModal from '../LocalSearchSelectorModal';
import MelodyProcessingPanel from '../MelodyProcessingPanel';
import { appendNotationLines } from '../../mediaImportChordUtils';
import { applyMelodyNoteSettingsToDraft } from '../../melodyRefilterUtils';
import { mergeLookupTuneMetadata } from '../../mediaImportWizardState';

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

function NotationSourcePreview(props) {
  const text = props.text || '';
  if (!text.trim()) {
    return <Alert variant="info">{props.emptyMessage}</Alert>;
  }
  return (
    <Form.Control
      as="textarea"
      className="media-import-chords-textarea media-import-chords-preview"
      value={text}
      readOnly
    />
  );
}

const EMPTY_METADATA = {};

export default function MediaImportNotationStep(props) {
  const { draft, onChange, tunebook } = props;
  const metadata = draft.metadata || EMPTY_METADATA;
  const [innerTab, setInnerTab] = useState('current');

  const currentNotes = draft.melodyNotesText || '';
  const analyzedNotes = draft.analyzedMelodyNotesText || '';
  const lookupNotes = draft.lookupMelodyNotesText || '';
  const hasAnalyzedNotes = !!(analyzedNotes && analyzedNotes.trim());

  const [previewAbc, setPreviewAbc] = useState(buildMelodyPreviewAbc(metadata, currentNotes));

  useEffect(function() {
    const timer = setTimeout(function() {
      setPreviewAbc(buildMelodyPreviewAbc(metadata, currentNotes));
    }, 300);
    return function() { clearTimeout(timer); };
  }, [currentNotes, metadata]);

  function applyOverwrite(sourceText, metadataSource) {
    const patch = {
      melodyNotesText: sourceText,
      melodyNotesEdited: true,
    };
    if (metadataSource) {
      patch.metadata = mergeLookupTuneMetadata(metadata, metadataSource);
    }
    onChange(patch);
    setInnerTab('current');
  }

  function applyAppend(sourceText, metadataSource) {
    const patch = {
      melodyNotesText: appendNotationLines(currentNotes, sourceText),
      melodyNotesEdited: true,
    };
    if (metadataSource) {
      patch.metadata = mergeLookupTuneMetadata(metadata, metadataSource);
    }
    onChange(patch);
    setInnerTab('current');
  }

  function renderMergeActions(sourceText, label, metadataSource) {
    const disabled = !(sourceText && sourceText.trim());
    return (
      <div className="media-import-merge-tab-toolbar">
        <Button
          size="sm"
          variant="success"
          disabled={disabled}
          onClick={function() { applyOverwrite(sourceText, metadataSource); }}
        >
          Overwrite current with {label}
        </Button>
        <Button
          size="sm"
          variant="outline-primary"
          disabled={disabled}
          onClick={function() { applyAppend(sourceText, metadataSource); }}
        >
          Append {label}
        </Button>
      </div>
    );
  }

  function applyAnalyzedNoteSettings(nextSettings) {
    const patch = applyMelodyNoteSettingsToDraft(draft, nextSettings, tunebook);
    onChange({
      melodyNoteSettings: patch.melodyNoteSettings,
      timedMelody: patch.timedMelody,
      melodyAbcText: patch.melodyAbcText,
      analyzedMelodyNotesText: patch.melodyNotesText || '',
    });
  }

  function handleLookupStage(mergedTune) {
    if (!mergedTune) return;
    const abcTools = tunebook.abcTools;
    const importedAbc = abcTools.json2abc(mergedTune);
    const importedNotes = abcTools.justNotesNoMeta
      ? abcTools.justNotesNoMeta(importedAbc)
      : abcTools.justNotes(importedAbc);
    const sourceLabel = mergedTune.name
      ? String(mergedTune.name)
      : (mergedTune.source || 'Lookup');
    onChange({
      lookupMelodyNotesText: importedNotes,
      lookupNotationSource: sourceLabel,
      lookupNotationTune: mergedTune,
      metadata: mergeLookupTuneMetadata(metadata, mergedTune),
    });
    setInnerTab('merge-lookup');
  }

  return (
    <div className="media-import-notation-step">
      <p>
        Edit the current melody notation, or import transcribed or lookup versions using overwrite or append.
        The tune is not updated until you click Finish.
      </p>

      <Tabs
        activeKey={innerTab}
        onSelect={function(key) { if (key) setInnerTab(key); }}
        className="media-import-notation-inner-tabs mb-3"
      >
        <Tab eventKey="current" title="Current notation">
          <div className="media-import-wizard-split">
            <div>
              <Abc
                tunebook={props.tunebook}
                abc={previewAbc}
                hidePlayer={true}
                hideSvg={false}
                editableTempo={false}
                autoStart={false}
              />
            </div>
            <div>
              <Form.Control
                as="textarea"
                className="media-import-chords-textarea"
                value={currentNotes}
                onChange={function(e) {
                  onChange({
                    melodyNotesText: e.target.value,
                    melodyNotesEdited: true,
                  });
                }}
                placeholder="Paste or edit ABC notes here"
              />
            </div>
          </div>
        </Tab>
        <Tab eventKey="merge-analysis" title="Import transcribed">
          {renderMergeActions(analyzedNotes, 'transcription', null)}
          {(draft.melodySourceNotes || []).length > 0 && props.resolverAvailable !== false && (
            <MelodyProcessingPanel
              variant="notation"
              settings={draft.melodyNoteSettings}
              persist={false}
              onChange={applyAnalyzedNoteSettings}
            />
          )}
          <NotationSourcePreview
            text={analyzedNotes}
            emptyMessage={hasAnalyzedNotes
              ? 'No transcribed melody available.'
              : 'No transcribed melody yet. Run Analyze media to detect melody from the recording.'}
          />
        </Tab>
        <Tab eventKey="merge-lookup" title="Import lookup">
          <div style={{ display: 'flex', gap: '0.5em', alignItems: 'center', marginBottom: '0.75em', flexWrap: 'wrap' }}>
            <LocalSearchSelectorModal
              value={metadata.name || ''}
              currentTune={props.tune || { id: 'wizard', name: metadata.name || '', rhythm: metadata.rhythm || '' }}
              tunebook={props.tunebook}
              searchIndex={props.searchIndex}
              loadTuneTexts={props.loadTuneTexts}
              onStageImport={handleLookupStage}
              token={props.token}
            />
            <span style={{ fontSize: '0.9em', color: '#666' }}>
              Look up ABC notation from your collection, The Session, or the web.
            </span>
          </div>
          {draft.lookupNotationSource ? (
            <Alert variant="info" style={{ marginBottom: '0.75em' }}>
              Lookup source: {draft.lookupNotationSource}
            </Alert>
          ) : null}
          {renderMergeActions(lookupNotes, 'lookup', draft.lookupNotationTune || null)}
          <NotationSourcePreview
            text={lookupNotes}
            emptyMessage="No lookup notation yet. Use the search button above to find ABC notation."
          />
        </Tab>
      </Tabs>
    </div>
  );
}
