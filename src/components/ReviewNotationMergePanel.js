import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap';
import Abc from './Abc';
import { appendNotationLines } from '../mediaImportChordUtils';

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

function NotationPreview(props) {
  const text = props.text || '';
  if (!text.trim()) {
    return <Alert variant="info">{props.emptyMessage}</Alert>;
  }
  return (
    <div className="review-notation-merge-preview">
      <Abc abc={props.previewAbc} />
      <Form.Control
        as="textarea"
        className="media-import-chords-textarea media-import-chords-preview mt-2"
        value={text}
        readOnly
        rows={6}
      />
    </div>
  );
}

export default function ReviewNotationMergePanel(props) {
  const currentText = props.currentText || '';
  const importedText = props.importedText || '';
  const metadata = props.metadata || {};
  const [innerTab, setInnerTab] = useState('current');

  const hasImport = !!(importedText && importedText.trim());
  const currentPreviewAbc = useMemo(function() {
    return buildMelodyPreviewAbc(metadata, currentText);
  }, [metadata, currentText]);
  const importPreviewAbc = useMemo(function() {
    return buildMelodyPreviewAbc(metadata, importedText);
  }, [metadata, importedText]);

  useEffect(function() {
    if (!hasImport) setInnerTab('current');
  }, [hasImport]);

  if (!hasImport) return null;

  function applyOverwrite(text) {
    if (typeof props.onChange === 'function') props.onChange(text);
    setInnerTab('current');
  }

  function applyAppend(text) {
    if (typeof props.onChange === 'function') {
      props.onChange(appendNotationLines(currentText, text));
    }
    setInnerTab('current');
  }

  function renderToolbar(sourceText, label) {
    const disabled = !(sourceText && sourceText.trim());
    return (
      <div className="media-import-merge-tab-toolbar">
        <Button
          size="sm"
          variant="success"
          disabled={disabled}
          onClick={function() { applyOverwrite(sourceText); }}
        >
          Overwrite current with {label}
        </Button>
        <Button
          size="sm"
          variant="outline-primary"
          disabled={disabled}
          onClick={function() { applyAppend(sourceText); }}
        >
          Append {label}
        </Button>
      </div>
    );
  }

  return (
    <div className="review-notation-merge-panel mb-2">
      <Tabs activeKey={innerTab} onSelect={setInnerTab} className="mb-2">
        <Tab eventKey="current" title="Current">
          <NotationPreview
            text={currentText}
            previewAbc={currentPreviewAbc}
            emptyMessage="No ABC notes entered yet."
          />
        </Tab>
        <Tab eventKey="import" title="Import">
          {renderToolbar(importedText, 'import')}
          <NotationPreview
            text={importedText}
            previewAbc={importPreviewAbc}
            emptyMessage="No imported notation available."
          />
        </Tab>
      </Tabs>
    </div>
  );
}
