import { Alert, Button, Form } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import ComposerSearchButton from '../ComposerSearchButton';
import ComposerCandidateQuickPick from '../ComposerCandidateQuickPick';

function PendingImportCard(props) {
  const item = props.item;
  if (!item || !item.available) return null;
  return (
    <div className="media-import-pending-card">
      <div className="media-import-pending-card-header">
        <strong>{item.label}</strong>
        {item.source ? <span className="text-muted">{item.source}</span> : null}
      </div>
      {item.preview ? (
        <pre className="media-import-pending-preview">{item.preview}</pre>
      ) : null}
      {typeof props.onImport === 'function' && (
        <Button size="sm" variant="outline-primary" onClick={props.onImport}>
          {props.importLabel || 'Import into metadata'}
        </Button>
      )}
    </div>
  );
}

export default function MediaImportMetadataStep(props) {
  const draft = props.draft || {};
  const metadata = draft.metadata || {};
  const tunebook = props.tunebook;

  function update(field, value) {
    props.onChange(Object.assign({}, metadata, { [field]: value }));
  }

  function importBackgroundInfo() {
    if (!draft.lookupBackgroundInfo || !draft.lookupBackgroundInfo.trim()) return;
    update('backgroundInfo', draft.lookupBackgroundInfo.trim());
  }

  const pendingItems = [
    {
      key: 'background',
      label: 'Background info',
      source: draft.lookupBackgroundSource || '',
      available: !!(draft.lookupBackgroundInfo && draft.lookupBackgroundInfo.trim()),
      preview: draft.lookupBackgroundInfo
        ? draft.lookupBackgroundInfo.trim().slice(0, 500) + (draft.lookupBackgroundInfo.length > 500 ? '...' : '')
        : '',
    },
    {
      key: 'analysis-chords',
      label: 'Analysis chords',
      source: 'Media analysis',
      available: !!(draft.analyzedChordGridText && draft.analyzedChordGridText.trim()),
      preview: draft.analyzedChordGridText
        ? draft.analyzedChordGridText.trim().split('\n').slice(0, 4).join('\n')
        : '',
    },
    {
      key: 'lookup-chords',
      label: 'Lookup chords',
      source: draft.lookupLyricSource || 'Web search',
      available: !!(draft.lookupChordGridText && draft.lookupChordGridText.trim()),
      preview: draft.lookupChordGridText
        ? draft.lookupChordGridText.trim().split('\n').slice(0, 4).join('\n')
        : '',
    },
    {
      key: 'transcript-lyrics',
      label: 'Transcript lyrics',
      source: 'Media analysis',
      available: !!(draft.timedLyrics && draft.timedLyrics.lines && draft.timedLyrics.lines.length > 0),
      preview: draft.timedLyrics
        ? draft.timedLyrics.lines.map(function(line) { return line.text; }).slice(0, 4).join('\n')
        : '',
    },
    {
      key: 'lookup-lyrics',
      label: 'Lookup lyrics',
      source: draft.lookupLyricSource || 'Web search',
      available: Array.isArray(draft.lookupLyricLines) && draft.lookupLyricLines.some(function(line) {
        return String(line || '').trim();
      }),
      preview: Array.isArray(draft.lookupLyricLines)
        ? draft.lookupLyricLines.slice(0, 4).join('\n')
        : '',
    },
    {
      key: 'analysis-notation',
      label: 'Analysis melody',
      source: 'Media analysis',
      available: !!(draft.analyzedMelodyNotesText && draft.analyzedMelodyNotesText.trim()),
      preview: draft.analyzedMelodyNotesText
        ? draft.analyzedMelodyNotesText.trim().split('\n').slice(0, 4).join('\n')
        : '',
    },
    {
      key: 'lookup-notation',
      label: 'Lookup notation',
      source: draft.lookupNotationSource || 'Collection / web search',
      available: !!(draft.lookupMelodyNotesText && draft.lookupMelodyNotesText.trim()),
      preview: draft.lookupMelodyNotesText
        ? draft.lookupMelodyNotesText.trim().split('\n').slice(0, 4).join('\n')
        : '',
    },
  ].filter(function(item) { return item.available; });

  return (
    <Form>
      <Form.Group className="mb-3">
        <Form.Label>Title</Form.Label>
        <Form.Control
          value={metadata.name || ''}
          onChange={function(e) { update('name', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
          <Form.Label style={{ marginBottom: 0 }}>Composer</Form.Label>
          <ComposerSearchButton
            title={metadata.name || ''}
            composer={metadata.composer || ''}
            titleHint={metadata.name || ''}
            token={props.token}
            tunebook={props.tunebook}
            resolverAvailable={props.resolverAvailable}
            alwaysPick={true}
            inline={true}
            onComposer={function(result) {
              if (result && result.artist) {
                update('composer', result.artist);
                if (typeof props.onDraftChange === 'function') {
                  props.onDraftChange({ lookupComposerCandidates: [] });
                }
              }
            }}
          />
        </div>
        {Array.isArray(draft.lookupComposerCandidates) && draft.lookupComposerCandidates.length > 0 ? (
          <ComposerCandidateQuickPick
            className="mb-2"
            candidates={draft.lookupComposerCandidates}
            placeholder="Review discovered artist…"
            onSelect={function(artist) {
              update('composer', artist);
              if (typeof props.onDraftChange === 'function') {
                props.onDraftChange({ lookupComposerCandidates: [] });
              }
            }}
          />
        ) : null}
        <Form.Control
          value={metadata.composer || ''}
          onChange={function(e) { update('composer', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Time signature</Form.Label>
        <CreatableSelect
          value={metadata.meter ? { value: metadata.meter, label: metadata.meter } : { value: '', label: '' }}
          onChange={function(val) { update('meter', val ? val.label : ''); }}
          options={tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
            return { value: type, label: type };
          })}
          isClearable={false}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Key</Form.Label>
        <Form.Control
          value={metadata.key || ''}
          onChange={function(e) { update('key', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Tempo (BPM)</Form.Label>
        <Form.Control
          type="number"
          min="1"
          placeholder="eg 120"
          value={metadata.tempo || ''}
          onChange={function(e) { update('tempo', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Background info</Form.Label>
        <Form.Control
          as="textarea"
          rows={5}
          value={metadata.backgroundInfo || ''}
          onChange={function(e) { update('backgroundInfo', e.target.value); }}
          placeholder="Song history, context, and notes..."
        />
      </Form.Group>

      {pendingItems.length > 0 && (
        <div className="media-import-pending-section">
          <h6>Available imports</h6>
          <p className="text-muted" style={{ fontSize: '0.95em' }}>
            These results are ready from analysis or lookup. Import them on the relevant tab, or bring background info into metadata here.
          </p>
          {pendingItems.map(function(item) {
            if (item.key === 'background') {
              return (
                <PendingImportCard
                  key={item.key}
                  item={item}
                  importLabel="Use as background info"
                  onImport={importBackgroundInfo}
                />
              );
            }
            return <PendingImportCard key={item.key} item={item} />;
          })}
        </div>
      )}

      {draft.analyzed && pendingItems.length === 0 && (
        <Alert variant="info" style={{ marginBottom: 0 }}>
          Analysis and search results will appear here when available.
        </Alert>
      )}
    </Form>
  );
}
