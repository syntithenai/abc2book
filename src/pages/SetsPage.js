import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import GigModeModal from '../components/GigModeModal';
import ShareTunebookModal from '../components/ShareTunebookModal';
import VoiceFillInput from '../components/VoiceFillInput';
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
import { createQueue } from '../nowPlayingQueue';
import { savePlaylistFromQueue } from '../savedPlaylistsStore';
import {
  applyPlaylistTuneId,
  buildGigRoute,
  getPlaylistTuneIdAtIndex,
} from '../gigRouteUtils';
import { useDocumentTitle, buildSetsPageTitle } from '../pageTitle';
import { todayKey } from '../calendarDay';
import './SetsPage.css';

function BulkOpsDualIcon({ leading, trailing }) {
  return (
    <span className="bulk-ops-dual-icon" aria-hidden="true">
      {leading}
      {trailing}
    </span>
  );
}

function emptySet() {
  return {
    name: 'New set',
    date: todayKey(),
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
  const [tuneSearchText, setTuneSearchText] = useState('');
  const [debouncedTuneSearchText, setDebouncedTuneSearchText] = useState('');
  const tuneSearchDebounceRef = useRef(null);
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

  const hasTuneSearch = debouncedTuneSearchText.trim().length > 0;
  const filteredTuneOptions = useMemo(function() {
    if (!hasTuneSearch) {
      return { tunes: [], total: 0, truncated: false };
    }
    const matches = tuneOptions.filter(function(tune) {
      return tuneMatchesSearch(tune, debouncedTuneSearchText);
    });
    return {
      tunes: matches.slice(0, SET_TUNE_PICKER_LIMIT),
      total: matches.length,
      truncated: matches.length > SET_TUNE_PICKER_LIMIT,
    };
  }, [tuneOptions, debouncedTuneSearchText, hasTuneSearch]);

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

  // Debounce tune search so the options list only re-filters after typing pauses
  useEffect(function() {
    if (tuneSearchDebounceRef.current) clearTimeout(tuneSearchDebounceRef.current);
    tuneSearchDebounceRef.current = setTimeout(function() {
      setDebouncedTuneSearchText(tuneSearchText);
    }, 250);
    return function() {
      if (tuneSearchDebounceRef.current) clearTimeout(tuneSearchDebounceRef.current);
    };
  }, [tuneSearchText]);

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
    refreshSets();
    const unsubscribe = subscribePerformanceSets(refreshSets);
    return function() {
      unsubscribe();
    };
  }, []);

  const gigTuneName = (params.tuneId && tunes[params.tuneId] && tunes[params.tuneId].name)
    ? tunes[params.tuneId].name
    : '';
  const loadedSetForTitle = params.setId ? getPerformanceSet(params.setId) : null;
  const setsTitleSetName = (props.gigMode || props.gigPickerMode || params.setId)
    ? (
      (editingId && draft && draft.name)
        || (loadedSetForTitle && loadedSetForTitle.name)
        || (draft && draft.name)
        || ''
    )
    : '';
  useDocumentTitle(buildSetsPageTitle({
    gigPickerMode: !!props.gigPickerMode,
    gigMode: !!props.gigMode,
    setName: setsTitleSetName,
    tuneName: props.gigMode ? gigTuneName : '',
  }));

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
    if (!tuneId) return;
    const nextItems = (draft.items || []).slice();
    nextItems.push({ type: 'tune', tuneId: tuneId });
    setDraft(Object.assign({}, draft, { items: nextItems }));
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

  function handleCreatePlaylistFromDraft() {
    const saved = flushAndGetDraft();
    if (!saved || !setHasItems(saved)) return;
    const tuneIds = normalizePerformanceSetItems(saved.items || []).map(function(item) {
      return item && item.tuneId;
    }).filter(Boolean);
    if (!tuneIds.length) return;
    const defaultName = String(saved.name || '').trim() || 'Playlist';
    const name = window.prompt(
      'Name for the new playlist with ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') + ':',
      defaultName
    );
    if (name === null) return;
    const queue = createQueue({
      tuneIds: tuneIds,
      name: String(name).trim() || defaultName,
      source: 'set',
    });
    const playlist = savePlaylistFromQueue(queue, { name: queue.name });
    if (!playlist) {
      toast.error('Could not create playlist.');
      return;
    }
    toast.success('Created playlist "' + (playlist.name || queue.name) + '"');
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
    const draftHasName = String(draft.name || '').trim().length > 0;
    const draftReady = draftHasName && draftHasItems;
    return (
      <div className="app-surface-panel sets-page-editor">
        <div className="sets-page-editor-header">
          <h2>{editingId ? 'Edit set' : 'New set'}</h2>
          <div className="sets-page-editor-actions">
            <Button variant="primary" className="sets-page-editor-action-btn" onClick={saveDraft} disabled={!draftReady}>
              {tunebook.icons.save}
              <span className="sets-page-editor-action-label">Save</span>
            </Button>
            <Button
              variant="success"
              className="sets-page-editor-action-btn"
              disabled={!draftReady}
              onClick={function() { handlePlaySet(flushAndGetDraft()); }}
            >
              {tunebook.icons.play}
              <span className="sets-page-editor-action-label">Play</span>
            </Button>
            <Button
              variant="outline-secondary"
              className="sets-page-editor-action-btn"
              disabled={!draftReady}
              onClick={function() {
                const saved = flushAndGetDraft();
                const text = exportPerformanceSetText(saved, tunes);
                tunebook.utils.download((saved.name || 'set') + '.txt', text);
              }}
            >
              {tunebook.icons.save}
              <span className="sets-page-editor-action-label">Export</span>
            </Button>
            {editingId ? (
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
                buttonClassName="sets-page-editor-action-btn"
                tiny={false}
              />
            ) : (
              <Button variant="outline-info" className="sets-page-editor-action-btn" disabled>
                {tunebook.icons.share}
                <span className="sets-page-editor-action-label">Share</span>
              </Button>
            )}
            <Button
              variant="success"
              className="sets-page-editor-action-btn bulk-ops-action-btn"
              disabled={!draftReady}
              title="Create playlist"
              aria-label="Create playlist"
              data-testid="sets-create-playlist"
              onClick={handleCreatePlaylistFromDraft}
            >
              <BulkOpsDualIcon leading={tunebook.icons.start} trailing={tunebook.icons.playlist} />
              <span className="sets-page-editor-action-label">Play List</span>
            </Button>
          </div>
        </div>
        <Form.Group className="mb-2">
          <Form.Label>Name</Form.Label>
          <VoiceFillInput
            value={draft.name || ''}
            onChange={function(e) {
            setDraft(Object.assign({}, draft, { name: e.target.value }));
          }}
            fieldKind="search"
            token={props.token}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          />
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

        <div className="sets-page-add-tune-panel">
          <Form.Label htmlFor="set-tune-search">Add tune</Form.Label>
          <div className="sets-page-add-tune-row">
            <VoiceFillInput
              id="set-tune-search"
              type="search"
              placeholder="Search by title, artist, book, or tag"
              value={tuneSearchText}
              onChange={function(e) { setTuneSearchText(e.target.value); }}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
              token={props.token}
              fieldKind="search"
            />
          </div>
          {hasTuneSearch ? (
            <div className="app-text-muted sets-page-add-tune-count">
              {filteredTuneOptions.total + ' match' + (filteredTuneOptions.total === 1 ? '' : 'es')
                + (filteredTuneOptions.truncated ? ' (showing first ' + SET_TUNE_PICKER_LIMIT + ')' : '')}
            </div>
          ) : null}
          {hasTuneSearch && filteredTuneOptions.tunes.length > 0 ? (
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
          ) : hasTuneSearch ? (
            <p className="app-text-muted" style={{ marginBottom: 0 }}>No tunes match your search.</p>
          ) : null}
        </div>

        {items.length === 0 && <p className="app-text-muted">No tunes selected yet.</p>}
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
                  <VoiceFillInput
                    size="sm"
                    inputClassName="sets-page-set-item-note"
                    placeholder="Note for this song"
                    value={item.note || ''}
                    onChange={function(e) { updateDraftTuneNote(index, e.target.value); }}
                    fieldKind="search"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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

      </div>
    );
  }

  function renderSetSidebar() {
    return (
      <aside className="sets-page-sidebar">
        <VoiceFillInput
          type="search"
          className="sets-sidebar-filter-group"
          inputClassName="sets-sidebar-filter"
          placeholder="Search sets by name, date, or notes"
          value={setListFilterText}
          onChange={function(e) { setSetListFilterText(e.target.value); }}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          token={props.token}
          fieldKind="search"
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
          className="sets-page-header-action-btn"
          disabled={sets.length === 0}
          onClick={function() {
            const text = exportAllPerformanceSetsText(sets, tunes);
            tunebook.utils.download('performance-sets.txt', text);
          }}
        >
          {tunebook.icons.save}
          <span className="sets-page-header-action-label">Export all</span>
        </Button>
        <Button variant="primary" className="sets-page-header-action-btn" onClick={startNew}>
          {tunebook.icons.add}
          <span className="sets-page-header-action-label">New Set</span>
        </Button>
        </div>
      </div>
      {props.gigPickerMode ? (
        <p className="app-text-muted sets-page-intro">
          Choose a set to open fullscreen Gig Mode with foot-pedal scrolling and set-aware navigation.
        </p>
      ) : null}

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
