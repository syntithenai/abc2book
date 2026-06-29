import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Table } from 'react-bootstrap';
import {
  buildDefaultLyricsMergeChoices,
  buildLyricsLineDiff,
  countLyricsDiffRows,
  joinLyricsLines,
  lyricsTextsEqual,
  mergeLyricsFromChoices,
  splitLyricsLines,
} from '../lyricsMergeUtils';
import { loadTimedMediaDraft, saveTimedMediaDraft } from '../timedMediaCache';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';

const CHOICE_LABELS = {
  existing: 'Keep existing',
  transcribed: 'Use transcribed',
  both: 'Keep both',
  skip: 'Omit',
};

function resolveTranscriptionText(analysis, draftText) {
  if (draftText && draftText.trim()) return draftText;
  if (analysis && analysis.formatted && analysis.formatted.lyricsText) {
    return analysis.formatted.lyricsText;
  }
  return '';
}

export default function LyricsTranscriptionMerge(props) {
  const { analysis } = useTuneMediaAnalysis({ tune: props.tune });
  const tune = props.tune;
  const [draftText, setDraftText] = useState('');
  const [choices, setChoices] = useState({});
  const [showUnchanged, setShowUnchanged] = useState(false);

  useEffect(function() {
    if (!tune || !tune.id) return;
    loadTimedMediaDraft(tune.id).then(function(draft) {
      setDraftText(draft && draft.transcriptionText ? draft.transcriptionText : '');
    });
  }, [tune && tune.id, analysis && analysis.version]);

  const transcribedText = resolveTranscriptionText(analysis, draftText);
  const existingText = Array.isArray(tune && tune.words) ? tune.words.join('\n') : '';

  const diffRows = useMemo(function() {
    if (!transcribedText.trim()) return [];
    return buildLyricsLineDiff(existingText, transcribedText);
  }, [existingText, transcribedText]);

  useEffect(function() {
    setChoices(buildDefaultLyricsMergeChoices(diffRows));
  }, [diffRows]);

  const diffCount = countLyricsDiffRows(diffRows);
  const mergedPreview = useMemo(function() {
    return joinLyricsLines(mergeLyricsFromChoices(diffRows, choices));
  }, [diffRows, choices]);

  if (!transcribedText.trim()) {
    return null;
  }

  function updateChoice(rowId, value) {
    setChoices(function(current) {
      return Object.assign({}, current, { [rowId]: value });
    });
  }

  function applyAllExisting() {
    const next = {};
    diffRows.forEach(function(row) {
      next[row.id] = row.type === 'added' ? 'skip' : 'existing';
    });
    setChoices(next);
  }

  function applyAllTranscribed() {
    const next = {};
    diffRows.forEach(function(row) {
      next[row.id] = row.type === 'removed' ? 'skip' : 'transcribed';
    });
    setChoices(next);
  }

  function handleApplyMerged() {
    if (!tune) return;
    if (typeof props.pushHistory === 'function') {
      props.pushHistory(tune);
    }
    tune.words = splitLyricsLines(mergedPreview);
    if (typeof props.onSaveTune === 'function') {
      props.onSaveTune(tune);
    }
  }

  function handleReplaceAll() {
    if (!tune) return;
    if (typeof props.pushHistory === 'function') {
      props.pushHistory(tune);
    }
    tune.words = splitLyricsLines(transcribedText);
    if (typeof props.onSaveTune === 'function') {
      props.onSaveTune(tune);
    }
  }

  async function handleDismissTranscription() {
    if (!tune || !tune.id) return;
    await saveTimedMediaDraft(tune.id, { transcriptionText: '' });
    setDraftText('');
  }

  const textsMatch = lyricsTextsEqual(existingText, transcribedText);

  return (
    <div style={{ marginTop: '1em', marginBottom: '1em', clear: 'both' }}>
      <Alert variant="info">
        Transcribed lyrics are saved separately from the lyrics editor.
        Review differences below, then apply the merge you want.
      </Alert>

      {textsMatch ? (
        <Alert variant="success">Transcription matches the current lyrics.</Alert>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '0.75em' }}>
            <Button size="sm" variant="outline-secondary" onClick={applyAllExisting}>
              Prefer existing ({diffCount} difference{diffCount === 1 ? '' : 's'})
            </Button>
            <Button size="sm" variant="outline-primary" onClick={applyAllTranscribed}>
              Prefer transcribed
            </Button>
            <Button size="sm" variant="outline-success" onClick={handleReplaceAll}>
              Replace all lyrics
            </Button>
            <Button size="sm" variant="outline-danger" onClick={handleDismissTranscription}>
              Dismiss transcription
            </Button>
            <Form.Check
              type="switch"
              id="lyrics-merge-show-unchanged"
              label="Show unchanged lines"
              checked={showUnchanged}
              onChange={function(e) { setShowUnchanged(e.target.checked); }}
              style={{ marginLeft: '0.5em' }}
            />
          </div>

          <Table bordered size="sm" responsive style={{ backgroundColor: 'white' }}>
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Existing</th>
                <th style={{ width: '28%' }}>Transcribed</th>
                <th style={{ width: '12%' }}>Change</th>
                <th style={{ width: '32%' }}>Use</th>
              </tr>
            </thead>
            <tbody>
              {diffRows.map(function(row) {
                if (row.type === 'same' && !showUnchanged) return null;
                const rowVariant = row.type === 'same'
                  ? undefined
                  : row.type === 'added'
                    ? 'success'
                    : row.type === 'removed'
                      ? 'danger'
                      : 'warning';
                return (
                  <tr key={row.id} className={rowVariant ? 'table-' + rowVariant : undefined}>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{row.existing || '—'}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{row.transcribed || '—'}</td>
                    <td>{row.type}</td>
                    <td>
                      {row.type === 'same' ? (
                        <span>Unchanged</span>
                      ) : (
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

          <Form.Group className="mb-3">
            <Form.Label>Merged preview</Form.Label>
            <Form.Control
              as="textarea"
              rows={8}
              readOnly
              value={mergedPreview}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Group>

          <Button variant="success" onClick={handleApplyMerged}>
            Apply merged lyrics
          </Button>
        </>
      )}
    </div>
  );
}
