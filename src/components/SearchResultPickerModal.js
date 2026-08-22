import { Button, ListGroup, Modal } from 'react-bootstrap';
import ReactDiffViewer from 'react-diff-viewer-continued';
import AbcSnippetPreview from './AbcSnippetPreview';
import { notationSourceBadgeLabel } from '../notationSearchSites';
import SelectAllToggle from './SelectAllToggle';
import './SearchResultPickerModal.css';

function SuggestionTextCompare(props) {
  const original = props.original != null ? String(props.original) : '';
  const suggested = props.suggested != null ? String(props.suggested) : '';
  if (!original && !suggested) return null;
  return (
    <div className="search-result-picker-diff">
      <ReactDiffViewer
        oldValue={original}
        newValue={suggested}
        splitView
        hideLineNumbers={suggested.length < 800 && original.length < 800}
        showDiffOnly={false}
        useDarkTheme={false}
        leftTitle="Current"
        rightTitle="Suggested"
      />
    </div>
  );
}

function formatCandidateLabel(item, fallbackTitle) {
  if (item && item.__current) {
    const preview = item.preview != null ? String(item.preview).trim() : '';
    if (!preview) return '(empty)';
    // Keep the row title short; full text renders in the preview pane below.
    return 'Original Value';
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

function isDeferredMidiItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.importFormat === 'midi') return true;
  const meta = item.tuneMeta && item.tuneMeta.meta;
  return !!(meta && meta.importFormat === 'midi') || !!item.midiBytes;
}

function midiPlaceholderLabel(item) {
  const source = String((item && (item.source || item.matchType)) || '').toLowerCase();
  if (source === 'midi-resources' || (item && item.sourceUrl && String(item.sourceUrl).indexOf('/midi-resources/') >= 0)) {
    return 'Local MIDI — import with wizard';
  }
  return 'MIDI file — import with wizard';
}

function formatMatchType(item) {
  if (!item) return '';
  if (item.__current || item.isCurrent || item.id === 'current') return 'Original Value';
  if (item.importFormat === 'pdf' || (item.pdfAttachment && item.pdfAttachment.downloadUrl)) {
    const badge = notationSourceBadgeLabel(item.source)
    return badge ? badge + ' · Sheet PDF' : 'Sheet PDF (no MusicXML)';
  }
  const source = item.matchType || item.source || '';
  if (source && source !== 'current' && source !== 'original') {
    return notationSourceBadgeLabel(source) || String(source);
  }
  const artist = item.artist ? String(item.artist).trim() : '';
  if (artist && looksLikeMatchMeta(artist)) return artist;
  if (artist && item.title) return artist;
  return '';
}

function itemHasAbcPreview(item) {
  if (!item) return false;
  if (isDeferredMidiItem(item)) return false;
  if (item.pdfAttachment && item.pdfAttachment.downloadUrl) return false;
  if (typeof item.abc === 'string' && item.abc.trim()) return true;
  const preview = item.preview != null ? String(item.preview) : '';
  if (!preview.trim()) return false;
  if (preview.indexOf('X:') >= 0 || preview.indexOf('|') >= 0) return true;
  return /[A-Ga-g]/.test(preview);
}

function itemPreviewText(item) {
  if (!item) return '';
  if (item.preview != null && String(item.preview).trim()) return String(item.preview);
  if (typeof item.abc === 'string' && item.abc.trim() && !itemHasAbcPreview(item)) {
    return item.abc;
  }
  return '';
}

function shouldShowTextPreview(item, notationLayout) {
  if (notationLayout) return false;
  const preview = itemPreviewText(item);
  if (!preview.trim()) return false;
  // Avoid duplicating short scalar values already shown in the title row.
  const label = formatCandidateLabel(item, '');
  if (preview.trim() === label.trim()) return false;
  if (item && item.__current && label === 'Original Value') return true;
  return preview.trim().length > 0;
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
  const textCompareLayout = layout === 'lyrics' || layout === 'text';
  const headerComment = String(comment || '').trim();
  const showBulkActions = !!(multiSelect && (typeof onSelectAll === 'function' || typeof onSelectNone === 'function'));
  const originalItem = Array.isArray(items)
    ? items.find(function(item) { return item && item.__current; })
    : null;
  const originalPreview = itemPreviewText(originalItem);

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
    const preview = itemPreviewText(item);
    const showPreview = shouldShowTextPreview(item, notationLayout);
    return (
      <ListGroup.Item
        key={(item && item.sourceUrl) || (label + '-' + index)}
        action
        active={!!(multiSelect && isSelected)}
        className={
          'search-result-picker-row'
          + (isOriginal ? ' search-result-picker-row--original' : '')
          + (showPreview ? ' search-result-picker-row--has-preview' : '')
        }
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
        {showPreview ? (
          <pre
            className="search-result-picker-row-preview"
            data-testid={isOriginal ? 'search-result-original-preview' : 'search-result-suggestion-preview'}
          >
            {preview}
          </pre>
        ) : null}
        {textCompareLayout && !isOriginal && originalPreview && preview && preview !== originalPreview ? (
          <div
            className="search-result-picker-row-compare"
            data-testid="search-result-suggestion-compare"
            onClick={function(e) { e.stopPropagation(); }}
          >
            <div className="search-result-picker-row-compare-label">Compare with current</div>
            <SuggestionTextCompare original={originalPreview} suggested={preview} />
          </div>
        ) : null}
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
              {isDeferredMidiItem(item)
                ? midiPlaceholderLabel(item)
                : ((item && item.pdfAttachment && item.pdfAttachment.downloadUrl)
                  ? 'Sheet PDF will be attached to this tune'
                  : 'No notation preview')}
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
      size={notationLayout || textCompareLayout ? undefined : 'lg'}
      fullscreen={notationLayout || textCompareLayout ? true : undefined}
      scrollable
      dialogClassName={
        notationLayout
          ? 'search-result-picker-modal search-result-picker-modal--notation'
          : (textCompareLayout
            ? 'search-result-picker-modal search-result-picker-modal--text-compare'
            : 'search-result-picker-modal')
      }
    >
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Choose a result'}</Modal.Title>
      </Modal.Header>
      <Modal.Body className={
        notationLayout
          ? 'search-result-picker-body--notation'
          : (textCompareLayout ? 'search-result-picker-body--text-compare' : undefined)
      }>
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
              ) : textCompareLayout ? (
                <p className="text-muted small mb-2">
                  Original Value is listed first. Each suggestion shows its text and a side-by-side compare with the current value. Click a row to use it.
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
