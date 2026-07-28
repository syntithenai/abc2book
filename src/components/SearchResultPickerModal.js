import { Button, ListGroup, Modal } from 'react-bootstrap';
import AbcSnippetPreview from './AbcSnippetPreview';
import { notationSourceBadgeLabel } from '../notationSearchSites';
import SelectAllToggle from './SelectAllToggle';
import './SearchResultPickerModal.css';

function formatCandidateLabel(item, fallbackTitle) {
  if (item && item.__current) {
    const preview = item.preview != null ? String(item.preview).trim() : '';
    if (preview) return preview;
    if (item.title && item.title !== 'Original Value' && item.title !== 'Current value') {
      return String(item.title);
    }
    return '(empty)';
  }
  if (item && item.titleOnly) {
    return (fallbackTitle || item.title || 'Song') + ' (title search)';
  }
  const artist = item && item.artist ? String(item.artist).trim() : '';
  const title = item && item.title ? String(item.title).trim() : (fallbackTitle || '');
  if (artist && title && !looksLikeMatchMeta(artist)) return title;
  if (title) return title;
  if (artist) return artist;
  return 'Result';
}

function looksLikeMatchMeta(text) {
  const value = String(text || '').trim().toLowerCase();
  return value === 'writer' || value === 'performer' || value === 'original';
}

function formatMatchType(item) {
  if (!item) return '';
  if (item.__current || item.isCurrent || item.id === 'current') return 'Original Value';
  if (item.importFormat === 'pdf' || (item.pdfAttachment && item.pdfAttachment.downloadUrl)) {
    const badge = notationSourceBadgeLabel(item.source)
    return badge ? badge + ' · Sheet PDF' : 'Sheet PDF (no MusicXML)';
  }
  if (item.matchType) return String(item.matchType);
  const source = item.source ? String(item.source).trim() : '';
  if (source && source !== 'current' && source !== 'original') {
    return notationSourceBadgeLabel(source) || source;
  }
  const artist = item.artist ? String(item.artist).trim() : '';
  if (artist && looksLikeMatchMeta(artist)) return artist;
  if (artist && item.title) return artist;
  return '';
}

function itemHasAbcPreview(item) {
  if (!item) return false;
  if (item.pdfAttachment && item.pdfAttachment.downloadUrl) return false;
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
  comment,
  onSelect,
  onHide,
  onSkip,
  skipLabel,
  multiSelect,
  selectedIndexes,
  onDone,
  doneLabel,
  onSelectAll,
  onSelectNone,
  layout,
  previewMetadata,
}) {
  const selected = Array.isArray(selectedIndexes) ? selectedIndexes : [];
  const selectedSet = new Set(selected);
  const notationLayout = layout === 'notation';
  const headerComment = String(comment || '').trim();
  const showBulkActions = !!(multiSelect && (typeof onSelectAll === 'function' || typeof onSelectNone === 'function'));

  function renderBulkActions() {
    if (!showBulkActions) return null;
    const selectableCount = items ? items.filter(function(item) { return !(item && item.__current); }).length : 0;
    const selectedSelectableCount = items
      ? items.reduce(function(count, item, index) {
        if (item && item.__current) return count;
        return count + (selectedSet.has(index) ? 1 : 0);
      }, 0)
      : 0;
    return (
      <div className="search-result-picker-bulk-actions select-all-host mb-2" data-testid="search-result-picker-bulk-actions">
        <SelectAllToggle
          size="sm"
          totalCount={selectableCount}
          selectedCount={selectedSelectableCount}
          onSelectAll={onSelectAll}
          onSelectNone={onSelectNone}
          ariaLabel="Select all results"
        />
      </div>
    );
  }

  function renderListItem(item, index) {
    const label = formatCandidateLabel(item, fallbackTitle);
    const matchType = formatMatchType(item);
    const isSelected = selectedSet.has(index);
    const isOriginal = !!(item && item.__current);
    return (
      <ListGroup.Item
        key={(item && item.sourceUrl) || (label + '-' + index)}
        action
        active={!!(multiSelect && isSelected)}
        className={'search-result-picker-row' + (isOriginal ? ' search-result-picker-row--original' : '')}
        onClick={function() { onSelect(item, index); }}
      >
        <div className="search-result-picker-row-inner">
          <strong className="search-result-picker-row-value">{label}</strong>
          <span className="search-result-picker-row-meta">
            {multiSelect && isSelected ? (
              <span className="badge text-bg-success">Added</span>
            ) : null}
            {matchType ? (
              <span className="search-result-picker-row-match">{matchType}</span>
            ) : null}
          </span>
        </div>
      </ListGroup.Item>
    );
  }

  function renderNotationCard(item, index) {
    const label = formatCandidateLabel(item, fallbackTitle);
    const matchType = formatMatchType(item);
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
          <span className="search-result-picker-row-meta">
            {multiSelect && isSelected ? (
              <span className="badge text-bg-success">Added</span>
            ) : null}
            {matchType ? (
              <span className="search-result-picker-row-match">{matchType}</span>
            ) : null}
          </span>
        </div>
        <div className="search-result-notation-card-staff">
          {itemHasAbcPreview(item) ? (
            <AbcSnippetPreview item={item} metadata={previewMetadata} maxBars={8} />
          ) : (
            <div className="text-muted small">
              {(item && item.pdfAttachment && item.pdfAttachment.downloadUrl)
                ? 'Sheet PDF will be attached to this tune'
                : 'No notation preview'}
            </div>
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
        {headerComment ? (
          <p className="search-result-picker-comment mb-2" data-testid="search-result-picker-comment">
            {headerComment}
          </p>
        ) : null}
        {!items || items.length === 0
          ? <p style={{ marginBottom: 0 }}>{emptyMessage || 'No results available.'}</p>
          : notationLayout ? (
            <>
              {renderBulkActions()}
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
              {renderBulkActions()}
              {multiSelect ? (
                <p className="text-muted small mb-2">
                  Click to add. You can select multiple, then Done when finished.
                </p>
              ) : null}
              <ListGroup variant="flush" className="search-result-picker-list">
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
