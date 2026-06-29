import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Table } from 'react-bootstrap';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { buildSectionsFromLines } from '../../timedLyricsModel';
import { buildAlignedLyricRows } from '../../lyricsAlignmentUtils';
import { mergeLyricsFromChoices } from '../../lyricsMergeUtils';

const CHOICE_LABELS = {
  existing: 'Keep existing',
  transcribed: 'Use transcribed',
  both: 'Keep both',
  skip: 'Omit',
};

export default function MediaImportLyricsStep(props) {
  const draft = props.draft;
  const existingLines = useMemo(function() {
    return Array.isArray(draft.existingWLines) ? draft.existingWLines : [];
  }, [(draft.existingWLines || []).join('\n')]);

  const transcribedLines = useMemo(function() {
    if (!draft.timedLyrics) return [];
    return (draft.timedLyrics.lines || []).map(function(line) {
      return line.text || '';
    });
  }, [draft.timedLyrics]);

  // Rows are derived synchronously during render so transcribed lyrics are
  // always visible the moment the draft has analysis data (no effect lag).
  const baseRows = useMemo(function() {
    return buildAlignedLyricRows(existingLines, transcribedLines);
  }, [existingLines.join('\n'), transcribedLines.join('\n')]);

  const sections = useMemo(function() {
    if (draft.sections && draft.sections.length > 0) return draft.sections;
    if (draft.timedLyrics) return buildSectionsFromLines(draft.timedLyrics);
    return [];
  }, [draft.sections, draft.timedLyrics]);

  const [choices, setChoices] = useState({});
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [viewMode, setViewMode] = useState('merge');

  useEffect(function() {
    setChoices(function(previous) {
      const next = {};
      baseRows.forEach(function(row) {
        next[row.id] = previous[row.id] || row.choice || row.defaultChoice;
      });
      return next;
    });
  }, [baseRows]);

  useEffect(function() {
    const merged = mergeLyricsFromChoices(baseRows, choices);
    props.onChange({
      lyricRows: baseRows.map(function(row) {
        return Object.assign({}, row, { choice: choices[row.id] || row.defaultChoice });
      }),
      mergedLyricLines: merged,
      sections: sections,
    });
  }, [baseRows, choices, sections]);

  const diffCount = baseRows.filter(function(row) { return row.type !== 'same'; }).length;

  function updateChoice(rowId, value) {
    setChoices(function(current) {
      return Object.assign({}, current, { [rowId]: value });
    });
  }

  function setAllChoices(mapper) {
    setChoices(function() {
      const next = {};
      baseRows.forEach(function(row) {
        next[row.id] = mapper(row);
      });
      return next;
    });
  }

  function preferExisting() {
    setAllChoices(function(row) { return row.type === 'added' ? 'skip' : 'existing'; });
  }

  function preferTranscribed() {
    setAllChoices(function(row) { return row.type === 'removed' ? 'skip' : 'transcribed'; });
  }

  if (!draft.timedLyrics && transcribedLines.length === 0 && existingLines.length === 0) {
    return (
      <Alert variant="warning">
        No lyrics are available yet. Run the analysis on the Analyze step, or add lyrics on the tune first.
      </Alert>
    );
  }

  return (
    <div>
      <Alert variant="info">
        Edit stanza boundaries and choose how each line should merge.
        Stanza endings will use double bar lines in the finished ABC.
      </Alert>

      <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '1em', alignItems: 'center' }}>
        <Button size="sm" variant="outline-secondary" onClick={preferExisting}>Prefer existing</Button>
        <Button size="sm" variant="outline-primary" onClick={preferTranscribed}>Prefer transcribed</Button>
        <Form.Check
          type="switch"
          id="wizard-show-unchanged"
          label="Show unchanged lines"
          checked={showUnchanged}
          onChange={function(e) { setShowUnchanged(e.target.checked); }}
        />
        <div style={{ marginLeft: 'auto' }}>
          <Button
            size="sm"
            variant={viewMode === 'merge' ? 'primary' : 'outline-primary'}
            onClick={function() { setViewMode('merge'); }}
          >
            Merge
          </Button>{' '}
          <Button
            size="sm"
            variant={viewMode === 'diff' ? 'primary' : 'outline-primary'}
            onClick={function() { setViewMode('diff'); }}
          >
            Side-by-side diff
          </Button>
        </div>
      </div>

      {sections.length > 0 && (
        <Table bordered size="sm" style={{ marginBottom: '1em' }}>
          <thead>
            <tr><th>Stanza</th><th>Lines</th></tr>
          </thead>
          <tbody>
            {sections.map(function(section, index) {
              return (
                <tr key={section.id || index}>
                  <td>{section.label || ('Section ' + (index + 1))}</td>
                  <td>{section.startLine + 1} – {section.endLine + 1}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {viewMode === 'diff' ? (
        <div style={{ fontSize: '0.85em' }}>
          <ReactDiffViewer
            oldValue={existingLines.join('\n')}
            newValue={transcribedLines.join('\n')}
            splitView={true}
            compareMethod={DiffMethod.WORDS}
            leftTitle="Existing lyrics"
            rightTitle="Transcribed lyrics"
            showDiffOnly={!showUnchanged}
          />
        </div>
      ) : (
        <Table bordered size="sm" responsive>
          <thead>
            <tr>
              <th>Existing w:</th>
              <th>Transcribed</th>
              <th>Change</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>
            {baseRows.map(function(row) {
              if (row.type === 'same' && !showUnchanged) return null;
              return (
                <tr key={row.id}>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{row.existing || '—'}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{row.transcribed || '—'}</td>
                  <td>{row.type}</td>
                  <td>
                    {row.type === 'same' ? 'Unchanged' : (
                      <Form.Select
                        size="sm"
                        value={choices[row.id] || row.defaultChoice}
                        onChange={function(e) { updateChoice(row.id, e.target.value); }}
                      >
                        {Object.keys(CHOICE_LABELS).map(function(key) {
                          if (row.type === 'added' && key === 'existing') return null;
                          if (row.type === 'removed' && key === 'transcribed') return null;
                          return <option key={key} value={key}>{CHOICE_LABELS[key]}</option>;
                        })}
                      </Form.Select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {diffCount === 0 && existingLines.length > 0 && (
        <Alert variant="success">Transcription matches existing lyrics.</Alert>
      )}
    </div>
  );
}
