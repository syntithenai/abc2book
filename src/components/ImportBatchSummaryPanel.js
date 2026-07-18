/**
 * Book-scale merge summary for Google/whole-book import → Import Review.
 * Preserves ImportWarningDialog bucket counts and title lists.
 */
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, ListGroup, Nav, Tab } from 'react-bootstrap';

const BUCKETS = [
  { key: 'updates', label: 'Updated', variant: 'primary' },
  { key: 'inserts', label: 'Inserted', variant: 'success' },
  { key: 'localUpdates', label: 'Local Updates', variant: 'warning' },
  { key: 'skippedUpdates', label: 'Up to date', variant: 'secondary' },
  { key: 'duplicates', label: 'Duplicates', variant: 'info' },
  { key: 'deletes', label: 'Deleted', variant: 'danger' },
];

function asTuneList(bucket) {
  if (!bucket) return [];
  if (Array.isArray(bucket)) return bucket;
  if (typeof bucket === 'object') {
    return Object.keys(bucket).map(function(id) { return bucket[id]; });
  }
  return [];
}

function tuneTitle(tune) {
  return (tune && (tune.name || tune.title)) || '(untitled)';
}

export default function ImportBatchSummaryPanel(props) {
  const summary = props.summary || {};
  const [activeKey, setActiveKey] = useState('updates');

  const lists = useMemo(function() {
    return {
      updates: asTuneList(summary.updates),
      inserts: asTuneList(summary.inserts),
      localUpdates: asTuneList(summary.localUpdates),
      skippedUpdates: asTuneList(summary.skippedUpdates),
      duplicates: asTuneList(summary.duplicates),
      deletes: asTuneList(summary.deletes),
    };
  }, [summary]);

  const counts = useMemo(function() {
    const c = {};
    BUCKETS.forEach(function(b) {
      c[b.key] = lists[b.key].length;
    });
    return c;
  }, [lists]);

  const firstNonEmpty = BUCKETS.find(function(b) { return counts[b.key] > 0; });
  const tabKey = counts[activeKey] > 0 ? activeKey : (firstNonEmpty && firstNonEmpty.key) || 'updates';

  const totalActive = counts.updates + counts.inserts + counts.localUpdates + counts.duplicates;

  return (
    <div className="import-batch-summary-panel border rounded p-3 mb-3" data-testid="import-batch-summary">
      <h5 className="mb-2">Import summary</h5>
      <div className="mb-3 small">
        {counts.updates ? <div><b>{counts.updates}</b> items will be updated.</div> : null}
        {counts.skippedUpdates ? <div><b>{counts.skippedUpdates}</b> items are up to date.</div> : null}
        {counts.inserts ? <div><b>{counts.inserts}</b> items will be inserted.</div> : null}
        {counts.deletes ? <div><b>{counts.deletes}</b> items will be removed.</div> : null}
        {counts.localUpdates ? <div><b>{counts.localUpdates}</b> locally changed items need review (local newer).</div> : null}
        {counts.duplicates ? <div><b>{counts.duplicates}</b> duplicate items (same content hash).</div> : null}
        {(summary.counts && summary.counts.libraryMatches) ? (
          <div><b>{summary.counts.libraryMatches}</b> inserts look like existing library tunes (title match — review before adding).</div>
        ) : null}
        {!totalActive && !counts.deletes && !counts.skippedUpdates ? (
          <Alert variant="info" className="mb-0 py-2">Nothing to import from this document.</Alert>
        ) : null}
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {typeof props.onReviewAll === 'function' && totalActive > 0 ? (
          <Button variant="success" onClick={props.onReviewAll} data-testid="batch-review-all">
            Review in queue ({totalActive})
          </Button>
        ) : null}
        {typeof props.onApplyCertain === 'function' && (counts.updates + counts.inserts) > 0 ? (
          <Button variant="outline-success" onClick={props.onApplyCertain} data-testid="batch-apply-certain">
            Apply updates &amp; inserts
          </Button>
        ) : null}
        {typeof props.onIncludeDuplicates === 'function' && counts.duplicates > 0 ? (
          <Button variant="outline-info" onClick={props.onIncludeDuplicates}>
            Include duplicates in review
          </Button>
        ) : null}
        {typeof props.onCancel === 'function' ? (
          <Button variant="secondary" onClick={props.onCancel}>Cancel</Button>
        ) : null}
      </div>

      <Tab.Container activeKey={tabKey} onSelect={function(k) { if (k) setActiveKey(k); }}>
        <Nav variant="tabs" className="mb-2 flex-wrap">
          {BUCKETS.map(function(bucket) {
            if (!counts[bucket.key]) return null;
            return (
              <Nav.Item key={bucket.key}>
                <Nav.Link eventKey={bucket.key}>
                  {bucket.label}{' '}
                  <Badge bg={bucket.variant}>{counts[bucket.key]}</Badge>
                </Nav.Link>
              </Nav.Item>
            );
          })}
        </Nav>
        <Tab.Content>
          {BUCKETS.map(function(bucket) {
            if (!counts[bucket.key]) return null;
            return (
              <Tab.Pane key={bucket.key} eventKey={bucket.key}>
                <ListGroup variant="flush" style={{ maxHeight: '240px', overflow: 'auto' }}>
                  {lists[bucket.key].map(function(tune, index) {
                    return (
                      <ListGroup.Item
                        key={(tune && tune.id) || index}
                        action={typeof props.onSelectTune === 'function'}
                        onClick={function() {
                          if (typeof props.onSelectTune === 'function') {
                            props.onSelectTune(tune, bucket.key);
                          }
                        }}
                      >
                        {tuneTitle(tune)}
                      </ListGroup.Item>
                    );
                  })}
                </ListGroup>
              </Tab.Pane>
            );
          })}
        </Tab.Content>
      </Tab.Container>
    </div>
  );
}
