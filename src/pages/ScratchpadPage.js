import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { useDocumentTitle } from '../pageTitle'
import { getScratchpadListItems } from '../scratchpadListSearch'
import {
  ensureDefaultWorkspace,
  subscribeScratchpad,
  getActiveWorkspaceId,
  listWorkspaces,
  setActiveWorkspaceId,
  createWorkspace,
  deleteScratchpadItem,
  moveScratchpadItem,
} from '../scratchpadStore'
import ScratchpadItemGrid from '../components/scratchpad/ScratchpadItemGrid'
import ScratchpadWorkspaceDialog from '../components/scratchpad/ScratchpadWorkspaceDialog'
import ScratchpadCreateWizard from '../components/scratchpad/ScratchpadCreateWizard'
import SelectAllToggle from '../components/SelectAllToggle'

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
  const [selected, setSelected] = useState({})

  const visibleItems = useMemo(function() {
    return getScratchpadListItems(workspaceFilterId, search)
  }, [workspaceFilterId, search, revision])

  const selectedIds = useMemo(function() {
    return Object.keys(selected).filter(function(id) { return selected[id] })
  }, [selected])

  const selectedCount = selectedIds.length

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

  function handleToggleSelect(itemId) {
    setSelected(function(prev) {
      const next = Object.assign({}, prev)
      if (next[itemId]) delete next[itemId]
      else next[itemId] = true
      return next
    })
  }

  function handleSelectAll() {
    const next = {}
    visibleItems.forEach(function(item) {
      next[item.id] = true
    })
    setSelected(next)
  }

  function handleSelectNone() {
    setSelected({})
  }

  function handleBulkDelete() {
    if (!selectedCount) return
    const label = selectedCount === 1 ? 'this scratchpad item' : selectedCount + ' scratchpad items'
    if (!window.confirm('Delete ' + label + '?')) return
    selectedIds.forEach(function(itemId) {
      deleteScratchpadItem(itemId)
    })
    setSelected({})
    toast.success('Deleted ' + selectedCount + ' item' + (selectedCount === 1 ? '' : 's'))
  }

  function handleBulkMove(workspaceId) {
    if (!selectedCount || !workspaceId) return
    let moved = 0
    selectedIds.forEach(function(itemId) {
      const result = moveScratchpadItem(itemId, workspaceId)
      if (result) moved += 1
    })
    setSelected({})
    if (moved > 0) {
      const ws = workspaces.find(function(w) { return w.id === workspaceId })
      toast.success('Moved ' + moved + ' item' + (moved === 1 ? '' : 's') + (ws ? ' to ' + ws.name : ''))
    }
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
        <div className="scratchpad-list-select-controls">
          <SelectAllToggle
            totalCount={visibleItems.length}
            selectedCount={selectedCount}
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            ariaLabel="Select all scratchpad items"
          />
        </div>
        <Form.Control
          type="search"
          placeholder="Search scratchpad…"
          value={search}
          aria-label="Search scratchpad"
          onChange={function(e) { setSearch(e.target.value) }}
        />
        {selectedCount > 0 ? (
          <Dropdown as={ButtonGroup} className="scratchpad-bulk-ops-dropdown">
            <Dropdown.Toggle variant="secondary" size="sm" id="scratchpad-bulk-ops-toggle">
              {selectedCount} selected
            </Dropdown.Toggle>
            <Dropdown.Menu align="end">
              <Dropdown.Header>Move to workspace</Dropdown.Header>
              {workspaces.map(function(ws) {
                return (
                  <Dropdown.Item
                    key={ws.id}
                    onClick={function() { handleBulkMove(ws.id) }}
                  >
                    {ws.name}
                  </Dropdown.Item>
                )
              })}
              <Dropdown.Divider />
              <Dropdown.Item className="text-danger" onClick={handleBulkDelete}>
                Delete…
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        ) : null}
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
        selected={selected}
        onToggleSelect={handleToggleSelect}
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
        driveApi={props.driveApi}
        requestGoogleScopes={props.requestGoogleScopes}
        onCreated={function(itemId) {
          setShowCreateWizard(false)
          handleCreated(itemId)
        }}
        onCreatedMany={function(itemIds) {
          setShowCreateWizard(false)
          const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : []
          if (ids.length === 1) {
            handleCreated(ids[0])
            return
          }
          if (ids.length > 1) {
            toast.success('Created ' + ids.length + ' scratchpad items')
          }
        }}
      />
    </div>
  )
}
