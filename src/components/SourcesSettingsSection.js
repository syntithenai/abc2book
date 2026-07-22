import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import FormFieldHelp from './FormFieldHelp';
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText';
import {
  buildOwnTunebookSource,
  countTunesForSource,
  formatSourceFilters,
  isManagedSyncSource,
  listSyncSources,
  normalizeSyncSourceFilters,
  removeSyncSource,
  setSourcePaused,
  subscribeSyncSources,
  updateSyncSourceFilters,
} from '../syncSourcesStore';

function formatLastSync(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return '—';
  }
}

function sourceTypeLabel(source) {
  if (!source) return '';
  if (source.kind === 'ownTunebook') return 'My tunebook';
  if (source.kind === 'googleDoc' || source.googleDocumentId) return 'Shared tunebook';
  return 'Static tunebook';
}

function sourceStatusLabel(source) {
  if (!source) return '';
  if (source.kind === 'ownTunebook') return 'Active';
  if (source.removed) return 'Removed';
  if (source.paused) return 'Paused';
  if (source.lastError) return 'Error';
  return 'Syncing';
}

function SourceFiltersModal({ show, source, onHide, onSave }) {
  const [bookName, setBookName] = useState('');
  const [tagName, setTagName] = useState('');
  const [extraTags, setExtraTags] = useState('');

  useEffect(function() {
    if (!show || !source) return;
    const filters = source.filters || {};
    setBookName(filters.limitToBookName || '');
    setTagName(filters.limitToTagName || '');
    const tags = [];
    if (Array.isArray(filters.limitToTagNames)) {
      filters.limitToTagNames.forEach(function(tag) {
        if (tag && tag !== filters.limitToTagName) tags.push(tag);
      });
    }
    setExtraTags(tags.join(', '));
  }, [show, source]);

  function handleSave() {
    const filters = {};
    if (bookName.trim()) filters.limitToBookName = bookName.trim();
    const tagNames = [];
    if (tagName.trim()) tagNames.push(tagName.trim());
    extraTags.split(',').map(function(part) { return part.trim(); }).filter(Boolean).forEach(function(tag) {
      if (tagNames.indexOf(tag) === -1) tagNames.push(tag);
    });
    if (tagNames.length === 1) {
      filters.limitToTagName = tagNames[0];
    } else if (tagNames.length > 1) {
      filters.limitToTagNames = tagNames;
    }
    if (source && source.filters) {
      if (source.filters.limitToTuneId) filters.limitToTuneId = source.filters.limitToTuneId;
      if (Array.isArray(source.filters.limitToTuneIds)) filters.limitToTuneIds = source.filters.limitToTuneIds.slice();
    }
    onSave(normalizeSyncSourceFilters(filters));
  }

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Edit source filters</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="app-text-muted">
          Filters are additive: a tune must match every filter you set. Tune and set/playlist filters from import are kept unless you clear the source and re-import.
        </p>
        <Form.Group className="mb-3">
          <Form.Label>Book name</Form.Label>
          <Form.Control value={bookName} onChange={function(e) { setBookName(e.target.value); }} placeholder="e.g. Songs" />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Tag name</Form.Label>
          <Form.Control value={tagName} onChange={function(e) { setTagName(e.target.value); }} placeholder="e.g. session" />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Additional tags (comma-separated)</Form.Label>
          <Form.Control value={extraTags} onChange={function(e) { setExtraTags(e.target.value); }} placeholder="e.g. fast, irish" />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save filters</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function SourcesSettingsSection(props) {
  const tunes = props.tunes || {};
  const googleDocumentId = props.googleDocumentId;
  const token = props.token;
  const login = props.login;
  const onCheckMergeNow = props.onCheckMergeNow;
  const mergeCheckBusy = !!props.mergeCheckBusy;

  const [sources, setSources] = useState(function() {
    return listSyncSources({ includeRemoved: true, includePaused: true, managedOnly: true });
  });
  const [editingSource, setEditingSource] = useState(null);
  const signedIn = !!(token && token.access_token);

  useEffect(function() {
    return subscribeSyncSources(function(next) {
      setSources(next);
    });
  }, []);

  const rows = useMemo(function() {
    const list = sources.filter(function(source) {
      return !source.removed && isManagedSyncSource(source);
    });
    const own = buildOwnTunebookSource(googleDocumentId);
    return own ? [own].concat(list) : list;
  }, [sources, googleDocumentId]);

  const handlePauseToggle = useCallback(function(source) {
    if (!source || source.kind === 'ownTunebook') return;
    const next = setSourcePaused(source.id, !source.paused);
    if (next) {
      toast.success(next.paused ? 'Source sync paused.' : 'Source sync resumed.');
    }
  }, []);

  const handleRemove = useCallback(function(source) {
    if (!source || source.kind === 'ownTunebook') return;
    if (!window.confirm('Remove this source from sync? Your imported tunes will be kept.')) return;
    const next = removeSyncSource(source.id);
    if (next) toast.success('Source removed from sync. Tunes were kept.');
  }, []);

  const handleSaveFilters = useCallback(function(filters) {
    if (!editingSource) return;
    const next = updateSyncSourceFilters(editingSource.id, filters);
    setEditingSource(null);
    if (next) toast.success('Source filters updated.');
  }, [editingSource]);

  return (
    <>
      {!signedIn ? (
        <Alert variant="warning" className="App-settings-section">
          <div>Log in with Google to sync your tunebook and subscribed shared sources.</div>
          {typeof login === 'function' ? (
            <div className="mt-2">
              <Button variant="outline-warning" size="sm" onClick={login}>Log in with Google</Button>
            </div>
          ) : null}
        </Alert>
      ) : null}

      <div className="app-surface-panel App-settings-section">
        <h2>
          Sources
          {SETTINGS_FIELD_HELP.sources ? (
            <FormFieldHelp title={SETTINGS_FIELD_HELP.sources.title} body={SETTINGS_FIELD_HELP.sources.body} />
          ) : null}
        </h2>
        <p className="app-text-muted">
          Your Google Drive tunebook, shared tunebooks via Google, and static collections from tunebook.net.
          Shared and static sources are checked about every 10 minutes. Removing a source stops sync but keeps your tunes.
        </p>
        <div className="App-settings-actions">
          <Button variant="primary" disabled={mergeCheckBusy || !signedIn} onClick={onCheckMergeNow}>
            {mergeCheckBusy ? 'Checking…' : 'Check for updates now'}
          </Button>
        </div>
        <Table size="sm" responsive className="mt-3">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Filters</th>
              <th>Tunes</th>
              <th>Status</th>
              <th>Last sync</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="app-text-muted">No subscribed sources yet. Import from a shared tunebook or a tunebook.net collection to add one.</td>
              </tr>
            ) : null}
            {rows.map(function(source) {
              const filterParts = formatSourceFilters(source.filters);
              const isOwn = source.kind === 'ownTunebook';
              return (
                <tr key={source.id}>
                  <td>
                    <div><strong>{source.label}</strong></div>
                    {source.url ? <div className="app-text-muted small text-break">{source.url}</div> : null}
                    {source.lastError ? <div className="text-danger small">{source.lastError}</div> : null}
                  </td>
                  <td>{sourceTypeLabel(source)}</td>
                  <td>
                    {filterParts.length ? filterParts.map(function(part) {
                      return <Badge bg="secondary" className="me-1 mb-1" key={part}>{part}</Badge>;
                    }) : <span className="app-text-muted">All tunes</span>}
                  </td>
                  <td>{isOwn ? Object.keys(tunes).length : countTunesForSource(source, tunes)}</td>
                  <td>{sourceStatusLabel(source)}</td>
                  <td>{formatLastSync(source.lastSyncAt)}</td>
                  <td>
                    {isOwn ? (
                      <span className="app-text-muted small">Primary tunebook</span>
                    ) : (
                      <div className="d-flex flex-wrap gap-1">
                        <Button size="sm" variant="outline-secondary" onClick={function() { handlePauseToggle(source); }}>
                          {source.paused ? 'Resume' : 'Pause'}
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={function() { setEditingSource(source); }}>
                          Edit filters
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={function() { handleRemove(source); }}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      <SourceFiltersModal
        show={!!editingSource}
        source={editingSource}
        onHide={function() { setEditingSource(null); }}
        onSave={handleSaveFilters}
      />
    </>
  );
}
