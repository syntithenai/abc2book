import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Button, Form, ListGroup, Badge, Modal, ButtonGroup, Spinner, Table } from 'react-bootstrap'
import {
  listGroups,
  listSets,
  saveGroup,
  saveSet,
  deleteGroup,
  deleteSet,
  moveSetToGroup,
  getNoteAudioBlob
} from '../soundpostSetStore'
import { TUNER_INSTRUMENT_LABELS } from '../instrumentTuningPresets'
import { sequencePresetLabel } from '../audioAnalysisSequences'
import { summarizeSetFeatures } from '../soundpostAnalysis'
import VoiceFillInput from './VoiceFillInput'
import ShareAudioAnalysisGroupModal from './ShareAudioAnalysisGroupModal'

const UNGROUPED = '__ungrouped__'

function fmt(n, digits) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits != null ? digits : 1)
}

function groupLabelMatchesFilter(label, filterText) {
  const needle = String(filterText || '').trim().toLowerCase()
  if (!needle) return true
  return String(label || '').toLowerCase().indexOf(needle) !== -1
}

function AudioAnalysisSetDetailModal(props) {
  const recordingSet = props.recordingSet
  const show = !!recordingSet
  const [playingId, setPlayingId] = useState(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)
  const saveTimerRef = useRef(null)

  const summary = useMemo(function() {
    return recordingSet ? summarizeSetFeatures(recordingSet.notes) : null
  }, [recordingSet])

  const notes = (recordingSet && recordingSet.notes) || []
  const groupLabel = props.groupLabel || 'Ungrouped'

  useEffect(function() {
    if (!show) setPlayingId(null)
  }, [show])

  useEffect(function() {
    setLabelDraft(recordingSet && recordingSet.label ? recordingSet.label : '')
  }, [recordingSet && recordingSet.id, recordingSet && recordingSet.label])

  useEffect(function() {
    return function() {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  function scheduleLabelSave(nextValue) {
    setLabelDraft(nextValue)
    if (!recordingSet || !recordingSet.id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async function() {
      const nextLabel = String(nextValue || '').trim() || 'Untitled set'
      if (nextLabel === (recordingSet.label || 'Untitled set')) return
      setSavingLabel(true)
      try {
        const saved = await saveSet(Object.assign({}, recordingSet, { label: nextLabel }))
        if (props.onLabelSaved) props.onLabelSaved(saved)
      } finally {
        setSavingLabel(false)
      }
    }, 400)
  }

  async function playNote(note, idx) {
    if (!note || !note.audioBlobKey) return
    const playKey = note.id || note.targetNote || String(idx)
    setPlayingId(playKey)
    try {
      const blob = await getNoteAudioBlob(note.audioBlobKey)
      if (!blob) {
        setPlayingId(null)
        return
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = function() {
        URL.revokeObjectURL(url)
        setPlayingId(null)
      }
      audio.onerror = function() {
        URL.revokeObjectURL(url)
        setPlayingId(null)
      }
      await audio.play()
    } catch (err) {
      setPlayingId(null)
    }
  }

  return (
    <Modal show={show} onHide={props.onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title className="flex-grow-1 me-2">
          <Form.Label className="small text-muted mb-1 d-block">Set name</Form.Label>
          <Form.Control
            value={labelDraft}
            onChange={function(e) { scheduleLabelSave(e.target.value) }}
            placeholder="Untitled set"
            aria-label="Set name"
          />
          {savingLabel ? <div className="small text-muted mt-1">Saving…</div> : null}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!recordingSet ? null : (
          <>
            <dl className="row small mb-3">
              <dt className="col-sm-3">Group</dt>
              <dd className="col-sm-9">{groupLabel}</dd>
              <dt className="col-sm-3">Instrument</dt>
              <dd className="col-sm-9">
                {TUNER_INSTRUMENT_LABELS[recordingSet.instrument] || recordingSet.instrument || '—'}
                {recordingSet.tuningPresetId ? ' · ' + recordingSet.tuningPresetId : ''}
              </dd>
              <dt className="col-sm-3">Mode</dt>
              <dd className="col-sm-9">{recordingSet.measurementMode === 'tap' ? 'Tap body response' : 'Bowed notes'}</dd>
              <dt className="col-sm-3">Sequence</dt>
              <dd className="col-sm-9">{sequencePresetLabel(recordingSet.sequencePresetId)}</dd>
              <dt className="col-sm-3">Recordings</dt>
              <dd className="col-sm-9">
                {notes.length} {recordingSet.measurementMode === 'tap' ? 'taps' : 'notes'}
              </dd>
              <dt className="col-sm-3">Created</dt>
              <dd className="col-sm-9">
                {recordingSet.createdAt ? new Date(recordingSet.createdAt).toLocaleString() : '—'}
              </dd>
              <dt className="col-sm-3">Updated</dt>
              <dd className="col-sm-9">
                {recordingSet.updatedAt ? new Date(recordingSet.updatedAt).toLocaleString() : '—'}
              </dd>
              <dt className="col-sm-3">Sync</dt>
              <dd className="col-sm-9">
                {recordingSet.needsSync || !recordingSet.syncedAt
                  ? 'Unsynced'
                  : ('Synced ' + new Date(recordingSet.syncedAt).toLocaleString())}
              </dd>
            </dl>

            {summary ? (
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Badge bg="light" text="dark">Level {fmt(summary.rmsDb)} dB</Badge>
                <Badge bg="light" text="dark">Centroid {fmt(summary.centroidHz)} Hz</Badge>
                <Badge bg="light" text="dark">Richness {fmt(summary.richness, 2)}</Badge>
                <Badge bg="light" text="dark">
                  In-tune {summary.inTuneRatio != null ? fmt(summary.inTuneRatio * 100, 0) + '%' : '—'}
                </Badge>
              </div>
            ) : null}

            <Table responsive size="sm" bordered hover className="mb-0">
              <thead>
                <tr>
                  <th>{recordingSet.measurementMode === 'tap' ? 'Tap' : 'Note'}</th>
                  <th>Level</th>
                  <th>Centroid</th>
                  <th>Richness</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {notes.map(function(note, idx) {
                  const feat = (note && note.features) || {}
                  const playKey = note.id || note.targetNote || String(idx)
                  return (
                    <tr key={playKey + '-' + idx}>
                      <td>{note.targetNote || ('#' + (idx + 1))}</td>
                      <td>{fmt(feat.rmsDb)} dB</td>
                      <td>{fmt(feat.centroidHz)} Hz</td>
                      <td>{fmt(feat.richness, 2)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          className="audio-analysis-play-btn"
                          disabled={!note.audioBlobKey || playingId === playKey}
                          onClick={function() { playNote(note, idx) }}
                          aria-label={playingId === playKey ? 'Playing' : 'Play'}
                        >
                          <span className="audio-analysis-play-btn-label">
                            {playingId === playKey ? 'Playing…' : 'Play'}
                          </span>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}

export default function AudioAnalysisHistory(props) {
  const [groups, setGroups] = useState([])
  const [sets, setSets] = useState([])
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameLabel, setRenameLabel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [groupNameFilter, setGroupNameFilter] = useState(function() {
    return props.initialGroupNameFilter ? String(props.initialGroupNameFilter) : ''
  })
  const [detailSet, setDetailSet] = useState(null)

  const reload = useCallback(function() {
    return Promise.all([listGroups(), listSets()]).then(function(pair) {
      setGroups(pair[0])
      setSets(pair[1])
    })
  }, [])

  useEffect(function() {
    reload()
  }, [reload, props.refreshKey])

  useEffect(function() {
    if (props.initialGroupNameFilter == null) return
    setGroupNameFilter(String(props.initialGroupNameFilter))
  }, [props.initialGroupNameFilter])

  function setsForGroup(groupId) {
    if (groupId === UNGROUPED) {
      return sets.filter(function(s) { return !s.groupId })
    }
    return sets.filter(function(s) { return s.groupId === groupId })
  }

  async function onCreateGroup(e) {
    e.preventDefault()
    const label = newGroupLabel.trim()
    if (!label) return
    await saveGroup({ label: label })
    setNewGroupLabel('')
    setShowAddGroup(false)
    reload()
  }

  async function onRenameSubmit(e) {
    e.preventDefault()
    if (!renameTarget || renameTarget.type !== 'group') return
    const nextLabel = renameLabel.trim() || 'Untitled'
    await saveGroup({ id: renameTarget.id, label: nextLabel })
    setRenameTarget(null)
    reload()
    if (props.onChanged) props.onChanged()
  }

  async function onConfirmDelete() {
    if (!confirmDelete) return
    if (confirmDelete.type === 'group') {
      await deleteGroup(confirmDelete.id, { deleteSets: !!confirmDelete.deleteSets })
    } else if (confirmDelete.type === 'set') {
      await deleteSet(confirmDelete.id)
    }
    setConfirmDelete(null)
    reload()
    if (props.onChanged) props.onChanged()
  }

  async function onMoveSet(setId, groupId) {
    await moveSetToGroup(setId, groupId === UNGROUPED ? null : groupId)
    reload()
  }

  function openRename(type, id, label) {
    setRenameTarget({ type: type, id: id })
    setRenameLabel(label || '')
  }

  function compareGroup(groupKey) {
    if (props.onCompare) props.onCompare(groupKey)
  }

  function applyGroupFilter(label) {
    const next = label || ''
    setGroupNameFilter(next)
    if (props.onGroupNameFilterChange) props.onGroupNameFilterChange(next)
  }

  const sections = useMemo(function() {
    const all = groups.map(function(g) {
      return { key: g.id, label: g.label, group: g, items: setsForGroup(g.id) }
    })
    all.push({
      key: UNGROUPED,
      label: 'Ungrouped',
      group: null,
      items: setsForGroup(UNGROUPED)
    })
    return all.filter(function(section) {
      return groupLabelMatchesFilter(section.label, groupNameFilter)
    })
  }, [groups, sets, groupNameFilter])

  const detailGroupLabel = useMemo(function() {
    if (!detailSet) return 'Ungrouped'
    if (!detailSet.groupId) return 'Ungrouped'
    const g = groups.find(function(x) { return x.id === detailSet.groupId })
    return g && g.label ? g.label : 'Ungrouped'
  }, [detailSet, groups])

  return (
    <div className="audio-analysis-history">
      <div className="d-flex flex-wrap align-items-center mb-3">
        <Button
          variant="primary"
          onClick={function() {
            setNewGroupLabel('')
            setShowAddGroup(true)
          }}
        >
          New Group
        </Button>
        <Button
          variant="primary"
          className="ms-2"
          onClick={function() { if (props.onNewSet) props.onNewSet() }}
        >
          New Set
        </Button>
        <Button
          variant="outline-secondary"
          className="ms-5"
          disabled={!!props.syncing}
          onClick={function() { if (props.onSync) props.onSync() }}
        >
          {props.syncing ? (
            <span><Spinner animation="border" size="sm" className="me-1" /> Syncing</span>
          ) : (
            (props.token && props.token.access_token) ? 'Sync Drive' : 'Login To Sync'
          )}
        </Button>
        <Button
          variant="outline-secondary"
          className="ms-2"
          onClick={function() { if (props.onHelp) props.onHelp() }}
        >
          Help
        </Button>
      </div>

      <div className="d-flex flex-nowrap align-items-center mb-3">
        <Button
          variant="success"
          className="flex-shrink-0"
          style={{ marginRight: '2.5ch' }}
          onClick={function() { applyGroupFilter('') }}
          disabled={!String(groupNameFilter || '').trim()}
        >
          Show all
        </Button>
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <VoiceFillInput
            className="w-100"
            placeholder="Filter by group name"
            value={groupNameFilter}
            onChange={function(e) { setGroupNameFilter(e.target.value) }}
            fieldKind="search"
            token={props.token}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            aria-label="Filter groups by name"
          />
        </div>
      </div>

      {!sections.length ? (
        <p className="text-muted">No groups match this filter.</p>
      ) : null}

      {sections.map(function(section) {
        if (!section.items.length && section.key === UNGROUPED && groups.length && !String(groupNameFilter || '').trim()) {
          /* still show empty ungrouped lightly when not filtering */
        }
        return (
          <div key={section.key} className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <h5 className="mb-0">
                <button
                  type="button"
                  className="btn btn-link p-0 align-baseline text-decoration-underline"
                  style={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit' }}
                  onClick={function() { applyGroupFilter(section.label) }}
                  title={'Filter to “' + section.label + '”'}
                >
                  {section.label}
                </button>
              </h5>
              <Badge bg="secondary">{section.items.length}</Badge>
              <ShareAudioAnalysisGroupModal
                groupId={section.group ? section.group.id : null}
                groupLabel={section.group ? section.group.label : null}
                sets={section.items}
                driveApi={props.driveApi}
                token={props.token}
                login={props.login}
                copyText={props.copyText}
              />
              <Button
                size="sm"
                variant="outline-primary"
                onClick={function() { compareGroup(section.key) }}
              >
                Compare sets
              </Button>
              {section.group ? (
                <ButtonGroup size="sm">
                  <Button
                    variant="outline-secondary"
                    onClick={function() {
                      openRename('group', section.group.id, section.group.label)
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="outline-danger"
                    onClick={function() {
                      setConfirmDelete({ type: 'group', id: section.group.id, label: section.group.label, deleteSets: false })
                    }}
                  >
                    Delete
                  </Button>
                </ButtonGroup>
              ) : null}
            </div>
            {!section.items.length ? (
              <p className="text-muted small mb-0">No sets in this group.</p>
            ) : (
              <ListGroup>
                {section.items.map(function(set) {
                  return (
                    <ListGroup.Item key={set.id} className="d-flex flex-wrap align-items-center gap-2">
                      <div className="flex-grow-1">
                        <button
                          type="button"
                          className="btn btn-link p-0 fw-bold text-start text-decoration-underline"
                          onClick={function() { setDetailSet(set) }}
                          title="View set details"
                        >
                          {set.label || 'Untitled set'}
                        </button>
                        <div className="small text-muted">
                          {(TUNER_INSTRUMENT_LABELS[set.instrument] || set.instrument)}
                          {set.measurementMode === 'tap' ? ' · tap' : ''}
                          {set.tuningPresetId ? ' · ' + set.tuningPresetId : ''}
                          {' · '}
                          {sequencePresetLabel(set.sequencePresetId)}
                          {' · '}
                          {(set.notes || []).length} {set.measurementMode === 'tap' ? 'taps' : 'notes'}
                          {set.needsSync || !set.syncedAt ? ' · unsynced' : ''}
                          {set.createdAt ? ' · ' + new Date(set.createdAt).toLocaleString() : ''}
                        </div>
                      </div>
                      <Form.Select
                        size="sm"
                        style={{ maxWidth: '10rem' }}
                        value={set.groupId || UNGROUPED}
                        onChange={function(e) { onMoveSet(set.id, e.target.value) }}
                        aria-label="Move to group"
                      >
                        <option value={UNGROUPED}>Ungrouped</option>
                        {groups.map(function(g) {
                          return <option key={g.id} value={g.id}>{g.label}</option>
                        })}
                      </Form.Select>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={function() {
                          setConfirmDelete({ type: 'set', id: set.id, label: set.label })
                        }}
                      >
                        Delete
                      </Button>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            )}
          </div>
        )
      })}

      <AudioAnalysisSetDetailModal
        recordingSet={detailSet}
        groupLabel={detailGroupLabel}
        onHide={function() { setDetailSet(null) }}
        onLabelSaved={function(saved) {
          setDetailSet(saved)
          reload()
          if (props.onChanged) props.onChanged()
        }}
      />

      <Modal
        show={showAddGroup}
        onHide={function() { setShowAddGroup(false) }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>New Group</Modal.Title>
        </Modal.Header>
        <Form onSubmit={onCreateGroup}>
          <Modal.Body>
            <Form.Label className="small">Group name</Form.Label>
            <VoiceFillInput
              value={newGroupLabel}
              onChange={function(e) { setNewGroupLabel(e.target.value) }}
              placeholder="e.g. Violin — soundpost session"
              autoFocus
              fieldKind="search"
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={function() { setShowAddGroup(false) }}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!newGroupLabel.trim()}>Create</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!renameTarget} onHide={function() { setRenameTarget(null) }} centered>
        <Modal.Header closeButton>
          <Modal.Title>Rename group</Modal.Title>
        </Modal.Header>
        <Form onSubmit={onRenameSubmit}>
          <Modal.Body>
            <VoiceFillInput
              value={renameLabel}
              onChange={function(e) { setRenameLabel(e.target.value) }}
              autoFocus
              fieldKind="search"
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={function() { setRenameTarget(null) }}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!confirmDelete} onHide={function() { setConfirmDelete(null) }} centered>
        <Modal.Header closeButton><Modal.Title>Confirm delete</Modal.Title></Modal.Header>
        <Modal.Body>
          {confirmDelete && confirmDelete.type === 'group' ? (
            <div>
              <p>Delete group <strong>{confirmDelete.label}</strong>?</p>
              <Form.Check
                type="checkbox"
                id="delete-group-sets"
                label="Also delete all sets in this group"
                checked={!!confirmDelete.deleteSets}
                onChange={function(e) {
                  setConfirmDelete(Object.assign({}, confirmDelete, { deleteSets: e.target.checked }))
                }}
              />
              {!confirmDelete.deleteSets ? (
                <p className="small text-muted mb-0">Sets will move to Ungrouped.</p>
              ) : null}
            </div>
          ) : (
            <p className="mb-0">Delete set <strong>{confirmDelete && confirmDelete.label}</strong>? This cannot be undone.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setConfirmDelete(null) }}>Cancel</Button>
          <Button variant="danger" onClick={onConfirmDelete}>Delete</Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
