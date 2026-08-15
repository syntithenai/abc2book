import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Form } from 'react-bootstrap'
import { toast } from 'react-toastify'
import VoiceFillInput from '../components/VoiceFillInput'
import {
  deletePracticeList,
  duplicatePracticeList,
  getPracticeList,
  listPracticeLists,
  practiceListTuneCount,
  savePracticeList,
  subscribePracticeLists,
} from '../practiceListStore'
import { useDocumentTitle } from '../pageTitle'
import './SetsPage.css'

const LIST_TUNE_PICKER_LIMIT = 80
const LIST_DEFAULT_LIMIT = 5
const AUTO_SAVE_DEBOUNCE_MS = 600

function emptyPracticeList() {
  return {
    name: 'New practice list',
    notes: '',
    tuneIds: [],
  }
}

function moveTuneId(tuneIds, index, direction) {
  const next = tuneIds.slice()
  const target = index + direction
  if (target < 0 || target >= next.length) return tuneIds
  const tmp = next[index]
  next[index] = next[target]
  next[target] = tmp
  return next
}

function tuneSearchHaystack(tune) {
  return [
    tune.name,
    tune.composer,
    Array.isArray(tune.tags) ? tune.tags.join(' ') : '',
    Array.isArray(tune.books) ? tune.books.join(' ') : '',
  ].join(' ').toLowerCase()
}

function tuneMatchesSearch(tune, query) {
  const tokens = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(function(part) { return part.length > 0 })
  if (tokens.length === 0) return true
  const haystack = tuneSearchHaystack(tune)
  return tokens.every(function(token) { return haystack.indexOf(token) !== -1 })
}

function listSearchHaystack(listRecord) {
  return [listRecord.name, listRecord.notes].join(' ').toLowerCase()
}

function listMatchesSearch(listRecord, query) {
  const tokens = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(function(part) { return part.length > 0 })
  if (tokens.length === 0) return true
  const haystack = listSearchHaystack(listRecord)
  return tokens.every(function(token) { return haystack.indexOf(token) !== -1 })
}

function listItemCountLabel(listRecord) {
  const count = practiceListTuneCount(listRecord)
  if (count === 0) return ''
  return count + ' tune' + (count === 1 ? '' : 's')
}

export default function PracticeListsPage(props) {
  const navigate = useNavigate()
  const params = useParams()
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const [lists, setLists] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyPracticeList())
  const [tuneSearchText, setTuneSearchText] = useState('')
  const [debouncedTuneSearchText, setDebouncedTuneSearchText] = useState('')
  const [listFilterText, setListFilterText] = useState('')
  const [showAllLists, setShowAllLists] = useState(false)
  const autoSaveTimerRef = useRef(null)
  const tuneSearchDebounceRef = useRef(null)
  const draftRef = useRef(draft)
  const editingIdRef = useRef(editingId)
  draftRef.current = draft
  editingIdRef.current = editingId

  useDocumentTitle(editingId && draft && draft.name ? draft.name : 'Practice lists')

  const tuneOptions = useMemo(function() {
    return Object.values(tunes)
      .filter(function(t) { return t && t.id && t.name })
      .sort(function(a, b) { return String(a.name).localeCompare(String(b.name)) })
  }, [tunes])

  const hasTuneSearch = debouncedTuneSearchText.trim().length > 0
  const filteredTuneOptions = useMemo(function() {
    if (!hasTuneSearch) {
      return { tunes: [], total: 0, truncated: false }
    }
    const matches = tuneOptions.filter(function(tune) {
      return tuneMatchesSearch(tune, debouncedTuneSearchText)
    })
    return {
      tunes: matches.slice(0, LIST_TUNE_PICKER_LIMIT),
      total: matches.length,
      truncated: matches.length > LIST_TUNE_PICKER_LIMIT,
    }
  }, [tuneOptions, debouncedTuneSearchText, hasTuneSearch])

  const filteredLists = useMemo(function() {
    return lists.filter(function(listRecord) {
      return listMatchesSearch(listRecord, listFilterText)
    })
  }, [lists, listFilterText])

  const hasListFilter = listFilterText.trim().length > 0
  const visibleLists = useMemo(function() {
    if (hasListFilter || showAllLists) return filteredLists
    return filteredLists.slice(0, LIST_DEFAULT_LIMIT)
  }, [filteredLists, hasListFilter, showAllLists])

  const hiddenListCount = hasListFilter || showAllLists
    ? 0
    : Math.max(0, filteredLists.length - LIST_DEFAULT_LIMIT)
  const canCollapseList = !hasListFilter && showAllLists && lists.length > LIST_DEFAULT_LIMIT

  function refreshLists() {
    setLists(listPracticeLists())
  }

  useEffect(function() {
    if (tuneSearchDebounceRef.current) clearTimeout(tuneSearchDebounceRef.current)
    tuneSearchDebounceRef.current = setTimeout(function() {
      setDebouncedTuneSearchText(tuneSearchText)
    }, 250)
    return function() {
      if (tuneSearchDebounceRef.current) clearTimeout(tuneSearchDebounceRef.current)
    }
  }, [tuneSearchText])

  function flushAutoSave() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (!editingIdRef.current) return null
    const saved = savePracticeList(Object.assign({}, draftRef.current, { id: editingIdRef.current }))
    refreshLists()
    return saved
  }

  function scheduleAutoSave() {
    if (!editingIdRef.current) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(function() {
      autoSaveTimerRef.current = null
      flushAutoSave()
    }, AUTO_SAVE_DEBOUNCE_MS)
  }

  useEffect(function() {
    scheduleAutoSave()
    return function() {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [draft, editingId])

  useEffect(function() {
    refreshLists()
    const unsubscribe = subscribePracticeLists(refreshLists)
    return function() { unsubscribe() }
  }, [])

  useEffect(function() {
    if (!params.listId) return
    const existing = getPracticeList(params.listId)
    if (!existing) return
    setEditingId(existing.id)
    setDraft(existing)
  }, [params.listId])

  function startEdit(listRecord) {
    flushAutoSave()
    setEditingId(listRecord.id)
    setDraft(Object.assign({}, listRecord))
    navigate('/practice-lists/' + encodeURIComponent(listRecord.id))
  }

  function startNew() {
    flushAutoSave()
    setEditingId(null)
    setDraft(emptyPracticeList())
    navigate('/practice-lists')
  }

  function saveDraft() {
    const saved = savePracticeList(Object.assign({}, draft, { id: editingId || undefined }))
    setEditingId(saved.id)
    setDraft(saved)
    refreshLists()
    navigate('/practice-lists/' + encodeURIComponent(saved.id))
    return saved
  }

  function handleDelete(listId) {
    if (!window.confirm('Delete this practice list?')) return
    deletePracticeList(listId)
    if (editingId === listId) startNew()
    refreshLists()
  }

  function addTuneToDraft(tuneId) {
    if (!tuneId) return
    const nextIds = (draft.tuneIds || []).slice()
    if (nextIds.indexOf(tuneId) !== -1) {
      toast.info('That tune is already in this list.')
      return
    }
    nextIds.push(tuneId)
    setDraft(Object.assign({}, draft, { tuneIds: nextIds }))
  }

  function renderEditor() {
    const tuneIds = draft.tuneIds || []
    const draftHasName = String(draft.name || '').trim().length > 0
    const draftReady = draftHasName

    return (
      <div className="app-surface-panel sets-page-editor">
        <div className="sets-page-editor-header">
          <h2>{editingId ? 'Edit practice list' : 'New practice list'}</h2>
          <div className="sets-page-editor-actions">
            <Button variant="primary" className="sets-page-editor-action-btn" onClick={saveDraft} disabled={!draftReady}>
              {tunebook.icons.save}
              <span className="sets-page-editor-action-label">Save</span>
            </Button>
            <Button
              variant="success"
              className="sets-page-editor-action-btn"
              disabled={!draftReady || tuneIds.length === 0}
              onClick={function() {
                const saved = saveDraft()
                if (saved && saved.id) {
                  navigate('/practice?list=' + encodeURIComponent(saved.id))
                }
              }}
            >
              {tunebook.icons.practice}
              <span className="sets-page-editor-action-label">Practice</span>
            </Button>
          </div>
        </div>

        <Form.Group className="mb-2">
          <Form.Label>Name</Form.Label>
          <VoiceFillInput
            value={draft.name || ''}
            onChange={function(e) {
              setDraft(Object.assign({}, draft, { name: e.target.value }))
            }}
            token={props.token}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Notes</Form.Label>
          <VoiceFillInput
            as="textarea"
            rows={2}
            value={draft.notes || ''}
            onChange={function(e) {
              setDraft(Object.assign({}, draft, { notes: e.target.value }))
            }}
            token={props.token}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          />
        </Form.Group>

        <div className="sets-page-add-tune-panel">
          <Form.Label htmlFor="practice-tune-search">Add tune</Form.Label>
          <div className="sets-page-add-tune-row">
            <VoiceFillInput
              id="practice-tune-search"
              type="search"
              placeholder="Search by title, artist, book, or tag"
              value={tuneSearchText}
              onChange={function(e) { setTuneSearchText(e.target.value) }}
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
              fieldKind="search"
            />
          </div>
          {hasTuneSearch ? (
            <div className="app-text-muted sets-page-add-tune-count">
              {filteredTuneOptions.total + ' match' + (filteredTuneOptions.total === 1 ? '' : 'es')
                + (filteredTuneOptions.truncated ? ' (showing first ' + LIST_TUNE_PICKER_LIMIT + ')' : '')}
            </div>
          ) : null}
          {hasTuneSearch && filteredTuneOptions.tunes.length > 0 ? (
            <ul className="list-unstyled sets-tune-picker-list">
              {filteredTuneOptions.tunes.map(function(tune) {
                const alreadyAdded = tuneIds.indexOf(tune.id) !== -1
                const meta = [tune.composer]
                  .concat(Array.isArray(tune.books) ? tune.books : [])
                  .concat(Array.isArray(tune.tags) ? tune.tags : [])
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={tune.id}>
                    <button
                      type="button"
                      className="sets-tune-picker-item"
                      disabled={alreadyAdded}
                      onClick={function() { addTuneToDraft(tune.id) }}
                    >
                      <span className="sets-tune-picker-name">{tune.name}</span>
                      {meta ? <span className="sets-tune-picker-meta">{meta}</span> : null}
                      {alreadyAdded ? <span className="sets-tune-picker-added">Added</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : hasTuneSearch ? (
            <p className="app-text-muted" style={{ marginBottom: 0 }}>No tunes match your search.</p>
          ) : null}
        </div>

        <h3 className="sets-page-set-items-heading">Tunes in list ({tuneIds.length})</h3>
        {tuneIds.length === 0 ? (
          <p className="app-text-muted">
            Add tunes you want to work on in practice sessions.
          </p>
        ) : null}
        <ul className="sets-page-set-items">
          {tuneIds.map(function(tuneId, index) {
            const tune = tunes[tuneId]
            return (
              <li key={tuneId + '-' + index} className="sets-page-set-item">
                <div className="sets-page-set-item-main">
                  <span className="sets-page-set-item-title">
                    {tune && tune.name ? tune.name : tuneId}
                    {tune && tune.composer ? <span className="text-muted ms-2">{tune.composer}</span> : null}
                    {tune && tune.id ? (
                      <Button
                        as={Link}
                        to={'/tunes/' + tune.id}
                        size="sm"
                        variant="link"
                        className="p-0 ms-2"
                      >
                        open
                      </Button>
                    ) : (
                      <span className="text-danger ms-2">(tune not found)</span>
                    )}
                  </span>
                </div>
                <div className="sets-page-set-item-actions">
                  <Button size="sm" variant="outline-secondary" onClick={function() {
                    setDraft(Object.assign({}, draft, { tuneIds: moveTuneId(tuneIds, index, -1) }))
                  }}>↑</Button>
                  <Button size="sm" variant="outline-secondary" onClick={function() {
                    setDraft(Object.assign({}, draft, { tuneIds: moveTuneId(tuneIds, index, 1) }))
                  }}>↓</Button>
                  <Button size="sm" variant="outline-danger" onClick={function() {
                    const next = tuneIds.slice()
                    next.splice(index, 1)
                    setDraft(Object.assign({}, draft, { tuneIds: next }))
                  }}>Remove</Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  function renderSidebar() {
    return (
      <aside className="sets-page-sidebar">
        <VoiceFillInput
          type="search"
          className="sets-sidebar-filter-group"
          inputClassName="sets-sidebar-filter"
          placeholder="Search practice lists"
          value={listFilterText}
          onChange={function(e) { setListFilterText(e.target.value) }}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          token={props.token}
          fieldKind="search"
        />

        {lists.length === 0 && (
          <p className="app-text-muted">No practice lists yet. Create one to choose tunes for practice sessions.</p>
        )}

        <ul className="sets-sidebar-list">
          {visibleLists.map(function(listRecord) {
            const itemLabel = listItemCountLabel(listRecord)
            return (
              <li
                key={listRecord.id}
                className={'sets-sidebar-item' + (editingId === listRecord.id ? ' sets-sidebar-item--selected' : '')}
              >
                <button
                  type="button"
                  className="sets-sidebar-item-main"
                  onClick={function() { startEdit(listRecord) }}
                >
                  <span className="sets-sidebar-item-heading">
                    <span className="sets-sidebar-item-name">{listRecord.name}</span>
                    {itemLabel ? (
                      <span className="sets-sidebar-item-count">{itemLabel}</span>
                    ) : null}
                  </span>
                  {listRecord.notes ? <span className="sets-sidebar-item-notes">{listRecord.notes}</span> : null}
                </button>
                <div className="sets-sidebar-item-actions">
                  <Button
                    size="sm"
                    variant="success"
                    className="sets-sidebar-action-btn"
                    aria-label="Practice this list"
                    title="Practice this list"
                    disabled={practiceListTuneCount(listRecord) === 0}
                    onClick={function(e) {
                      e.stopPropagation()
                      navigate('/practice?list=' + encodeURIComponent(listRecord.id))
                    }}
                  >
                    {tunebook.icons.practice}
                    <span className="sets-sidebar-action-label">Practice</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    className="sets-sidebar-action-btn"
                    aria-label="Duplicate practice list"
                    title="Duplicate practice list"
                    onClick={function(e) {
                      e.stopPropagation()
                      const copy = duplicatePracticeList(listRecord.id)
                      if (copy) refreshLists()
                    }}
                  >
                    {tunebook.icons.filecopyline}
                    <span className="sets-sidebar-action-label">Duplicate</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    className="sets-sidebar-action-btn"
                    aria-label="Delete practice list"
                    title="Delete practice list"
                    onClick={function(e) {
                      e.stopPropagation()
                      handleDelete(listRecord.id)
                    }}
                  >
                    {tunebook.icons.deletebin}
                    <span className="sets-sidebar-action-label">Delete</span>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>

        {hiddenListCount > 0 ? (
          <Button variant="outline-secondary" size="sm" onClick={function() { setShowAllLists(true) }}>
            Show more ({hiddenListCount} more)
          </Button>
        ) : null}

        {canCollapseList ? (
          <Button variant="outline-secondary" size="sm" onClick={function() { setShowAllLists(false) }}>
            Show recent only
          </Button>
        ) : null}

        {hasListFilter && visibleLists.length === 0 ? (
          <p className="app-text-muted">No practice lists match your search.</p>
        ) : null}
      </aside>
    )
  }

  return (
    <div className="App-settings sets-page">
      <div className="sets-page-header">
        <h1>Practice lists</h1>
        <div className="sets-page-header-actions">
          <Button variant="primary" className="sets-page-header-action-btn" onClick={startNew}>
            {tunebook.icons.add}
            <span className="sets-page-header-action-label">New list</span>
          </Button>
        </div>
      </div>
      <p className="app-text-muted sets-page-intro">
        Curate tunes for practice sessions. Practice mode draws from the list you select when starting a session.
      </p>

      <div className="sets-page-layout">
        {renderSidebar()}
        {renderEditor()}
      </div>
    </div>
  )
}
