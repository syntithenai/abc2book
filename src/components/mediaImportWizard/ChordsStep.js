import { useMemo, useState } from 'react';
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap';
import { appendChordGrids } from '../../mediaImportChordUtils';

function ChordSourcePreview(props) {
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

export default function MediaImportChordsStep(props) {
  const { draft, onChange } = props;
  const [innerTab, setInnerTab] = useState('current');

  const currentChords = draft.chordGridText || '';
  const analyzedChords = draft.analyzedChordGridText || '';
  const lookupChords = draft.lookupChordGridText || '';

  const hasAnalyzedChords = useMemo(function() {
    return !!(analyzedChords && analyzedChords.trim());
  }, [analyzedChords]);

  function applyOverwrite(sourceText) {
    onChange({
      chordGridText: sourceText,
      chordsFromNotation: false,
    });
    setInnerTab('current');
  }

  function applyAppend(sourceText) {
    onChange({
      chordGridText: appendChordGrids(currentChords, sourceText),
      chordsFromNotation: false,
    });
    setInnerTab('current');
  }

  function renderMergeActions(sourceText, label) {
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
    <div className="media-import-chords-step">
      <p>Edit the compressed chord grid. Chords are merged into the notation when you click Finish.</p>
      {draft.chordsFromNotation && (
        <Alert variant="info">
          Current chords were copied from the existing notation. Analysis and lookup chords stay on their own tabs until you import them.
        </Alert>
      )}

      <Tabs
        activeKey={innerTab}
        onSelect={function(key) { if (key) setInnerTab(key); }}
        className="media-import-chords-inner-tabs mb-3"
      >
        <Tab eventKey="current" title="Current chords">
          <Form.Control
            as="textarea"
            className="media-import-chords-textarea"
            value={currentChords}
            onChange={function(e) {
              onChange({ chordGridText: e.target.value, chordsFromNotation: false });
            }}
            placeholder={'eg\nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C'}
          />
        </Tab>
        <Tab eventKey="merge-analysis" title="Import analysis chords">
          {renderMergeActions(analyzedChords, 'analysis')}
          <ChordSourcePreview
            text={analyzedChords}
            emptyMessage={hasAnalyzedChords
              ? 'No analysis chords available.'
              : 'No analysis chords yet. Run Analyze media to detect chords from the recording.'}
          />
        </Tab>
        <Tab eventKey="merge-lookup" title="Import lookup chords">
          {renderMergeActions(lookupChords, 'lookup')}
          <ChordSourcePreview
            text={lookupChords}
            emptyMessage="No lookup chords yet. Use Search to fetch chords from the web."
          />
        </Tab>
      </Tabs>
    </div>
  );
}
