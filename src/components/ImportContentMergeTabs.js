import { useMemo, useState } from 'react';
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap';
import LyricsMergePanel, { buildLyricsMergeResult } from './mediaImportWizard/LyricsMergePanel';
import { appendNotationLines } from '../mediaImportChordUtils';

function TextSourcePreview(props) {
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

function renderMergeToolbar(props) {
  const disabled = !(props.sourceText && props.sourceText.trim());
  return (
    <div className="media-import-merge-tab-toolbar">
      <Button
        size="sm"
        variant="success"
        disabled={disabled}
        onClick={function() { props.onOverwrite(props.sourceText); }}
      >
        Overwrite current with {props.label}
      </Button>
      <Button
        size="sm"
        variant="outline-primary"
        disabled={disabled}
        onClick={function() { props.onAppend(props.sourceText); }}
      >
        Append {props.label}
      </Button>
    </div>
  );
}

export function LyricsContentMergeTabs(props) {
  const currentText = props.currentText || '';
  const sources = Array.isArray(props.sources) ? props.sources.filter(function(source) {
    return source && String(source.text || '').trim();
  }) : [];
  const [innerTab, setInnerTab] = useState('current');

  const currentLines = useMemo(function() {
    return currentText.split(/\r?\n/).filter(function(line) { return line.trim(); });
  }, [currentText]);

  if (sources.length === 0) return null;

  function applyOverwrite(text) {
    if (typeof props.onChange === 'function') props.onChange(text);
    setInnerTab('current');
  }

  function applyAppend(text) {
    const next = [currentText.trim(), String(text || '').trim()].filter(Boolean).join('\n');
    if (typeof props.onChange === 'function') props.onChange(next);
    setInnerTab('current');
  }

  return (
    <div className="import-content-merge-tabs import-content-merge-tabs--lyrics mb-2">
      <Tabs activeKey={innerTab} onSelect={setInnerTab} className="mb-2">
        <Tab eventKey="current" title="Current">
          <TextSourcePreview text={currentText} emptyMessage="No lyrics entered yet." />
        </Tab>
        {sources.map(function(source) {
          const sourceLines = String(source.text || '').split(/\r?\n/).filter(function(line) {
            return line.trim();
          });
          const useLineMerge = sourceLines.length > 1 || currentLines.length > 1;
          return (
            <Tab key={source.id} eventKey={source.id} title={source.label}>
              {useLineMerge ? (
                <>
                  <LyricsMergePanel
                    currentLines={currentLines}
                    importedLines={sourceLines}
                    importedLabel={source.label}
                    emptyMessage={'No ' + source.label.toLowerCase() + ' available.'}
                  />
                  <Button
                    size="sm"
                    variant="success"
                    className="mt-2"
                    onClick={function() {
                      const merged = buildLyricsMergeResult(currentLines, sourceLines);
                      applyOverwrite(merged.join('\n'));
                    }}
                  >
                    Apply merged lyrics
                  </Button>
                </>
              ) : (
                <>
                  {renderMergeToolbar({
                    sourceText: source.text,
                    label: source.label,
                    onOverwrite: applyOverwrite,
                    onAppend: applyAppend,
                  })}
                  <TextSourcePreview text={source.text} emptyMessage={'No ' + source.label.toLowerCase() + ' available.'} />
                </>
              )}
            </Tab>
          );
        })}
      </Tabs>
    </div>
  );
}

export function NotationContentMergeTabs(props) {
  const currentText = props.currentText || '';
  const sources = Array.isArray(props.sources) ? props.sources.filter(function(source) {
    return source && String(source.text || '').trim();
  }) : [];
  const [innerTab, setInnerTab] = useState('current');

  if (sources.length === 0) return null;

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

  return (
    <div className="import-content-merge-tabs import-content-merge-tabs--notation mb-2">
      <Tabs activeKey={innerTab} onSelect={setInnerTab} className="mb-2">
        <Tab eventKey="current" title="Current">
          <TextSourcePreview text={currentText} emptyMessage="No ABC notes entered yet." />
        </Tab>
        {sources.map(function(source) {
          return (
            <Tab key={source.id} eventKey={source.id} title={source.label}>
              {renderMergeToolbar({
                sourceText: source.text,
                label: source.label,
                onOverwrite: applyOverwrite,
                onAppend: applyAppend,
              })}
              <TextSourcePreview text={source.text} emptyMessage={'No ' + source.label.toLowerCase() + ' available.'} />
            </Tab>
          );
        })}
      </Tabs>
    </div>
  );
}
