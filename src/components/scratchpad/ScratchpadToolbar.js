import { useEffect, useState } from 'react'
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap'
import {
  listWorkspaces,
  getWorkspace,
  setActiveWorkspaceId,
  createWorkspace,
} from '../../scratchpadStore'
import ScratchpadWorkspaceDialog from './ScratchpadWorkspaceDialog'
import ScratchpadCreateWizard from './ScratchpadCreateWizard'

export default function ScratchpadToolbar(props) {
  const [workspaces, setWorkspaces] = useState([])
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false)
  const [showCreateWizard, setShowCreateWizard] = useState(false)

  useEffect(function() {
    setWorkspaces(listWorkspaces())
  }, [props.revision, props.activeWorkspaceId])

  const active = props.activeWorkspaceId ? getWorkspace(props.activeWorkspaceId) : null
  const activeName = active ? active.name : 'Workspace'

  function selectWorkspace(workspaceId) {
    setActiveWorkspaceId(workspaceId)
  }

  function handleCreateWorkspace(name) {
    createWorkspace(name)
    setShowWorkspaceDialog(false)
  }

  return (
    <div className="scratchpad-toolbar">
      <div className="scratchpad-toolbar-left">
        <ButtonGroup>
          <Dropdown>
            <Dropdown.Toggle variant="outline-primary" id="scratchpad-workspace-dropdown">
              {activeName}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {workspaces.map(function(ws) {
                return (
                  <Dropdown.Item
                    key={ws.id}
                    active={ws.id === props.activeWorkspaceId}
                    onClick={function() { selectWorkspace(ws.id) }}
                  >
                    {ws.name}
                  </Dropdown.Item>
                )
              })}
            </Dropdown.Menu>
          </Dropdown>
          <Button
            variant="outline-secondary"
            title="Add workspace"
            onClick={function() { setShowWorkspaceDialog(true) }}
          >
            +
          </Button>
        </ButtonGroup>
      </div>
      <div className="scratchpad-toolbar-right">
        <Button
          variant="success"
          className="scratchpad-create-btn"
          onClick={function() { setShowCreateWizard(true) }}
        >
          Create
        </Button>
      </div>

      <ScratchpadWorkspaceDialog
        show={showWorkspaceDialog}
        onHide={function() { setShowWorkspaceDialog(false) }}
        onCreate={handleCreateWorkspace}
      />
      <ScratchpadCreateWizard
        show={showCreateWizard}
        onHide={function() { setShowCreateWizard(false) }}
        workspaceId={props.activeWorkspaceId}
        tunebook={props.tunebook}
        token={props.token}
        onCreated={function(itemId) {
          setShowCreateWizard(false)
          if (props.onCreated) props.onCreated(itemId)
        }}
      />
    </div>
  )
}
