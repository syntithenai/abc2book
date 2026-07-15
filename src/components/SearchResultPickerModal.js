import { Button, ListGroup, Modal } from 'react-bootstrap';
import AbcSnippetPreview from './AbcSnippetPreview';
import './SearchResultPickerModal.css';

function formatCandidateLabel(item, fallbackTitle) {
  if (item && item.titleOnly) {
    return (fallbackTitle || item.title || 'Song') + ' (title search)';
  }
  const artist = item && item.artist ? String(item.artist).trim() : '';
  const title = item && item.title ? String(item.title).trim() : (fallbackTitle || '');
  if (artist && title) return artist + ' — ' + title;
  if (artist) return artist;
  return title || 'Result';
}

function itemHasAbcPreview(item) {
  if (!item) return false;
  if (typeof item.abc === 'string' && item.abc.trim()) return true;
  const preview = item.preview != null ? String(item.preview) : '';
  if (!preview.trim()) return false;
  if (preview.indexOf('X:') >= 0 || preview.indexOf('|') >= 0) return true;
  return /[A-Ga-g]/.test(preview);
}

export default function SearchResultPickerModal({
  show,
  title,
  items,
  fallbackTitle,
  emptyMessage,
  onSelect,
  onHide,
  onSkip,
  skipLabel,
  multiSelect,
  selectedIndexes,
  onDone,
  doneLabel,
  layout,
  previewMetadata,
}) {
  const selected = Array.isArray(selectedIndexes) ? selectedIndexes : [];
  const selectedSet = new Set(selected);
  const notationLayout = layout === 'notation';

  function renderListItem(item, index) {
    const label = formatCandidateLabel(item, fallbackTitle);
    const source = item && item.source ? String(item.source) : '';
    const preview = item && item.preview ? String(item.preview) : '';
    const isSelected = selectedSet.has(index);
    return (
      <ListGroup.Item
        key={(item && item.sourceUrl) || (label + '-' + index)}
        action
        active={!!(multiSelect && isSelected)}
        onClick={function() { onSelect(item, index); }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5em' }}>
          <strong style={{ flex: '1 1 auto' }}>{label}</strong>
          {multiSelect && isSelected ? (
            <span className="badge text-bg-success">Added</span>
          ) : null}
        </div>
        {source && <div style={{ fontSize: '0.9em', color: isSelected ? 'inherit' : '#666' }}>{source}</div>}
        {preview && !notationLayout && (
          <pre style={{
            marginTop: '0.5em',
            marginBottom: 0,
            whiteSpace: 'pre-wrap',
            fontSize: '0.85em',
            color: isSelected ? 'inherit' : '#444',
            background: isSelected ? 'transparent' : '#f8f9fa',
            padding: '0.5em',
            borderRadius: '0.25em',
          }}>
            {preview}
          </pre>
        )}
      </ListGroup.Item>
    );
  }

  function renderNotationCard(item, index) {
    const label = formatCandidateLabel(item, fallbackTitle);
    const source = item && item.source ? String(item.source) : '';
    const isSelected = selectedSet.has(index);
    return (
      <button
        type="button"
        key={(item && item.sourceUrl) || (label + '-' + index)}
        className={'search-result-notation-card' + (isSelected ? ' search-result-notation-card--selected' : '')}
        onClick={function() { onSelect(item, index); }}
      >
        <div className="search-result-notation-card-header">
          <strong className="search-result-notation-card-title">{label}</strong>
          {multiSelect && isSelected ? (
            <span className="badge text-bg-success">Added</span>
          ) : null}
        </div>
        {source ? (
          <div className="search-result-notation-card-source">{source}</div>
        ) : null}
        <div className="search-result-notation-card-staff">
          {itemHasAbcPreview(item) ? (
            <AbcSnippetPreview item={item} metadata={previewMetadata} maxBars={8} />
          ) : (
            <div className="text-muted small">No notation preview</div>
          )}
        </div>
      </button>
    );
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      size={notationLayout ? undefined : 'lg'}
      fullscreen={notationLayout ? true : undefined}
      scrollable
      dialogClassName={notationLayout ? 'search-result-picker-modal search-result-picker-modal--notation' : 'search-result-picker-modal'}
    >
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Choose a result'}</Modal.Title>
      </Modal.Header>
      <Modal.Body className={notationLayout ? 'search-result-picker-body--notation' : undefined}>
        {!items || items.length === 0
          ? <p style={{ marginBottom: 0 }}>{emptyMessage || 'No results available.'}</p>
          : notationLayout ? (
            <>
              {multiSelect ? (
                <p className="text-muted small mb-2">
                  Click to add. You can select multiple, then Done when finished.
                </p>
              ) : (
                <p className="text-muted small mb-2">
                  Choose a notation source. Previews show the first staff line (up to 8 bars).
                </p>
              )}
              <div className="search-result-notation-grid">
                {items.map(renderNotationCard)}
              </div>
            </>
          ) : (
            <>
              {multiSelect ? (
                <p className="text-muted small mb-2">
                  Click to add. You can select multiple, then Done when finished.
                </p>
              ) : null}
              <ListGroup variant="flush">
                {items.map(renderListItem)}
              </ListGroup>
            </>
          )}
      </Modal.Body>
      <Modal.Footer>
        {onSkip && (
          <Button variant="outline-primary" onClick={onSkip}>
            {skipLabel || 'Skip'}
          </Button>
        )}
        {multiSelect ? (
          <Button
            variant="primary"
            onClick={typeof onDone === 'function' ? onDone : onHide}
          >
            {doneLabel || 'Done'}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
}
