import { Alert, Button, Form, Nav, Tab } from 'react-bootstrap';
import TuneAliasesField from './TuneAliasesField';
import { buildDraftFromSheetImageResult } from '../sheetImageImportUtils';
import { formatSheetImageWarnings } from '../sheetImageFormatUtils';

function buildPreviewState(result, chordText, melodyAbc, meta) {
  if (!result) return null;
  const useMeta = meta || {};
  const merged = Object.assign({}, result, {
    title: useMeta.title,
    artist: useMeta.artist,
    chordSheet: Object.assign({}, result.chordSheet, { text: chordText }),
    melody: melodyAbc
      ? Object.assign({}, result.melody || {}, {
        abc: melodyAbc,
        key: useMeta.key || (result.melody && result.melody.key) || '',
        meter: useMeta.meter || (result.melody && result.melody.meter) || '',
      })
      : (useMeta.key || useMeta.meter
        ? { key: useMeta.key, meter: useMeta.meter, abc: '' }
        : null),
  });
  try {
    const draft = buildDraftFromSheetImageResult(merged);
    const chordPreview = draft.chordDraft;
    return {
      title: useMeta.title || (chordPreview && chordPreview.title) || 'Untitled',
      composer: useMeta.artist || (chordPreview && chordPreview.composer) || '',
      key: useMeta.key || (chordPreview && chordPreview.key) || '',
      meter: useMeta.meter || (chordPreview && chordPreview.meter) || '',
      pageType: merged.pageType,
      barCount: chordPreview ? chordPreview.barCount : 0,
      sectionCount: chordPreview ? chordPreview.sectionCount : 0,
      hasMelody: !!String(melodyAbc || '').trim(),
      warnings: formatSheetImageWarnings(draft.warnings || []),
    };
  } catch (e) {
    return null;
  }
}

export default function SheetImageTranscriptionPanel(props) {
  const result = props.result;
  const chordText = props.chordText || '';
  const melodyAbc = props.melodyAbc || '';
  const metaTitle = props.metaTitle || '';
  const metaArtist = props.metaArtist || '';
  const metaAliases = Array.isArray(props.metaAliases) ? props.metaAliases : [];
  const metaKey = props.metaKey || '';
  const metaMeter = props.metaMeter || '';
  const activeTab = props.activeTab || 'chords';
  const preview = props.preview != null
    ? props.preview
    : buildPreviewState(result, chordText, melodyAbc, {
      title: metaTitle,
      artist: metaArtist,
      key: metaKey,
      meter: metaMeter,
    });

  function updateMeta(patch) {
    if (typeof props.onMetaChange === 'function') {
      props.onMetaChange(Object.assign({
        title: metaTitle,
        artist: metaArtist,
        aliases: metaAliases,
        key: metaKey,
        meter: metaMeter,
      }, patch));
    }
  }

  if (!result) return null;

  return (
    <div className="sheet-image-transcription-panel border rounded p-3 mb-3 bg-light">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <strong>Sheet transcription{props.fileName ? ': ' + props.fileName : ''}</strong>
        <div className="d-flex gap-2">
          {typeof props.onApply === 'function' && (
            <Button size="sm" variant="primary" onClick={props.onApply}>Apply to form</Button>
          )}
          {typeof props.onDismiss === 'function' && (
            <Button size="sm" variant="outline-secondary" onClick={props.onDismiss}>Dismiss</Button>
          )}
        </div>
      </div>
      <Form className="mb-3">
        <div className="row g-2">
          <div className="col-md-6">
            <Form.Group>
              <Form.Label>Title</Form.Label>
              <Form.Control
                value={metaTitle}
                onChange={function(e) { updateMeta({ title: e.target.value }); }}
              />
            </Form.Group>
          </div>
          <div className="col-md-6">
            <Form.Group>
              <Form.Label>Composer / artist</Form.Label>
              <Form.Control
                value={metaArtist}
                onChange={function(e) { updateMeta({ artist: e.target.value }); }}
              />
            </Form.Group>
          </div>
          <div className="col-12">
            <TuneAliasesField
              value={metaAliases}
              onChange={function(next) { updateMeta({ aliases: next }); }}
              controlId={props.aliasesControlId || 'sheet-draft-aliases'}
            />
          </div>
          <div className="col-md-3">
            <Form.Group>
              <Form.Label>Key</Form.Label>
              <Form.Control
                value={metaKey}
                onChange={function(e) { updateMeta({ key: e.target.value }); }}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group>
              <Form.Label>Meter</Form.Label>
              <Form.Control
                value={metaMeter}
                onChange={function(e) { updateMeta({ meter: e.target.value }); }}
              />
            </Form.Group>
          </div>
        </div>
      </Form>
      {preview ? (
        <Alert variant="info">
          <strong>{preview.title || 'Untitled'}</strong>
          {preview.composer ? ' — ' + preview.composer : ''}
          <div>
            {preview.pageType || 'unknown'}
            {preview.key ? ' · ' + preview.key : ''}
            {preview.meter ? ' · ' + preview.meter : ''}
            {' · '}{preview.barCount} chord bars · {preview.sectionCount} sections
            {preview.hasMelody ? ' · melody detected' : ''}
          </div>
          {preview.warnings && preview.warnings.length > 0 ? (
            <div className="small text-muted">{preview.warnings.join(' ')}</div>
          ) : null}
        </Alert>
      ) : null}
      <Tab.Container activeKey={activeTab} onSelect={props.onActiveTabChange}>
        <Nav variant="tabs">
          <Nav.Item>
            <Nav.Link eventKey="chords" disabled={!chordText.trim()}>Chords / Lyrics</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="melody" disabled={!melodyAbc.trim()}>Melody ABC</Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content className="pt-3">
          <Tab.Pane eventKey="chords">
            <textarea
              value={chordText}
              onChange={function(e) {
                if (typeof props.onChordTextChange === 'function') props.onChordTextChange(e.target.value);
              }}
              style={{ width: '100%', minHeight: '14em', fontFamily: 'monospace' }}
            />
          </Tab.Pane>
          <Tab.Pane eventKey="melody">
            <textarea
              value={melodyAbc}
              onChange={function(e) {
                if (typeof props.onMelodyAbcChange === 'function') props.onMelodyAbcChange(e.target.value);
              }}
              style={{ width: '100%', minHeight: '14em', fontFamily: 'monospace' }}
            />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
}
