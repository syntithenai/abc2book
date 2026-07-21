import React, { useEffect, useState, useCallback } from 'react'
import { Button, Form, ListGroup, Badge, Modal, ButtonGroup } from 'react-bootstrap'
import {
  listGroups,
  listSets,
  saveGroup,
  deleteGroup,
  deleteSet,
  moveSetToGroup
} from '../soundpostSetStore'
import { TUNER_INSTRUMENT_LABELS } from '../instrumentTuningPresets'
import { sequencePresetLabel } from '../audioAnalysisSequences'
import VoiceFillInput from './VoiceFillInput'

const UNGROUPED = '__ungrouped__'

export default function AudioAnalysisHistory(props) {
  const [groups, setGroups] = useState([])
  const [sets, setSets] = useState([])
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [renameId, setRenameId] = useState(null)
  const [renameLabel, setRenameLabel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const reload = useCallback(function() {
    return Promise.all([listGroups(), listSets()]).then(function(pair) {
      setGroups(pair[0])
      setSets(pair[1])
    })
  }, [])

  useEffect(function() {
    reload()
  }, [reload, props.refreshKey])

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
    reload()
  }

  async function onRenameGroup(e) {
    e.preventDefault()
    if (!renameId) return
    await saveGroup({ id: renameId, label: renameLabel.trim() || 'Untitled' })
    setRenameId(null)
    reload()
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

  const sections = groups.map(function(g) {
    return { key: g.id, label: g.label, group: g, items: setsForGroup(g.id) }
  })
  sections.push({
    key: UNGROUPED,
    label: 'Ungrouped',
    group: null,
    items: setsForGroup(UNGROUPED)
  })

  return (
    <div className="audio-analysis-history">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <Button variant="primary" onClick={function() { if (props.onNewSet) props.onNewSet() }}>
          New set
        </Button>
        <Button variant="outline-secondary" onClick={function() { if (props.onCompare) props.onCompare() }}>
          Compare sets
        </Button>
      </div>

      <Form className="d-flex gap-2 mb-3 align-items-stretch" onSubmit={onCreateGroup}>
        <VoiceFillInput
          className="flex-grow-1"
          placeholder="New group name"
          value={newGroupLabel}
          onChange={function(e) { setNewGroupLabel(e.target.value) }}
          fieldKind="search"
          token={props.token}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        />
        <Button type="submit" variant="outline-primary">Add group</Button>
      </Form>

      {sections.map(function(section) {
        if (!section.items.length && section.key === UNGROUPED && groups.length) {
          /* still show empty ungrouped lightly */
        }
        return (
          <div key={section.key} className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-1">
              <h5 className="mb-0">{section.label}</h5>
              <Badge bg="secondary">{section.items.length}</Badge>
              {section.group ? (
                <ButtonGroup size="sm">
                  <Button
                    variant="outline-secondary"
                    onClick={function() {
                      setRenameId(section.group.id)
                      setRenameLabel(section.group.label)
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
                        <strong>{set.label}</strong>
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

      <Modal show={!!renameId} onHide={function() { setRenameId(null) }} centered>
        <Modal.Header closeButton><Modal.Title>Rename group</Modal.Title></Modal.Header>
        <Form onSubmit={onRenameGroup}>
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
            <Button variant="secondary" onClick={function() { setRenameId(null) }}>Cancel</Button>
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
