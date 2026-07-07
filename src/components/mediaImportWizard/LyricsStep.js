import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap';
import { buildSectionsFromLines } from '../../timedLyricsModel';
import LyricsMergePanel from './LyricsMergePanel';

function splitLyricText(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

export default function MediaImportLyricsStep(props) {
  const draft = props.draft;
  const resolverAvailable = props.resolverAvailable !== false;
  const lyricLines = useMemo(function() {
    if (Array.isArray(draft.lyricLines)) {
      return draft.lyricLines;
    }
    return Array.isArray(draft.existingWLines) ? draft.existingWLines : [];
  }, [draft.lyricLines, draft.existingWLines]);

  const transcribedLines = useMemo(function() {
    if (!draft.timedLyrics) return [];
    return (draft.timedLyrics.lines || []).map(function(line) {
      return line.text || '';
    });
  }, [draft.timedLyrics]);

  const lookupLines = useMemo(function() {
    return Array.isArray(draft.lookupLyricLines) ? draft.lookupLyricLines : [];
  }, [draft.lookupLyricLines]);

  const [innerTab, setInnerTab] = useState('current');
  const mergePanelKeyRef = useRef(0);

  const sections = useMemo(function() {
    if (draft.sections && draft.sections.length > 0) return draft.sections;
    if (draft.timedLyrics) return buildSectionsFromLines(draft.timedLyrics);
    return [];
  }, [draft.sections, draft.timedLyrics]);

  function updateLyrics(lines, patch) {
    props.onChange(Object.assign({
      lyricLines: lines,
      mergedLyricLines: lines,
      sections: sections,
      skipLyricsImport: false,
      lyricsExplicitlyImported: true,
    }, patch || {}));
  }

  function handleImportFromSource(sourceLines) {
    const lines = Array.isArray(sourceLines) ? sourceLines.slice() : [];
    updateLyrics(lines);
    mergePanelKeyRef.current += 1;
    setInnerTab('current');
  }

  function handleSkipLyricsImport() {
    props.onChange({
      lyricLines: [],
      mergedLyricLines: [],
      skipLyricsImport: true,
      lyricsExplicitlyImported: false,
    });
    setInnerTab('current');
  }

  return (
    <div className="media-import-lyrics-step">
      {draft.skipLyricsImport && (
        <Alert variant="secondary" style={{ marginBottom: '0.75em' }}>
          Lyrics import skipped. Chords or notation can still be imported on other tabs.
        </Alert>
      )}

      {resolverAvailable && (
        <div className="media-import-step-actions">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={handleSkipLyricsImport}
          >
            Skip lyrics import
          </Button>
          <span className="media-import-step-actions-hint">
            Review transcript or lookup lyrics, then click Import on that tab to apply them.
          </span>
        </div>
      )}

      {resolverAvailable ? (
        <div className="media-import-lyrics-inner-tabs">
          <Tabs
            activeKey={innerTab}
            onSelect={function(key) { if (key) setInnerTab(key); }}
            className="mb-0"
          >
            <Tab eventKey="current" title="Current lyrics">
              <Form.Control
                as="textarea"
                className="media-import-lyrics-current"
                value={lyricLines.join('\n')}
                onChange={function(e) {
                  updateLyrics(splitLyricText(e.target.value));
                }}
                placeholder="Enter or edit lyrics here..."
              />
            </Tab>
            <Tab eventKey="merge-transcript" title="Import transcript">
              <div className="media-import-merge-tab-toolbar">
                <Button
                  size="sm"
                  variant="success"
                  disabled={transcribedLines.length === 0}
                  onClick={function() { handleImportFromSource(transcribedLines); }}
                >
                  Import transcript
                </Button>
              </div>
              <LyricsMergePanel
                key={'transcript-' + mergePanelKeyRef.current}
                currentLines={lyricLines}
                importedLines={transcribedLines}
                importedLabel="Transcribed"
                emptyMessage="No transcribed lyrics yet. Run Analyze media, or use Search to fetch lyrics."
              />
            </Tab>
            <Tab eventKey="merge-lookup" title="Import lookup lyrics">
              <div className="media-import-merge-tab-toolbar">
                <Button
                  size="sm"
                  variant="success"
                  disabled={lookupLines.length === 0}
                  onClick={function() { handleImportFromSource(lookupLines); }}
                >
                  Import lookup lyrics
                </Button>
              </div>
              <LyricsMergePanel
                key={'lookup-' + mergePanelKeyRef.current}
                currentLines={lyricLines}
                importedLines={lookupLines}
                importedLabel="Lookup lyrics"
                emptyMessage="No lookup lyrics yet. Use Search to fetch lyrics from the web."
              />
            </Tab>
          </Tabs>
        </div>
      ) : (
        <Form.Control
          as="textarea"
          className="media-import-lyrics-current"
          value={lyricLines.join('\n')}
          onChange={function(e) {
            updateLyrics(splitLyricText(e.target.value));
          }}
          placeholder="Enter or edit lyrics here..."
        />
      )}
    </div>
  );
}
