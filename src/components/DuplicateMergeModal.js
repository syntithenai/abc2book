import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Nav, Tab, Table } from 'react-bootstrap';
import {
  buildDuplicateMergeFieldRows,
  buildDefaultDuplicateMergeSelections,
  fieldValuesSemanticallyEqual,
  setAllTuneImportSelections,
  setRecommendedDuplicateMergeSelections,
  tuneHasNotationContent,
} from '../tuneImportMergeUtils';
import { pickDefaultSurvivorId } from '../tuneDuplicateMerge';
import { tuneImportTitle } from '../importTitleMatch';
import { buildAbcFromTune, NotationPreview } from './SuggestionPreviewDialog';
import TuneSingleViewDialog from './TuneSingleViewDialog';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';

function buildTuneMapFromGroup(group, liveTunes) {
  const map = {};
  if (group && Array.isArray(group.tunes)) {
    group.tunes.forEach(function(entry) {
      if (entry && entry.id && entry.tune) {
        map[entry.id] = entry.tune;
      }
    });
  }
  const tuneIds = group && Array.isArray(group.tuneIds) ? group.tuneIds : [];
  tuneIds.forEach(function(id) {
    if (!map[id] && liveTunes && liveTunes[id]) {
      map[id] = liveTunes[id];
    }
  });
  return map;
}

function DuplicateFieldTable(props) {
  const survivor = props.survivor;
  const incoming = props.incoming;
  const onlyDiffering = props.onlyDiffering !== false;
  const rows = useMemo(function() {
    const all = buildDuplicateMergeFieldRows(survivor, incoming);
    return onlyDiffering ? all.filter(function(row) { return row.differs; }) : all;
  }, [survivor, incoming, onlyDiffering]);

  const selections = props.selections || {};
  const onChange = props.onChange;

  if (!survivor || !incoming) {
    return <Alert variant="secondary" className="mb-0">Select tunes to compare.</Alert>;
  }

  if (rows.length === 0) {
    return (
      <Alert variant="secondary" className="mb-0">
        No differing fields between these tunes. Books, tags, and links are still combined automatically.
      </Alert>
    );
  }

  return (
    <Table bordered size="sm" className="tune-import-field-table" style={{ backgroundColor: 'white' }}>
      <thead>
        <tr>
          <th style={{ width: '4%' }}>Use</th>
          <th style={{ width: '16%' }}>Field</th>
          <th style={{ width: '40%' }}>Keep (survivor)</th>
          <th style={{ width: '40%' }}>From duplicate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(function(row) {
          return (
            <tr key={row.key} className={row.differs ? 'table-warning' : undefined}>
              <td className="text-center align-middle">
                <CheckToggleButton
                  size="sm"
                  checked={!!selections[row.key]}
                  ariaLabel={'Take ' + row.label + ' from duplicate'}
                  onClick={function() {
                    if (typeof onChange === 'function') {
                      onChange(Object.assign({}, selections, { [row.key]: !selections[row.key] }));
                    }
                  }}
                />
              </td>
              <td className="align-middle">
                <div>{row.label}</div>
                <small className="text-muted">{row.group}</small>
              </td>
              <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.originalDisplay}</td>
              <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.importedDisplay}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function notationDiffersBetweenTunes(survivor, incoming) {
  if (!survivor || !incoming) return false;
  if (!fieldValuesSemanticallyEqual('voices', survivor.voices, incoming.voices)) return true;
  if (!fieldValuesSemanticallyEqual('notes', survivor.notes, incoming.notes)) return true;
  return false;
}

function DuplicateNotationPreview(props) {
  const survivor = props.survivor;
  const incoming = props.incoming;
  if (!survivor || !incoming) return null;

  return (
    <div className="duplicate-merge-notation-preview mt-3" data-testid="duplicate-merge-notation-preview">
      <h6 className="mb-2">Notation preview</h6>
      <div className="row g-2">
        <div className="col-md-6" style={{ minWidth: 0 }}>
          <div className="small text-muted mb-1">Keep (survivor)</div>
          <NotationPreview abc={buildAbcFromTune(survivor)} fitWidth={true} />
        </div>
        <div className="col-md-6" style={{ minWidth: 0 }}>
          <div className="small text-muted mb-1">From duplicate</div>
          <NotationPreview abc={buildAbcFromTune(incoming)} fitWidth={true} />
        </div>
      </div>
    </div>
  );
}

function DuplicateNotationStatus(props) {
  const survivor = props.survivor;
  const incoming = props.incoming;
  if (!tuneHasNotationContent(survivor) && !tuneHasNotationContent(incoming)) {
    return null;
  }

  if (notationDiffersBetweenTunes(survivor, incoming)) {
    return <DuplicateNotationPreview survivor={survivor} incoming={incoming} />;
  }

  return (
    <Alert variant="secondary" className="mb-0 mt-3" data-testid="duplicate-merge-notation-identical">
      Music (notation) is identical on both tunes. The survivor&apos;s notation will be kept.
    </Alert>
  );
}

export default function DuplicateMergeModal(props) {
  const show = !!props.show;
  const group = props.group;
  const tunes = props.tunes || {};
  const groupId = group && group.id ? group.id : '';
  const tuneIds = group && Array.isArray(group.tuneIds) ? group.tuneIds : [];

  const tuneMap = useMemo(function() {
    return buildTuneMapFromGroup(group, tunes);
  }, [group, groupId]);

  const [survivorId, setSurvivorId] = useState(null);
  const [activeDuplicateId, setActiveDuplicateId] = useState(null);
  const [selectionsByTuneId, setSelectionsByTuneId] = useState({});
  const [initializing, setInitializing] = useState(false);
  const [previewTuneId, setPreviewTuneId] = useState(null);

  useEffect(function() {
    if (!show || !group) {
      setSurvivorId(null);
      setActiveDuplicateId(null);
      setSelectionsByTuneId({});
      setInitializing(false);
      setPreviewTuneId(null);
      return;
    }

    let cancelled = false;
    setInitializing(true);
    setSelectionsByTuneId({});

    const timer = setTimeout(function() {
      if (cancelled) return;
      const defaultSurvivor = pickDefaultSurvivorId(tuneIds, tuneMap);
      const duplicateIds = tuneIds.filter(function(id) { return id !== defaultSurvivor; });
      setSurvivorId(defaultSurvivor);
      setActiveDuplicateId(duplicateIds[0] || null);
      setInitializing(false);
    }, 0);

    return function() {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [show, groupId, tuneIds, tuneMap]);

  useEffect(function() {
    if (!show || !survivorId || !activeDuplicateId) return;
    setSelectionsByTuneId(function(prev) {
      if (prev[activeDuplicateId]) return prev;
      const survivor = tuneMap[survivorId];
      const incoming = tuneMap[activeDuplicateId];
      if (!survivor || !incoming) return prev;
      const rows = buildDuplicateMergeFieldRows(survivor, incoming).filter(function(r) { return r.differs; });
      return Object.assign({}, prev, {
        [activeDuplicateId]: buildDefaultDuplicateMergeSelections(rows),
      });
    });
  }, [show, survivorId, activeDuplicateId, tuneMap]);

  const duplicateIds = useMemo(function() {
    return tuneIds.filter(function(id) { return id && id !== survivorId; });
  }, [tuneIds, survivorId]);

  const survivor = survivorId ? tuneMap[survivorId] : null;
  const activeIncoming = activeDuplicateId ? tuneMap[activeDuplicateId] : null;
  const previewTune = previewTuneId ? tuneMap[previewTuneId] : null;
  const activeRows = useMemo(function() {
    if (!survivor || !activeIncoming) return [];
    return buildDuplicateMergeFieldRows(survivor, activeIncoming).filter(function(r) { return r.differs; });
  }, [survivor, activeIncoming]);
  const activeSelections = activeDuplicateId ? (selectionsByTuneId[activeDuplicateId] || {}) : {};
  const activeSelectedCount = activeRows.filter(function(row) { return activeSelections[row.key]; }).length;

  function updateSelectionsForTune(tuneId, nextSelections) {
    setSelectionsByTuneId(function(prev) {
      return Object.assign({}, prev, { [tuneId]: nextSelections });
    });
  }

  function handleSurvivorChange(nextSurvivorId) {
    setSurvivorId(nextSurvivorId);
    const nextDuplicateIds = tuneIds.filter(function(id) { return id !== nextSurvivorId; });
    setActiveDuplicateId(nextDuplicateIds[0] || null);
    setSelectionsByTuneId({});
  }

  function handleKeepSeparate() {
    if (typeof props.onKeepSeparate === 'function') {
      props.onKeepSeparate(group);
    }
  }

  function handleConfirm() {
    if (!survivorId || duplicateIds.length === 0) return;
    const msg = 'Merge ' + duplicateIds.length + ' duplicate tune'
      + (duplicateIds.length === 1 ? '' : 's')
      + ' into the survivor? The other tune'
      + (duplicateIds.length === 1 ? '' : 's')
      + ' will be permanently deleted.';
    if (!window.confirm(msg)) return;
    if (typeof props.onConfirm === 'function') {
      props.onConfirm({
        survivorId: survivorId,
        duplicateIds: duplicateIds,
        fieldSelectionsByTuneId: selectionsByTuneId,
        quickMerge: false,
      });
    }
  }

  if (!show || !group) return null;

  return (
    <>
    <Modal
      show={show}
      onHide={props.onClose}
      dialogClassName="duplicate-merge-modal"
      backdrop="static"
      keyboard={false}
      size="xl"
      container={typeof document !== 'undefined' ? document.body : undefined}
      enforceFocus={false}
    >
      <Modal.Header closeButton>
        <Modal.Title>Merge duplicates: {group.label}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info">
          Choose which tune to keep. Checked fields are taken from each duplicate; unchecked fields stay on the survivor.
          Books, tags, links, and sheet snapshots are always combined from every tune in the merge (duplicate YouTube links count as one).
        </Alert>

        {initializing ? (
          <p className="app-text-muted mb-3">Preparing comparison…</p>
        ) : null}

        <Form.Group className="mb-3">
          <Form.Label><strong>Keep this tune (survivor)</strong></Form.Label>
          {tuneIds.map(function(id) {
            const tune = tuneMap[id];
            if (!tune) return null;
            const books = Array.isArray(tune.books) ? tune.books.join(', ') : '';
            return (
              <div key={id} className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <Form.Check
                  type="radio"
                  name="duplicate-survivor"
                  id={'survivor-' + id}
                  className="mb-0"
                  label={tuneImportTitle(tune) + (books ? ' — ' + books : '')}
                  checked={survivorId === id}
                  onChange={function() { handleSurvivorChange(id); }}
                />
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={function() { setPreviewTuneId(id); }}
                >
                  Open tune
                </Button>
              </div>
            );
          })}
        </Form.Group>

        {duplicateIds.length > 1 ? (
          <Tab.Container activeKey={activeDuplicateId || duplicateIds[0]} onSelect={function(key) { setActiveDuplicateId(key); }}>
            <Nav variant="tabs" className="mb-3">
              {duplicateIds.map(function(id) {
                const tune = tuneMap[id];
                return (
                  <Nav.Item key={id}>
                    <Nav.Link eventKey={id}>{tuneImportTitle(tune) || id}</Nav.Link>
                  </Nav.Item>
                );
              })}
            </Nav>
          </Tab.Container>
        ) : null}

        {!initializing ? (
          <DuplicateFieldTable
            survivor={survivor}
            incoming={activeIncoming}
            selections={activeDuplicateId ? selectionsByTuneId[activeDuplicateId] : {}}
            onChange={function(next) {
              if (activeDuplicateId) updateSelectionsForTune(activeDuplicateId, next);
            }}
          />
        ) : null}

        {activeIncoming && !initializing ? (
          <div className="duplicate-merge-actions mt-3 pt-3 border-top d-flex flex-wrap align-items-stretch gap-2 select-all-host">
            <Button
              size="sm"
              variant="outline-primary"
              onClick={function() {
                if (!activeDuplicateId) return;
                updateSelectionsForTune(activeDuplicateId, setRecommendedDuplicateMergeSelections(activeRows));
              }}
            >
              Keep survivor fields
            </Button>
            <SelectAllToggle
              size="sm"
              totalCount={activeRows.length}
              selectedCount={activeSelectedCount}
              onSelectAll={function() {
                if (!activeDuplicateId) return;
                updateSelectionsForTune(activeDuplicateId, setAllTuneImportSelections(activeRows, true));
              }}
              onSelectNone={function() {
                if (!activeDuplicateId) return;
                updateSelectionsForTune(activeDuplicateId, setAllTuneImportSelections(activeRows, false));
              }}
              ariaLabel="Select all differing fields"
            />
            <div className="ms-auto d-flex flex-wrap gap-2">
              <Button variant="outline-secondary" size="sm" onClick={handleKeepSeparate}>
                Keep separate
              </Button>
              <Button variant="secondary" size="sm" onClick={props.onClose}>Cancel</Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleConfirm}
                disabled={!survivorId || duplicateIds.length === 0}
              >
                Merge and delete duplicate{duplicateIds.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        ) : null}

        {!initializing && survivor && activeIncoming ? (
          <DuplicateNotationStatus survivor={survivor} incoming={activeIncoming} />
        ) : null}
      </Modal.Body>
    </Modal>
    <TuneSingleViewDialog
      show={!!previewTune}
      tune={previewTune}
      tunebook={props.tunebook}
      onClose={function() { setPreviewTuneId(null); }}
    />
    </>
  );
}
