import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonGroup, Form } from 'react-bootstrap'
import { useDocumentTitle } from '../pageTitle'
import {
  ensureDefaultWorkspace,
  subscribeScratchpad,
  getActiveWorkspaceId,
  listWorkspaces,
  setActiveWorkspaceId,
  createWorkspace,
} from '../scratchpadStore'
import ScratchpadItemGrid from '../components/scratchpad/ScratchpadItemGrid'
import ScratchpadWorkspaceDialog from '../components/scratchpad/ScratchpadWorkspaceDialog'
import ScratchpadCreateWizard from '../components/scratchpad/ScratchpadCreateWizard'

export default function ScratchpadPage(props) {
  useDocumentTitle('Scratchpad')
  const navigate = useNavigate()
  const [revision, setRevision] = useState(0)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(getActiveWorkspaceId())
  const [workspaceFilterId, setWorkspaceFilterId] = useState('')
  const [search, setSearch] = useState('')
  const [workspaces, setWorkspaces] = useState([])
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false)
  const [showCreateWizard, setShowCreateWizard] = useState(false)

  useEffect(function() {
    ensureDefaultWorkspace()
    setActiveWorkspaceId(getActiveWorkspaceId())
    setWorkspaces(listWorkspaces())
    return subscribeScratchpad(function() {
      setRevision(function(n) { return n + 1 })
      setActiveWorkspaceId(getActiveWorkspaceId())
      setWorkspaces(listWorkspaces())
    })
  }, [])

  function handleItemClick(itemId) {
    navigate('/scratchpad/' + encodeURIComponent(itemId))
  }

  function handleCreated(itemId) {
    navigate('/scratchpad/' + encodeURIComponent(itemId))
  }

  function handleWorkspaceFilterChange(workspaceId) {
    setWorkspaceFilterId(workspaceId)
    if (workspaceId) {
      setActiveWorkspaceId(workspaceId)
    }
  }

  function handleCreateWorkspace(name) {
    const workspace = createWorkspace(name)
    setShowWorkspaceDialog(false)
    setWorkspaceFilterId(workspace.id)
  }

  return (
    <div className="scratchpad-page">
      <div className="scratchpad-list-search">
        <ButtonGroup className="scratchpad-list-workspace-controls">
          <Form.Select
            className="scratchpad-list-workspace-filter"
            value={workspaceFilterId}
            aria-label="Filter scratchpad by workspace"
            onChange={function(e) { handleWorkspaceFilterChange(e.target.value) }}
          >
            <option value="">All workspaces</option>
            {workspaces.map(function(ws) {
              return <option key={ws.id} value={ws.id}>{ws.name}</option>
            })}
          </Form.Select>
          <Button
            variant="outline-secondary"
            title="Add workspace"
            aria-label="Add workspace"
            onClick={function() { setShowWorkspaceDialog(true) }}
          >
            +
          </Button>
        </ButtonGroup>
        <Form.Control
          type="search"
          placeholder="Search scratchpad…"
          value={search}
          aria-label="Search scratchpad"
          onChange={function(e) { setSearch(e.target.value) }}
        />
        <Button
          variant="success"
          className="scratchpad-create-btn"
          onClick={function() { setShowCreateWizard(true) }}
        >
          Create
        </Button>
      </div>
      <ScratchpadItemGrid
        tunebook={props.tunebook}
        workspaceFilterId={workspaceFilterId}
        revision={revision}
        search={search}
        onItemClick={handleItemClick}
      />
      <ScratchpadWorkspaceDialog
        show={showWorkspaceDialog}
        onHide={function() { setShowWorkspaceDialog(false) }}
        onCreate={handleCreateWorkspace}
      />
      <ScratchpadCreateWizard
        show={showCreateWizard}
        onHide={function() { setShowCreateWizard(false) }}
        workspaceId={activeWorkspaceId}
        tunebook={props.tunebook}
        token={props.token}
        login={props.login}
        onCreated={function(itemId) {
          setShowCreateWizard(false)
          handleCreated(itemId)
        }}
      />
    </div>
  )
}
