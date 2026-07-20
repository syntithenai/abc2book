import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Form, Tab, Tabs } from 'react-bootstrap';
import Abc from './Abc';

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

function notesMatch(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

/**
 * Import Review notation chooser: tab selection is the value that will be saved.
 * Labels are "Use current" / "Use import".
 */
export default function ReviewNotationMergePanel(props) {
  const liveText = props.currentText || '';
  const importedText = props.importedText || '';
  const metadata = props.metadata || {};
  const baselineRef = useRef(null);
  const [activeTab, setActiveTab] = useState('current');

  const hasImport = !!(importedText && importedText.trim());

  // Freeze "current" baseline when the import source for this candidate appears.
  useEffect(function() {
    if (!hasImport) {
      baselineRef.current = null;
      setActiveTab('current');
      return;
    }
    baselineRef.current = liveText;
    setActiveTab(notesMatch(liveText, importedText) ? 'import' : 'current');
    // Intentionally only when import body changes (new candidate / new import).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedText, hasImport]);

  const baselineText = baselineRef.current != null ? baselineRef.current : liveText;
  const previewAbc = useMemo(function() {
    return buildMelodyPreviewAbc(metadata, liveText);
  }, [metadata, liveText]);

  if (!hasImport) return null;

  function selectTab(nextKey) {
    if (!nextKey || nextKey === activeTab) return;
    setActiveTab(nextKey);
    const nextText = nextKey === 'import' ? importedText : baselineText;
    if (typeof props.onChange === 'function' && !notesMatch(liveText, nextText)) {
      props.onChange(nextText);
    }
    if (typeof props.onSourceChange === 'function') {
      props.onSourceChange(nextKey);
    }
  }

  function handleEdit(text) {
    if (typeof props.onChange === 'function') props.onChange(text);
    // Edits while on "Use current" update the baseline so re-selecting keeps them.
    if (activeTab === 'current') {
      baselineRef.current = text;
    }
  }

  return (
    <div className="review-notation-merge-panel mb-2" data-testid="review-notation-merge">
      <Form.Label className="mb-1">Notation</Form.Label>
      <Tabs activeKey={activeTab} onSelect={selectTab} className="mb-2">
        <Tab eventKey="current" title="Use current" />
        <Tab eventKey="import" title="Use import" />
      </Tabs>
      <div className="review-notation-merge-preview">
        {String(liveText || '').trim() ? (
          props.tunebook ? (
            <Abc
              tunebook={props.tunebook}
              abc={previewAbc}
              hidePlayer={true}
              hideSvg={false}
              editableTempo={false}
              autoStart={false}
              scale={0.5}
            />
          ) : null
        ) : (
          <Alert variant="info" className="mb-2">
            {activeTab === 'import' ? 'No imported notation available.' : 'No ABC notes entered yet.'}
          </Alert>
        )}
        <Form.Control
          as="textarea"
          className="media-import-chords-textarea media-import-chords-preview mt-2"
          data-testid="review-notation-merge-abc"
          value={liveText}
          rows={5}
          onChange={function(event) { handleEdit(event.target.value); }}
        />
      </div>
    </div>
  );
}
