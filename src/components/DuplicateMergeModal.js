import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Nav, Tab, Table } from 'react-bootstrap';
import {
  buildTuneImportFieldRows,
  buildDefaultTuneImportSelections,
  setAllTuneImportSelections,
  setRecommendedTuneImportSelections,
} from '../tuneImportMergeUtils';
import { pickDefaultSurvivorId } from '../tuneDuplicateMerge';
import { tuneImportTitle } from '../importTitleMatch';

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
    const all = buildTuneImportFieldRows(survivor, incoming);
    return onlyDiffering ? all.filter(function(row) { return row.differs; }) : all;
  }, [survivor, incoming, onlyDiffering]);

  const selections = props.selections || {};
  const onChange = props.onChange;

  if (!survivor || !incoming) {
    return <Alert variant="secondary" className="mb-0">Select tunes to compare.</Alert>;
  }

  if (rows.length === 0) {
    return <Alert variant="secondary" className="mb-0">No differing fields between these tunes.</Alert>;
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
                <Form.Check
                  type="checkbox"
                  id={'dup-merge-' + incoming.id + '-' + row.key}
                  checked={!!selections[row.key]}
                  onChange={function(e) {
                    if (typeof onChange === 'function') {
                      onChange(Object.assign({}, selections, { [row.key]: e.target.checked }));
                    }
                  }}
                  aria-label={'Take ' + row.label + ' from duplicate'}
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

  useEffect(function() {
    if (!show || !group) {
      setSurvivorId(null);
      setActiveDuplicateId(null);
      setSelectionsByTuneId({});
      setInitializing(false);
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
      const rows = buildTuneImportFieldRows(survivor, incoming).filter(function(r) { return r.differs; });
      return Object.assign({}, prev, {
        [activeDuplicateId]: buildDefaultTuneImportSelections(rows),
      });
    });
  }, [show, survivorId, activeDuplicateId, tuneMap]);

  const duplicateIds = useMemo(function() {
    return tuneIds.filter(function(id) { return id && id !== survivorId; });
  }, [tuneIds, survivorId]);

  const survivor = survivorId ? tuneMap[survivorId] : null;
  const activeIncoming = activeDuplicateId ? tuneMap[activeDuplicateId] : null;
  const activeRows = useMemo(function() {
    if (!survivor || !activeIncoming) return [];
    return buildTuneImportFieldRows(survivor, activeIncoming).filter(function(r) { return r.differs; });
  }, [survivor, activeIncoming]);

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
          Choose which tune to keep. Checked fields will be taken from each duplicate before it is removed.
          Books, tags, links, and sheet snapshots are always merged onto the survivor.
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
              <Form.Check
                key={id}
                type="radio"
                name="duplicate-survivor"
                id={'survivor-' + id}
                label={tuneImportTitle(tune) + (books ? ' — ' + books : '')}
                checked={survivorId === id}
                onChange={function() { handleSurvivorChange(id); }}
              />
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
          <div className="mt-2 d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline-primary"
              onClick={function() {
                if (!activeDuplicateId) return;
                updateSelectionsForTune(activeDuplicateId, setRecommendedTuneImportSelections(activeRows));
              }}
            >
              Recommended fields
            </Button>
            <Button
              size="sm"
              variant="outline-success"
              onClick={function() {
                if (!activeDuplicateId) return;
                updateSelectionsForTune(activeDuplicateId, setAllTuneImportSelections(activeRows, true));
              }}
            >
              Select all differing
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={function() {
                if (!activeDuplicateId) return;
                updateSelectionsForTune(activeDuplicateId, setAllTuneImportSelections(activeRows, false));
              }}
            >
              Select none
            </Button>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="d-flex flex-wrap gap-2">
        <Button variant="outline-secondary" onClick={handleKeepSeparate} disabled={initializing}>
          Keep separate
        </Button>
        <div className="ms-auto d-flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button variant="success" onClick={handleConfirm} disabled={initializing || !survivorId || duplicateIds.length === 0}>
            Merge and delete duplicate{duplicateIds.length === 1 ? '' : 's'}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
