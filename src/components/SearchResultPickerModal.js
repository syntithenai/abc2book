import { Button, ListGroup, Modal } from 'react-bootstrap';

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
}) {
  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Choose a result'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!items || items.length === 0
          ? <p style={{ marginBottom: 0 }}>{emptyMessage || 'No results available.'}</p>
          : <ListGroup variant="flush">
              {items.map(function(item, index) {
                const label = formatCandidateLabel(item, fallbackTitle);
                const source = item && item.source ? String(item.source) : '';
                const preview = item && item.preview ? String(item.preview) : '';
                return (
                  <ListGroup.Item
                    key={(item && item.sourceUrl) || (label + '-' + index)}
                    action
                    onClick={function() { onSelect(item, index); }}
                  >
                    <div><strong>{label}</strong></div>
                    {source && <div style={{ fontSize: '0.9em', color: '#666' }}>{source}</div>}
                    {preview && (
                      <pre style={{
                        marginTop: '0.5em',
                        marginBottom: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: '0.85em',
                        color: '#444',
                        background: '#f8f9fa',
                        padding: '0.5em',
                        borderRadius: '0.25em',
                      }}>
                        {preview}
                      </pre>
                    )}
                  </ListGroup.Item>
                );
              })}
            </ListGroup>}
      </Modal.Body>
      <Modal.Footer>
        {onSkip && (
          <Button variant="outline-primary" onClick={onSkip}>
            {skipLabel || 'Skip'}
          </Button>
        )}
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
}
