import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Form } from 'react-bootstrap';
import GigModeModal from '../components/GigModeModal';
import ShareTunebookModal from '../components/ShareTunebookModal';
import {
  listPerformanceSets,
  getPerformanceSet,
  savePerformanceSet,
  deletePerformanceSet,
  duplicatePerformanceSet,
  exportPerformanceSetText,
  exportAllPerformanceSetsText,
  buildSetPlaylistFromSet,
  subscribePerformanceSets,
  normalizePerformanceSetItems,
} from '../performanceSetStore';
import {
  applyPlaylistTuneId,
  buildGigRoute,
  getPlaylistTuneIdAtIndex,
} from '../gigRouteUtils';
import { setDocumentTitle, DEFAULT_APP_TITLE } from '../pageTitle';
import './SetsPage.css';

function emptySet() {
  return {
    name: 'New set',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    items: [],
  };
}

function moveItem(items, index, direction) {
  const next = items.slice();
  const target = index + direction;
  if (target < 0 || target >= next.length) return items;
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return next;
}

function tuneSearchHaystack(tune) {
  return [
    tune.name,
    tune.composer,
    Array.isArray(tune.tags) ? tune.tags.join(' ') : '',
    Array.isArray(tune.books) ? tune.books.join(' ') : '',
  ].join(' ').toLowerCase();
}

function tuneMatchesSearch(tune, query) {
  const tokens = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(function(part) { return part.length > 0; });
  if (tokens.length === 0) return true;
  const haystack = tuneSearchHaystack(tune);
  return tokens.every(function(token) { return haystack.indexOf(token) !== -1; });
}

const SET_TUNE_PICKER_LIMIT = 80;
const SET_LIST_DEFAULT_LIMIT = 5;
const SET_AUTO_SAVE_DEBOUNCE_MS = 600;

function setHasItems(setRecord) {
  return normalizePerformanceSetItems(setRecord && setRecord.items).length > 0;
}

function setSearchHaystack(setRecord) {
  return [
    setRecord.name,
    setRecord.date,
    setRecord.notes,
  ].join(' ').toLowerCase();
}

function setMatchesSearch(setRecord, query) {
  const tokens = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(function(part) { return part.length > 0; });
  if (tokens.length === 0) return true;
  const haystack = setSearchHaystack(setRecord);
  return tokens.every(function(token) { return haystack.indexOf(token) !== -1; });
}

function setItemCountLabel(setRecord) {
  const items = normalizePerformanceSetItems(Array.isArray(setRecord.items) ? setRecord.items : []);
  if (items.length === 0) return '';
  return items.length + ' song' + (items.length === 1 ? '' : 's');
}

export default function SetsPage(props) {
  const navigate = useNavigate();
  const params = useParams();
  const tunes = props.tunes || {};
  const tunebook = props.tunebook;
  const [sets, setSets] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptySet());
  const [showGig, setShowGig] = useState(false);
  const [addTuneId, setAddTuneId] = useState('');
  const [tuneSearchText, setTuneSearchText] = useState('');
  const [setListFilterText, setSetListFilterText] = useState('');
  const [showAllSets, setShowAllSets] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const draftRef = useRef(draft);
  const editingIdRef = useRef(editingId);
  draftRef.current = draft;
  editingIdRef.current = editingId;

  const tuneOptions = useMemo(function() {
    return Object.values(tunes)
      .filter(function(t) { return t && t.id && t.name; })
      .sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
  }, [tunes]);

  const filteredTuneOptions = useMemo(function() {
    const matches = tuneOptions.filter(function(tune) {
      return tuneMatchesSearch(tune, tuneSearchText);
    });
    return {
      tunes: matches.slice(0, SET_TUNE_PICKER_LIMIT),
      total: matches.length,
      truncated: matches.length > SET_TUNE_PICKER_LIMIT,
    };
  }, [tuneOptions, tuneSearchText]);

  const filteredSets = useMemo(function() {
    return sets.filter(function(setRecord) {
      return setMatchesSearch(setRecord, setListFilterText);
    });
  }, [sets, setListFilterText]);

  const hasSetFilter = setListFilterText.trim().length > 0;
  const visibleSets = useMemo(function() {
    if (hasSetFilter || showAllSets) return filteredSets;
    return filteredSets.slice(0, SET_LIST_DEFAULT_LIMIT);
  }, [filteredSets, hasSetFilter, showAllSets]);

  const hiddenSetCount = hasSetFilter || showAllSets
    ? 0
    : Math.max(0, filteredSets.length - SET_LIST_DEFAULT_LIMIT);
  const canCollapseSetList = !hasSetFilter && showAllSets && sets.length > SET_LIST_DEFAULT_LIMIT;

  const shareSetsMap = useMemo(function() {
    if (!editingId) return undefined;
    const map = {};
    sets.forEach(function(setRecord) {
      if (setRecord && setRecord.id) map[setRecord.id] = setRecord;
    });
    map[editingId] = Object.assign({}, draft, { id: editingId });
    return map;
  }, [sets, editingId, draft]);

  function refreshSets() {
    setSets(listPerformanceSets());
  }

  function flushAutoSave() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (!editingIdRef.current) return null;
    const saved = savePerformanceSet(Object.assign({}, draftRef.current, { id: editingIdRef.current }));
    refreshSets();
    return saved;
  }

  function scheduleAutoSave() {
    if (!editingIdRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(function() {
      autoSaveTimerRef.current = null;
      flushAutoSave();
    }, SET_AUTO_SAVE_DEBOUNCE_MS);
  }

  useEffect(function() {
    scheduleAutoSave();
    return function() {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [draft, editingId]);

  useEffect(function() {
    setDocumentTitle('Performance sets');
    refreshSets();
    const unsubscribe = subscribePerformanceSets(refreshSets);
    return function() {
      unsubscribe();
      setDocumentTitle(DEFAULT_APP_TITLE);
    };
  }, []);

  useEffect(function() {
    if (!params.setId) return;
    const existing = getPerformanceSet(params.setId);
    if (!existing) return;
    setEditingId(existing.id);
    setDraft(existing);
    if (!props.gigMode) return;

    const playlist = buildSetPlaylistFromSet(existing, tunes);
    const withIndex = params.tuneId
      ? applyPlaylistTuneId(playlist, params.tuneId)
      : playlist;
    if (props.setSetPlaylist) props.setSetPlaylist(withIndex);
    setShowGig(true);

    if (!params.tuneId) {
      const firstTuneId = getPlaylistTuneIdAtIndex(withIndex, 0);
      if (firstTuneId) {
        navigate(buildGigRoute(existing.id, firstTuneId), { replace: true });
      }
    }
  }, [params.setId, params.tuneId, props.gigMode, tunes]);

  function startEdit(setRecord) {
    flushAutoSave();
    setEditingId(setRecord.id);
    setDraft(Object.assign({}, setRecord, {
      items: normalizePerformanceSetItems(setRecord.items),
    }));
  }

  function startNew() {
    flushAutoSave();
    setEditingId(null);
    setDraft(emptySet());
  }

  function saveDraft() {
    const saved = savePerformanceSet(Object.assign({}, draft, { id: editingId || undefined }));
    setEditingId(saved.id);
    setDraft(saved);
    refreshSets();
    return saved;
  }

  function flushAndGetDraft() {
    if (editingId) return flushAutoSave() || Object.assign({}, draft, { id: editingId });
    return saveDraft();
  }

  function handleDelete(setId) {
    if (!window.confirm('Delete this set?')) return;
    deletePerformanceSet(setId);
    if (editingId === setId) startNew();
    refreshSets();
  }

  function addTuneToDraft(tuneId) {
    const id = tuneId || addTuneId;
    if (!id) return;
    const nextItems = (draft.items || []).slice();
    nextItems.push({ type: 'tune', tuneId: id });
    setDraft(Object.assign({}, draft, { items: nextItems }));
    setAddTuneId('');
  }

  function updateDraftTuneNote(index, note) {
    const items = (draft.items || []).slice();
    const item = items[index];
    if (!item || item.type === 'note') return;
    const nextItem = Object.assign({}, item, { note: note });
    if (!String(note || '').trim()) delete nextItem.note;
    items[index] = nextItem;
    setDraft(Object.assign({}, draft, { items: items }));
  }

  function handlePlaySet(setRecord) {
    const saved = setRecord && setRecord.id ? setRecord : flushAndGetDraft();
    if (!saved || !saved.id || !setHasItems(saved)) return;
    const playlist = buildSetPlaylistFromSet(saved, tunes);
    const firstTuneId = getPlaylistTuneIdAtIndex(playlist, 0);
    navigate(buildGigRoute(saved.id, firstTuneId || undefined));
  }

  function handleCloseGig() {
    setShowGig(false);
    if (props.setSetPlaylist) props.setSetPlaylist(null);
    if (props.gigMode) {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/sets');
      }
    }
  }

  function renderEditor() {
    const items = normalizePerformanceSetItems(draft.items || []);
    const draftHasItems = setHasItems(draft);
    const isNewSet = !editingId;
    return (
      <div className="app-surface-panel sets-page-editor">
        <h2>{editingId ? 'Edit set' : 'New set'}</h2>
        <Form.Group className="mb-2">
          <Form.Label>Name</Form.Label>
          <Form.Control value={draft.name || ''} onChange={function(e) {
            setDraft(Object.assign({}, draft, { name: e.target.value }));
          }} />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Date</Form.Label>
          <Form.Control type="date" value={draft.date || ''} onChange={function(e) {
            setDraft(Object.assign({}, draft, { date: e.target.value }));
          }} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Notes</Form.Label>
          <Form.Control as="textarea" rows={2} value={draft.notes || ''} onChange={function(e) {
            setDraft(Object.assign({}, draft, { notes: e.target.value }));
          }} />
        </Form.Group>

        <h3>Set list</h3>
        {items.length === 0 && <p className="app-text-muted">No items yet.</p>}
        <ul className="list-unstyled">
          {items.map(function(item, index) {
            const tune = tunes[item.tuneId];
            return (
              <li key={'item-' + index} className="sets-page-set-item">
                <div className="sets-page-set-item-main">
                  <span className="sets-page-set-item-title">
                    {tune ? tune.name : item.tuneId}
                    {tune && (
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 ms-2"
                        onClick={function() { navigate('/tunes/' + tune.id); }}
                      >
                        open
                      </Button>
                    )}
                  </span>
                  <Form.Control
                    size="sm"
                    className="sets-page-set-item-note"
                    placeholder="Note for this song"
                    value={item.note || ''}
                    onChange={function(e) { updateDraftTuneNote(index, e.target.value); }}
                  />
                </div>
                <div className="sets-page-set-item-actions">
                <Button size="sm" variant="outline-secondary" onClick={function() {
                  setDraft(Object.assign({}, draft, { items: moveItem(items, index, -1) }));
                }}>↑</Button>
                <Button size="sm" variant="outline-secondary" onClick={function() {
                  setDraft(Object.assign({}, draft, { items: moveItem(items, index, 1) }));
                }}>↓</Button>
                <Button size="sm" variant="outline-danger" onClick={function() {
                  const next = items.slice();
                  next.splice(index, 1);
                  setDraft(Object.assign({}, draft, { items: next }));
                }}>Remove</Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div style={{ marginBottom: '1rem' }}>
          <Form.Label htmlFor="set-tune-search">Add tune</Form.Label>
          <div className="sets-page-add-tune-row">
            <Form.Control
              id="set-tune-search"
              type="search"
              placeholder="Search by title, composer, book, or tag"
              value={tuneSearchText}
              onChange={function(e) { setTuneSearchText(e.target.value); }}
            />
            <Form.Select
              value={addTuneId}
              onChange={function(e) { setAddTuneId(e.target.value); }}
            >
              <option value="">Choose tune…</option>
              {filteredTuneOptions.tunes.map(function(tune) {
                const label = tune.composer ? tune.name + ' — ' + tune.composer : tune.name;
                return <option key={tune.id} value={tune.id}>{label}</option>;
              })}
            </Form.Select>
            <Button variant="outline-primary" onClick={function() { addTuneToDraft(); }} disabled={!addTuneId}>
              Add tune
            </Button>
          </div>
          <div className="app-text-muted" style={{ fontSize: '0.9em', marginBottom: '0.35rem' }}>
            {tuneSearchText.trim()
              ? filteredTuneOptions.total + ' match' + (filteredTuneOptions.total === 1 ? '' : 'es')
                + (filteredTuneOptions.truncated ? ' (showing first ' + SET_TUNE_PICKER_LIMIT + ')' : '')
              : tuneOptions.length + ' tune' + (tuneOptions.length === 1 ? '' : 's')}
          </div>
          {tuneSearchText.trim() && filteredTuneOptions.tunes.length > 0 ? (
            <ul className="list-unstyled sets-tune-picker-list">
              {filteredTuneOptions.tunes.map(function(tune) {
                const meta = [tune.composer]
                  .concat(Array.isArray(tune.books) ? tune.books : [])
                  .concat(Array.isArray(tune.tags) ? tune.tags : [])
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={tune.id}>
                    <button
                      type="button"
                      className="sets-tune-picker-item"
                      onClick={function() { addTuneToDraft(tune.id); }}
                    >
                      <span className="sets-tune-picker-name">{tune.name}</span>
                      {meta && <span className="sets-tune-picker-meta">{meta}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : tuneSearchText.trim() ? (
            <p className="app-text-muted" style={{ marginBottom: 0 }}>No tunes match your search.</p>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {isNewSet && (
            <Button variant="primary" onClick={saveDraft}>Save set</Button>
          )}
          <Button
            variant="success"
            disabled={!draftHasItems}
            onClick={function() { handlePlaySet(flushAndGetDraft()); }}
          >
            Play set
          </Button>
          <Button
            variant="outline-secondary"
            disabled={!draftHasItems}
            onClick={function() {
              const saved = flushAndGetDraft();
              const text = exportPerformanceSetText(saved, tunes);
              tunebook.utils.download((saved.name || 'set') + '.txt', text);
            }}
          >
            Export
          </Button>
          {editingId && (
            <ShareTunebookModal
              tunebook={tunebook}
              token={props.token}
              login={props.login}
              googleDocumentId={props.googleDocumentId}
              shareKind="set"
              setId={editingId}
              setName={draft.name}
              tunes={props.tunes}
              sets={shareSetsMap}
              saveTune={tunebook.saveTune}
              variant="outline-info"
            />
          )}
        </div>
      </div>
    );
  }

  function renderSetSidebar() {
    return (
      <aside className="sets-page-sidebar">
        <Form.Control
          type="search"
          className="sets-sidebar-filter"
          placeholder="Search sets by name, date, or notes"
          value={setListFilterText}
          onChange={function(e) { setSetListFilterText(e.target.value); }}
        />

        {sets.length > 0 && (hasSetFilter || hiddenSetCount > 0 || canCollapseSetList) && (
          <p className="app-text-muted sets-sidebar-status">
            {hasSetFilter
              ? visibleSets.length + ' match' + (visibleSets.length === 1 ? '' : 'es') + ' of ' + sets.length
              : showAllSets
                ? sets.length + ' set' + (sets.length === 1 ? '' : 's')
                : 'Showing ' + visibleSets.length + ' of ' + sets.length}
          </p>
        )}

        {sets.length === 0 && <p className="app-text-muted">No sets saved yet.</p>}

        <ul className="sets-sidebar-list">
          {visibleSets.map(function(setRecord) {
            const itemLabel = setItemCountLabel(setRecord);
            return (
              <li
                key={setRecord.id}
                className={'sets-sidebar-item' + (editingId === setRecord.id ? ' sets-sidebar-item--selected' : '')}
              >
                <button
                  type="button"
                  className="sets-sidebar-item-main"
                  onClick={function() { startEdit(setRecord); }}
                >
                  <span className="sets-sidebar-item-heading">
                    <span className="sets-sidebar-item-name">{setRecord.name}</span>
                    {setRecord.date && (
                      <span className="sets-sidebar-item-date">{setRecord.date}</span>
                    )}
                    {itemLabel && (
                      <span className="sets-sidebar-item-count">{itemLabel}</span>
                    )}
                  </span>
                  {setRecord.notes && <span className="sets-sidebar-item-notes">{setRecord.notes}</span>}
                </button>
                <div className="sets-sidebar-item-actions">
                  <Button
                    size="sm"
                    variant="success"
                    className="sets-sidebar-action-btn"
                    aria-label="Play set"
                    title="Play set"
                    disabled={!setHasItems(setRecord)}
                    onClick={function(e) {
                      e.stopPropagation();
                      handlePlaySet(setRecord);
                    }}
                  >
                    {tunebook.icons.play}
                    <span className="sets-sidebar-action-label">Play</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    className="sets-sidebar-action-btn"
                    aria-label="Duplicate set"
                    title="Duplicate set"
                    onClick={function(e) {
                      e.stopPropagation();
                      const copy = duplicatePerformanceSet(setRecord.id);
                      if (copy) refreshSets();
                    }}
                  >
                    {tunebook.icons.filecopyline}
                    <span className="sets-sidebar-action-label">Duplicate</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    className="sets-sidebar-action-btn"
                    aria-label="Delete set"
                    title="Delete set"
                    onClick={function(e) {
                      e.stopPropagation();
                      handleDelete(setRecord.id);
                    }}
                  >
                    {tunebook.icons.deletebin}
                    <span className="sets-sidebar-action-label">Delete</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {hiddenSetCount > 0 && (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={function() { setShowAllSets(true); }}
          >
            Show more ({hiddenSetCount} more)
          </Button>
        )}

        {canCollapseSetList && (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={function() { setShowAllSets(false); }}
          >
            Show recent only
          </Button>
        )}

        {hasSetFilter && visibleSets.length === 0 && (
          <p className="app-text-muted">No sets match your search.</p>
        )}
      </aside>
    );
  }

  return (
    <div className="App-settings sets-page">
      <div className="sets-page-header">
        <h1>{props.gigPickerMode ? 'Gig mode — pick a set' : 'Performance sets'}</h1>
        <div className="sets-page-header-actions">
        <Button
          variant="secondary"
          disabled={sets.length === 0}
          onClick={function() {
            const text = exportAllPerformanceSetsText(sets, tunes);
            tunebook.utils.download('performance-sets.txt', text);
          }}
        >
          Export
        </Button>
        <Button variant="primary" onClick={startNew}>New set</Button>
        </div>
      </div>
      <p className="app-text-muted sets-page-intro">
        {props.gigPickerMode
          ? 'Choose a set to open fullscreen Gig Mode with foot-pedal scrolling and set-aware navigation.'
          : 'Build ordered setlists for gigs. Play a set in fullscreen Gig Mode with foot-pedal scrolling and set-aware navigation.'}
      </p>

      <div className={'sets-page-layout' + (props.gigPickerMode ? ' sets-page-layout--picker' : '')}>
        {renderSetSidebar()}
        {!props.gigPickerMode ? (
        <main className="sets-page-main">
          {renderEditor()}
        </main>
        ) : null}
      </div>

      <GigModeModal
        show={showGig}
        onClose={handleCloseGig}
        setPlaylist={props.setPlaylist}
        setSetPlaylist={props.setSetPlaylist}
        tunes={tunes}
        tunebook={tunebook}
        mediaController={props.mediaController}
        blockKeyboardShortcuts={props.blockKeyboardShortcuts}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      />
    </div>
  );
}
