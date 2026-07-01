import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap';
import { buildSectionsFromLines } from '../../timedLyricsModel';
import { buildLyricsMergeResult } from './LyricsMergePanel';
import LyricsMergePanel from './LyricsMergePanel';

function splitLyricText(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

export default function MediaImportLyricsStep(props) {
  const draft = props.draft;
  const resolverAvailable = props.resolverAvailable !== false;
  const lyricLines = useMemo(function() {
    if (Array.isArray(draft.lyricLines) && draft.lyricLines.length > 0) {
      return draft.lyricLines;
    }
    if (Array.isArray(draft.mergedLyricLines) && draft.mergedLyricLines.length > 0) {
      return draft.mergedLyricLines;
    }
    return Array.isArray(draft.existingWLines) ? draft.existingWLines : [];
  }, [draft.lyricLines, draft.mergedLyricLines, draft.existingWLines]);

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

  function updateLyrics(lines) {
    props.onChange({
      lyricLines: lines,
      mergedLyricLines: lines,
      sections: sections,
    });
  }

  function handleMergeFromSource(sourceLines) {
    const merged = buildLyricsMergeResult(lyricLines, sourceLines);
    updateLyrics(merged);
    mergePanelKeyRef.current += 1;
    setInnerTab('current');
  }

  function handleMergeActiveTab() {
    if (innerTab === 'merge-transcript') {
      handleMergeFromSource(transcribedLines);
      return;
    }
    if (innerTab === 'merge-lookup') {
      handleMergeFromSource(lookupLines);
    }
  }

  const canMerge = innerTab === 'merge-transcript'
    ? transcribedLines.length > 0
    : innerTab === 'merge-lookup'
      ? lookupLines.length > 0
      : false;

  return (
    <div className="media-import-lyrics-step">
      {resolverAvailable && (
        <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '0.75em', alignItems: 'center' }}>
          <Button
            size="sm"
            variant="success"
            disabled={!canMerge}
            onClick={handleMergeActiveTab}
          >
            Merge
          </Button>
          <span style={{ fontSize: '0.9em', color: '#666' }}>
            Copy merge selections from the active merge tab into current lyrics.
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
          <Tab eventKey="merge-transcript" title="Merge transcript">
            <LyricsMergePanel
              key={'transcript-' + mergePanelKeyRef.current}
              currentLines={lyricLines}
              importedLines={transcribedLines}
              importedLabel="Transcribed"
              emptyMessage="No transcribed lyrics yet. Run Analyze media, or use Search to fetch lyrics."
            />
          </Tab>
          <Tab eventKey="merge-lookup" title="Merge lookup lyrics">
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
