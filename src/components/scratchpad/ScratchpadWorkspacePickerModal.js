import { useEffect, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import {
  listWorkspaces,
  getActiveWorkspaceId,
  getWorkspace,
  setActiveWorkspaceId,
  createWorkspace,
} from '../../scratchpadStore'
import ScratchpadWorkspaceDialog from './ScratchpadWorkspaceDialog'

export default function ScratchpadWorkspacePickerModal(props) {
  const [workspaces, setWorkspaces] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(function() {
    if (!props.show) return
    const list = listWorkspaces()
    setWorkspaces(list)
    const activeId = getActiveWorkspaceId()
    if (activeId && getWorkspace(activeId)) {
      setSelectedId(activeId)
    } else {
      setSelectedId('')
    }
  }, [props.show])

  function handleConfirm() {
    if (!selectedId) return
    setActiveWorkspaceId(selectedId)
    if (props.onConfirm) props.onConfirm(selectedId)
  }

  function handleCreateWorkspace(name) {
    const ws = createWorkspace(name)
    setWorkspaces(listWorkspaces())
    setSelectedId(ws.id)
    setShowCreateDialog(false)
  }

  return (
    <>
      <Modal show={!!props.show} onHide={props.onHide} centered>
        <Modal.Header closeButton>
          <Modal.Title>{props.title || 'Choose scratchpad workspace'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            {props.description || 'Select where the exported notation should be saved.'}
          </p>
          {workspaces.length === 0 ? (
            <p className="mb-3">No workspaces yet. Create one to continue.</p>
          ) : (
            <Form.Group>
              <Form.Label>Workspace</Form.Label>
              <Form.Select
                value={selectedId}
                onChange={function(e) { setSelectedId(e.target.value) }}
              >
                <option value="">Select a workspace…</option>
                {workspaces.map(function(ws) {
                  return (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  )
                })}
              </Form.Select>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
          <Button
            variant="outline-secondary"
            onClick={function() { setShowCreateDialog(true) }}
          >
            New workspace…
          </Button>
          <Button
            variant="primary"
            disabled={!selectedId}
            onClick={handleConfirm}
          >
            Continue
          </Button>
        </Modal.Footer>
      </Modal>
      <ScratchpadWorkspaceDialog
        show={showCreateDialog}
        onHide={function() { setShowCreateDialog(false) }}
        onCreate={handleCreateWorkspace}
      />
    </>
  )
}
