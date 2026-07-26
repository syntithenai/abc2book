import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import {
  updateScratchpadItem,
  moveScratchpadItem,
  copyScratchpadItem,
  deleteScratchpadItem,
  listWorkspaces,
} from '../../scratchpadStore'
import { getAssociateModesForItem, isScratchpadAnalyseMode } from '../../scratchpadAssociate'
import {
  getScratchpadAnalyseAccess,
  getScratchpadAnalyseUseLabel,
} from '../../scratchpadAnalyseAccess'
import useMediaResolverHealth from '../../useMediaResolverHealth'
import { scratchpadItemPath } from '../../scratchpadExportToast'
import ScratchpadAssociateModal from './ScratchpadAssociateModal'
import ScratchpadAnalyseModal from './ScratchpadAnalyseModal'
import ScratchpadCopyModal from './ScratchpadCopyModal'

export default function ScratchpadEditorChrome(props) {
  const item = props.item
  const tunebook = props.tunebook
  const navigate = useNavigate()
  const icons = tunebook && tunebook.icons ? tunebook.icons : {}
  const [title, setTitle] = useState(item.title || '')
  const [workspaces, setWorkspaces] = useState([])
  const [showAssociate, setShowAssociate] = useState(false)
  const [showAnalyse, setShowAnalyse] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [associateMode, setAssociateMode] = useState('')
  const titleTimeout = useRef(null)
  const { available: resolverAvailable, checked: resolverChecked, status: resolverStatus, features } = useMediaResolverHealth()

  const analyseAccess = useMemo(function() {
    return getScratchpadAnalyseAccess({
      resolverChecked: resolverChecked,
      resolverAvailable: resolverAvailable,
      resolverStatus: resolverStatus,
      features: features,
      accessToken: props.token,
    }, item && item.type)
  }, [resolverChecked, resolverAvailable, resolverStatus, features, props.token, item && item.type])

  const associateModes = useMemo(function() {
    const modes = getAssociateModesForItem(item).slice()
    if (analyseAccess.showOption) {
      modes.push({
        id: 'analyse',
        label: getScratchpadAnalyseUseLabel(analyseAccess),
      })
    }
    return modes
  }, [item, analyseAccess])

  useEffect(function() {
    setTitle(item.title || '')
    setWorkspaces(listWorkspaces())
  }, [item.id, item.title, item.workspaceId])

  function saveTitle(nextTitle) {
    updateScratchpadItem(item.id, { title: nextTitle })
    if (props.onChange) props.onChange()
  }

  function handleTitleChange(e) {
    const next = e.target.value
    setTitle(next)
    clearTimeout(titleTimeout.current)
    titleTimeout.current = setTimeout(function() {
      saveTitle(next)
    }, 500)
  }

  function handleMove(workspaceId) {
    moveScratchpadItem(item.id, workspaceId)
    if (props.onChange) props.onChange()
  }

  function openCopyModal() {
    setShowCopyModal(true)
  }

  async function confirmCopy(nextTitle) {
    await copyScratchpadItem(item.id, undefined, { title: nextTitle })
    setShowCopyModal(false)
    if (props.onChange) props.onChange()
  }

  function handleDelete() {
    if (!window.confirm('Delete this scratchpad item?')) return
    deleteScratchpadItem(item.id)
    if (props.onDeleted) props.onDeleted()
  }

  function openUseMode(modeId) {
    if (isScratchpadAnalyseMode(modeId)) {
      setShowAnalyse(true)
      return
    }
    setAssociateMode(modeId)
    setShowAssociate(true)
  }

  function openCreatedItem(itemId) {
    navigate(scratchpadItemPath(itemId))
  }

  const currentWs = workspaces.find(function(w) { return w.id === item.workspaceId })

  return (
    <div className="scratchpad-editor-chrome">
      {props.onBack ? (
        <Button
          variant="outline-secondary"
          size="sm"
          className="scratchpad-editor-back-btn"
          title="Back to scratchpad list"
          onClick={props.onBack}
        >
          {icons.scratchpadlist || icons.pencil || icons.menu || '☰'}
        </Button>
      ) : null}
      {props.onUndo || props.onRedo ? (
        <ButtonGroup size="sm" className="scratchpad-undo-redo" aria-label="Undo and redo">
          <Button
            variant="outline-secondary"
            title={props.undoTitle || 'Undo'}
            disabled={!props.canUndo}
            onClick={props.onUndo}
          >
            {icons.arrowgoback || 'Undo'}
          </Button>
          <Button
            variant="outline-secondary"
            title={props.redoTitle || 'Redo'}
            disabled={!props.canRedo}
            onClick={props.onRedo}
          >
            {icons.arrowgoforward || 'Redo'}
          </Button>
        </ButtonGroup>
      ) : null}
      {props.children ? (
        <div className="scratchpad-editor-chrome-tools">
          {props.children}
        </div>
      ) : null}
      <Form.Group className="scratchpad-item-title-group mb-0">
        <Form.Label className="scratchpad-item-title-label mb-0">Title</Form.Label>
        <Form.Control
          className="scratchpad-item-title-input"
          size="sm"
          value={title}
          onChange={handleTitleChange}
          placeholder="Title"
        />
      </Form.Group>
      <Dropdown className="scratchpad-item-workspace-select">
        <Dropdown.Toggle variant="outline-secondary" size="sm">
          {currentWs ? currentWs.name : 'Workspace'}
        </Dropdown.Toggle>
        <Dropdown.Menu popperConfig={{ strategy: 'fixed' }}>
          {workspaces.map(function(ws) {
            return (
              <Dropdown.Item
                key={ws.id}
                active={ws.id === item.workspaceId}
                onClick={function() { handleMove(ws.id) }}
              >
                {ws.name}
              </Dropdown.Item>
            )
          })}
        </Dropdown.Menu>
      </Dropdown>
      <Button variant="outline-secondary" size="sm" onClick={openCopyModal} title="Duplicate">
        {icons.filecopyline || 'Copy'}
      </Button>
      <Button variant="danger" size="sm" onClick={handleDelete} title="Delete">
        {icons.deletebin || 'Delete'}
      </Button>
      {associateModes.length ? (
        <Dropdown className="scratchpad-associate-dropdown">
          <Dropdown.Toggle variant="outline-primary" size="sm">
            Use
          </Dropdown.Toggle>
          <Dropdown.Menu popperConfig={{ strategy: 'fixed' }}>
            {associateModes.map(function(mode) {
              return (
                <Dropdown.Item key={mode.id} onClick={function() { openUseMode(mode.id) }}>
                  {mode.label}
                </Dropdown.Item>
              )
            })}
          </Dropdown.Menu>
        </Dropdown>
      ) : null}

      <ScratchpadAssociateModal
        show={showAssociate}
        associateMode={associateMode}
        onHide={function() {
          setShowAssociate(false)
          setAssociateMode('')
        }}
        item={item}
        tunebook={props.tunebook}
        tunes={props.tunes}
        token={props.token}
        onAssociated={function() {
          setShowAssociate(false)
          setAssociateMode('')
          if (props.onChange) props.onChange()
        }}
      />

      <ScratchpadAnalyseModal
        show={showAnalyse}
        item={item}
        access={analyseAccess}
        tunebook={props.tunebook}
        token={props.token}
        login={props.login}
        onHide={function() { setShowAnalyse(false) }}
        onCreated={function() {
          setShowAnalyse(false)
          if (props.onChange) props.onChange()
        }}
        onOpenItem={openCreatedItem}
      />

      <ScratchpadCopyModal
        show={showCopyModal}
        defaultTitle={(item.title || 'Untitled') + ' copy'}
        onHide={function() { setShowCopyModal(false) }}
        onConfirm={confirmCopy}
      />
    </div>
  )
}
