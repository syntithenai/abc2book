import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Form, Nav, Tab, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import FormFieldHelp from './FormFieldHelp';
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText';
import { tuneImportTitle } from '../importTitleMatch';
import {
  filterDuplicateGroupsByKind,
  filterDuplicateGroupsByName,
} from '../tuneDuplicateScan';
import {
  scanDuplicateGroupsWithScope,
  shouldDefaultBookScope,
  stableTuneImportHash,
} from '../tuneDuplicateScanWorkerBridge';
import { LARGE_LIST_WARNING_THRESHOLD } from '../tuneScaleConstants';
import { dismissDuplicateGroup } from '../tuneDuplicateDismissals';
import { applyDuplicateMerge, pickDefaultSurvivorId } from '../tuneDuplicateMerge';
import DuplicateMergeModal from './DuplicateMergeModal';

const FILTER_ALL = 'all';
const FILTER_EXACT = 'exactContent';
const FILTER_SIMILAR = 'similarTitle';
const ALL_BOOKS = '';

const EMPTY_SCAN_RESULT = { groups: [], exactCount: 0, similarCount: 0 };

function collectBooks(indexes) {
  const books = [];
  if (indexes && indexes.bookIndex) {
    Object.keys(indexes.bookIndex).forEach(function(book) {
      if (book) books.push(book);
    });
  }
  books.sort(function(a, b) { return a.localeCompare(b); });
  return books;
}

function removeGroupFromScanResult(prev, groupId) {
  const groups = (prev && Array.isArray(prev.groups) ? prev.groups : []).filter(function(group) {
    return group && group.id !== groupId;
  });
  let exactCount = 0;
  let similarCount = 0;
  groups.forEach(function(group) {
    if (group.kind === 'exactContent') exactCount += 1;
    else if (group.kind === 'similarTitle') similarCount += 1;
  });
  return { groups: groups, exactCount: exactCount, similarCount: similarCount };
}

function formatLastUpdated(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return '—';
  }
}

function confidenceVariant(confidence) {
  if (confidence === 'Exact') return 'success';
  if (confidence === 'Likely') return 'warning';
  return 'secondary';
}

function kindLabel(kind) {
  if (kind === 'exactContent') return 'Exact content';
  return 'Similar title';
}

export default function DuplicateManagerSettingsSection(props) {
  const tunes = props.tunes || {};
  const tunesHash = props.tunesHash || {};
  const tunebook = props.tunebook;
  const navigate = useNavigate();

  const [filterKind, setFilterKind] = useState(FILTER_ALL);
  const [nameFilter, setNameFilter] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [mergeGroup, setMergeGroup] = useState(null);
  const [scanVersion, setScanVersion] = useState(0);
  const [scanResult, setScanResult] = useState(EMPTY_SCAN_RESULT);
  const [scanning, setScanning] = useState(true);
  const tuneCount = Object.keys(tunes || {}).length;
  const books = useMemo(function() {
    const list = collectBooks(props.indexes);
    if (props.currentTuneBook && list.indexOf(props.currentTuneBook) < 0) {
      return list.concat([props.currentTuneBook]).sort(function(a, b) { return a.localeCompare(b); });
    }
    return list;
  }, [props.indexes, props.currentTuneBook]);
  const [scopeBook, setScopeBook] = useState(function() {
    return shouldDefaultBookScope(tuneCount, props.currentTuneBook)
      ? (props.currentTuneBook || ALL_BOOKS)
      : ALL_BOOKS;
  });

  useEffect(function() {
    if (!scopeBook) return;
    if (books.length === 0) return;
    if (books.indexOf(scopeBook) >= 0) return;
    setScopeBook(ALL_BOOKS);
  }, [books, scopeBook]);
  const getTuneImportHashRef = useRef(function() { return ''; });
  const tunesHashRef = useRef(tunesHash);
  tunesHashRef.current = tunesHash;
  useEffect(function() {
    getTuneImportHashRef.current = function(tune) {
      if (!tunebook || !tunebook.abcTools || typeof tunebook.abcTools.getTuneImportHash !== 'function') {
        return '';
      }
      return tunebook.abcTools.getTuneImportHash(tune);
    };
  }, [tunebook]);

  const resolveImportHash = useCallback(function(tune) {
    return stableTuneImportHash(tune, function(t) {
      return getTuneImportHashRef.current(t);
    }, tunesHashRef.current);
  }, []);

  useEffect(function() {
    let cancelled = false;
    let debounceTimer = null;

    function scheduleScan() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        debounceTimer = null;
        runScan();
      }, scanVersion > 0 ? 0 : 2500);
    }

    async function runScan() {
      setScanning(true);
      await new Promise(function(resolve) { setTimeout(resolve, 0); });
      if (cancelled) return;
      try {
        const result = await scanDuplicateGroupsWithScope({
          tunes: tunes,
          tunesHash: tunesHash,
          getTuneImportHash: function(tune) { return getTuneImportHashRef.current(tune); },
          shouldCancel: function() { return cancelled; },
          scopeBook: scopeBook || '',
        });
        if (cancelled || !result) return;
        setScanResult(result);
      } finally {
        if (!cancelled) setScanning(false);
      }
    }

    scheduleScan();

    return function() {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
    };
    // scanVersion forces rescan when user clicks Rescan; tuneCount debounces library edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuneCount, scanVersion, scopeBook]);

  const filteredGroups = useMemo(function() {
    const byKind = filterDuplicateGroupsByKind(scanResult.groups, filterKind);
    return filterDuplicateGroupsByName(byKind, nameFilter);
  }, [scanResult.groups, filterKind, nameFilter]);

  const matchingTunes = useMemo(function() {
    const query = nameFilter.trim().toLowerCase();
    if (!query) return [];
    return Object.values(tunes).filter(function(tune) {
      if (!tune || !tune.id) return false;
      const title = tuneImportTitle(tune);
      return title && String(title).toLowerCase().indexOf(query) !== -1;
    }).sort(function(a, b) {
      return tuneImportTitle(a).localeCompare(tuneImportTitle(b));
    });
  }, [tunes, nameFilter]);

  const handleRescan = useCallback(function() {
    setScanVersion(function(v) { return v + 1; });
    setExpandedGroupId(null);
    toast.info('Duplicate scan refreshed.');
  }, []);

  const handleKeepSeparate = useCallback(function(group) {
    if (!group || !Array.isArray(group.tuneIds)) return;
    dismissDuplicateGroup(group.tuneIds, resolveImportHash, tunes);
    setScanResult(function(prev) { return removeGroupFromScanResult(prev, group.id); });
    setExpandedGroupId(function(id) { return id === group.id ? null : id; });
    setScanVersion(function(v) { return v + 1; });
    toast.success('Marked as separate versions. They will not appear again unless content changes.');
  }, [tunes, resolveImportHash]);

  const handleQuickMerge = useCallback(function(group) {
    if (!group || !tunebook) return;
    const survivorId = pickDefaultSurvivorId(group.tuneIds, tunes);
    if (!survivorId) return;
    const duplicateIds = group.tuneIds.filter(function(id) { return id !== survivorId; });
    const survivorName = tunes[survivorId] ? tuneImportTitle(tunes[survivorId]) : 'tune';
    const msg = 'Quick merge ' + duplicateIds.length + ' exact duplicate(s) into "' + survivorName + '"? Other copies will be deleted; books, tags, and links will be combined.';
    if (!window.confirm(msg)) return;
    const result = applyDuplicateMerge({
      tunebook: tunebook,
      tunes: tunes,
      survivorId: survivorId,
      duplicateIds: duplicateIds,
      quickMerge: true,
    });
    if (result.ok) {
      toast.success('Merged ' + duplicateIds.length + ' duplicate(s).');
      setScanVersion(function(v) { return v + 1; });
    } else {
      toast.error(result.error || 'Merge failed.');
    }
  }, [tunebook, tunes]);

  const handleMergeConfirm = useCallback(function(options) {
    if (!mergeGroup || !tunebook) return;
    const result = applyDuplicateMerge(Object.assign({
      tunebook: tunebook,
      tunes: tunes,
    }, options));
    setMergeGroup(null);
    if (result.ok) {
      toast.success('Tunes merged.');
      setScanVersion(function(v) { return v + 1; });
    } else {
      toast.error(result.error || 'Merge failed.');
    }
  }, [mergeGroup, tunebook, tunes]);

  const handleModalKeepSeparate = useCallback(function(group) {
    handleKeepSeparate(group);
    setMergeGroup(null);
  }, [handleKeepSeparate]);

  const handleOpenTune = useCallback(function(tuneId) {
    if (!tuneId) return;
    navigate('/tunes/' + tuneId);
  }, [navigate]);

  const summaryText = scanResult.exactCount + ' exact · ' + scanResult.similarCount + ' similar';

  return (
    <>
      <div className="app-surface-panel App-settings-section">
        <h2>
          Duplicate manager
          {SETTINGS_FIELD_HELP.duplicateManager ? (
            <FormFieldHelp
              title={SETTINGS_FIELD_HELP.duplicateManager.title}
              body={SETTINGS_FIELD_HELP.duplicateManager.body}
            />
          ) : null}
        </h2>
        <p className="app-text-muted">
          Find tune records with the same content or very similar titles. Merge true duplicates,
          or mark groups as separate when they are different versions of the same song.
        </p>

        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <Badge bg="secondary">{scanning ? 'Scanning…' : summaryText}</Badge>
          <Button size="sm" variant="outline-primary" disabled={scanning} onClick={handleRescan}>Rescan</Button>
        </div>

        {scanning ? (
          <p className="app-text-muted mb-3">Scanning your library for duplicates…</p>
        ) : null}

        {tuneCount > LARGE_LIST_WARNING_THRESHOLD ? (
          <Alert variant="info" className="mb-3">
            Large library ({tuneCount} tunes). Scanning the full library can be slow — pick a book below to limit the scan.
          </Alert>
        ) : null}

        <Form.Group className="mb-3" controlId="duplicate-manager-book-scope">
          <Form.Label className="mb-1">Scan book</Form.Label>
          <Form.Select
            value={scopeBook}
            onChange={function(e) { setScopeBook(e.target.value || ALL_BOOKS); }}
            disabled={scanning}
            aria-label="Filter duplicate scan by book"
          >
            <option value={ALL_BOOKS}>All books</option>
            {books.map(function(book) {
              return (
                <option key={book} value={book}>{book}</option>
              );
            })}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3" controlId="duplicate-manager-name-filter">
          <Form.Label className="mb-1">Filter by name</Form.Label>
          <Form.Control
            type="search"
            placeholder="Search duplicate groups by tune title…"
            value={nameFilter}
            onChange={function(e) { setNameFilter(e.target.value); }}
            disabled={scanning}
          />
        </Form.Group>

        <Tab.Container activeKey={filterKind} onSelect={function(key) { setFilterKind(key || FILTER_ALL); }}>
          <Nav variant="pills" className="mb-3 flex-wrap">
            <Nav.Item>
              <Nav.Link eventKey={FILTER_ALL}>All ({scanResult.groups.length})</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={FILTER_EXACT}>Exact content ({scanResult.exactCount})</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={FILTER_SIMILAR}>Similar titles ({scanResult.similarCount})</Nav.Link>
            </Nav.Item>
          </Nav>
        </Tab.Container>

        {filteredGroups.length === 0 ? (
          <Alert variant="secondary" className="mb-3">
            {scanResult.groups.length === 0
              ? 'No duplicate groups found in your library.'
              : (nameFilter.trim()
                ? 'No duplicate groups match that name.'
                : 'No groups match this filter.')}
          </Alert>
        ) : (
          <Table size="sm" responsive>
            <thead>
              <tr>
                <th>Group</th>
                <th>Type</th>
                <th>Tunes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(function(group) {
                const expanded = expandedGroupId === group.id;
                const tuneCount = Array.isArray(group.tuneIds) ? group.tuneIds.length : 0;
                const multiTuneGroup = tuneCount >= 3;
                return (
                  <tr key={group.id}>
                    <td colSpan={4} style={{ padding: 0, border: 'none' }}>
                      <div
                        className={'border rounded mb-2 overflow-hidden' + (multiTuneGroup ? ' border-warning border-2' : '')}
                        data-testid={multiTuneGroup ? 'duplicate-group-multi' : undefined}
                        style={multiTuneGroup ? { boxShadow: '0 0 0 1px var(--bs-warning)' } : undefined}
                      >
                        <div
                          className="px-3 py-2 d-flex flex-wrap align-items-center gap-2"
                          style={{
                            backgroundColor: multiTuneGroup
                              ? 'var(--bs-warning-bg-subtle, #fff3cd)'
                              : 'var(--bs-light, #f8f9fa)',
                          }}
                        >
                          <Button
                            size="sm"
                            variant="link"
                            className="p-0 text-decoration-none text-body fw-bold"
                            onClick={function() {
                              setExpandedGroupId(expanded ? null : group.id);
                            }}
                          >
                            {expanded ? '▼' : '▶'} {group.label}
                          </Button>
                          <Badge bg={confidenceVariant(group.confidence)}>{group.confidence}</Badge>
                          <Badge bg="light" text="dark">{kindLabel(group.kind)}</Badge>
                          {multiTuneGroup ? (
                            <Badge bg="warning" text="dark">{tuneCount} tunes</Badge>
                          ) : null}
                          {group.largeGroup ? (
                            <Badge bg="warning" text="dark">Large group — review individually</Badge>
                          ) : null}
                          <div className="ms-auto d-flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline-primary"
                              disabled={scanning}
                              onClick={function() { setMergeGroup(group); }}
                            >
                              Compare &amp; merge
                            </Button>
                            {group.kind === 'exactContent' ? (
                              <Button
                                size="sm"
                                variant="outline-success"
                                disabled={scanning}
                                onClick={function() { handleQuickMerge(group); }}
                              >
                                Quick merge
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              disabled={scanning}
                              onClick={function() { handleKeepSeparate(group); }}
                            >
                              Keep separate
                            </Button>
                          </div>
                        </div>
                        {expanded ? (
                          <Table size="sm" className="mb-0">
                            <thead>
                              <tr>
                                <th>Title</th>
                                <th>Books</th>
                                <th>Last updated</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(group.tunes || []).map(function(entry) {
                                const tune = entry.tune;
                                const books = tune && Array.isArray(tune.books) ? tune.books.join(', ') : '';
                                return (
                                  <tr key={entry.id}>
                                    <td>{tuneImportTitle(tune)}</td>
                                    <td className="app-text-muted">{books || '—'}</td>
                                    <td className="app-text-muted">{formatLastUpdated(tune && tune.lastUpdated)}</td>
                                    <td>
                                      <Button
                                        size="sm"
                                        variant="link"
                                        onClick={function() { handleOpenTune(entry.id); }}
                                      >
                                        Open
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {nameFilter.trim() ? (
          <div className="duplicate-manager-matching-tunes mt-4">
            <h3 className="h5">Tunes matching “{nameFilter.trim()}”</h3>
            <p className="app-text-muted">
              These are all library records with a matching title. Duplicate groups only appear when content or titles are similar enough to merge.
              If you see one row here but two in the tune list, the list was showing the same record twice — refresh after updating.
              If you see multiple rows below with different tune IDs, those are separate records you can compare and delete.
            </p>
            {matchingTunes.length === 0 ? (
              <Alert variant="secondary" className="mb-0">No tunes match that name.</Alert>
            ) : (
              <Table size="sm" responsive>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Tune ID</th>
                    <th>Books</th>
                    <th>Last updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matchingTunes.map(function(tune) {
                    const books = Array.isArray(tune.books) ? tune.books.join(', ') : '';
                    return (
                      <tr key={tune.id}>
                        <td>{tuneImportTitle(tune)}</td>
                        <td className="app-text-muted"><code>{tune.id}</code></td>
                        <td className="app-text-muted">{books || '—'}</td>
                        <td className="app-text-muted">{formatLastUpdated(tune.lastUpdated)}</td>
                        <td>
                          <Button size="sm" variant="link" onClick={function() { handleOpenTune(tune.id); }}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        ) : null}
      </div>

      <DuplicateMergeModal
        show={!!mergeGroup}
        group={mergeGroup}
        tunes={tunes}
        tunebook={tunebook}
        onClose={function() { setMergeGroup(null); }}
        onConfirm={handleMergeConfirm}
        onKeepSeparate={handleModalKeepSeparate}
      />
    </>
  );
}
