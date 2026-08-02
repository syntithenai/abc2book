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
import {
  getAssociateModesForItem,
  isScratchpadAnalyseMode,
  isScratchpadTranscribeMode,
} from '../../scratchpadAssociate'
import {
  getScratchpadAnalyseAccess,
  getScratchpadAnalyseUseLabel,
} from '../../scratchpadAnalyseAccess'
import {
  getScratchpadTranscribeAccess,
  getScratchpadTranscribeUseLabel,
} from '../../scratchpadTranscribeAccess'
import useMediaResolverHealth from '../../useMediaResolverHealth'
import { useCreditAffordance } from '../../useCreditAffordance'
import {
  describeProviderSource,
  getActiveProvider,
  loadProviderSettings,
} from '../../providerSettings'
import { scratchpadItemPath } from '../../scratchpadExportToast'
import { SCRATCHPAD_DROPDOWN_POPPER } from '../../scratchpadDropdownPopper'
import ScratchpadAssociateModal from './ScratchpadAssociateModal'
import ScratchpadAnalyseModal from './ScratchpadAnalyseModal'
import ScratchpadTranscribeModal from './ScratchpadTranscribeModal'
import ScratchpadCopyModal from './ScratchpadCopyModal'
import ScratchpadDriveSyncControl from './ScratchpadDriveSyncControl'

export default function ScratchpadEditorChrome(props) {
  const item = props.item
  const tunebook = props.tunebook
  const navigate = useNavigate()
  const icons = tunebook && tunebook.icons ? tunebook.icons : {}
  const [title, setTitle] = useState(item.title || '')
  const [workspaces, setWorkspaces] = useState([])
  const [showAssociate, setShowAssociate] = useState(false)
  const [showAnalyse, setShowAnalyse] = useState(false)
  const [showTranscribe, setShowTranscribe] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [associateMode, setAssociateMode] = useState('')
  const titleTimeout = useRef(null)
  const { available: resolverAvailable, checked: resolverChecked, status: resolverStatus, features } = useMediaResolverHealth()
  const providerSettings = loadProviderSettings()
  const resolverBase = (resolverStatus && resolverStatus.activeBase) || ''
  const healthProviders = resolverStatus && resolverStatus.providers
  const ocrActive = getActiveProvider(providerSettings, 'ocr')
  const ocrSource = describeProviderSource(healthProviders, 'ocr', ocrActive, resolverBase)
  const ocrOperation = ocrSource.kind === 'user' ? 'sheet_ocr_user' : 'sheet_ocr_host'
  const whisperActive = getActiveProvider(providerSettings, 'whisper')
  const whisperSource = describeProviderSource(healthProviders, 'whisper', whisperActive, resolverBase)
  const whisperAffordParams = whisperSource.kind === 'user' ? { providerSource: 'user' } : undefined
  const imageAffordance = useCreditAffordance(
    props.token,
    item && item.type === 'image' ? ocrOperation : null
  )
  const audioAffordance = useCreditAffordance(
    props.token,
    item && item.type === 'audio' ? 'whisper_transcribe' : null,
    whisperAffordParams
  )
  const analyseAffordance = item && item.type === 'image' ? imageAffordance : audioAffordance

  const analyseAccess = useMemo(function() {
    return getScratchpadAnalyseAccess({
      resolverChecked: resolverChecked,
      resolverAvailable: resolverAvailable,
      resolverStatus: resolverStatus,
      features: features,
      accessToken: props.token,
      affordance: analyseAffordance.checked ? analyseAffordance : null,
    }, item && item.type)
  }, [
    resolverChecked,
    resolverAvailable,
    resolverStatus,
    features,
    props.token,
    item && item.type,
    analyseAffordance,
  ])

  const transcribeAffordance = item && item.type === 'audio' ? audioAffordance : null
  const transcribeAccess = useMemo(function() {
    if (!item || item.type !== 'audio') {
      return { showOption: false }
    }
    return getScratchpadTranscribeAccess({
      resolverChecked: resolverChecked,
      resolverAvailable: resolverAvailable,
      resolverStatus: resolverStatus,
      features: features,
      accessToken: props.token,
      affordance: transcribeAffordance && transcribeAffordance.checked ? transcribeAffordance : null,
    })
  }, [
    resolverChecked,
    resolverAvailable,
    resolverStatus,
    features,
    props.token,
    item && item.type,
    transcribeAffordance,
  ])

  const associateModes = useMemo(function() {
    const modes = getAssociateModesForItem(item).slice()
    if (transcribeAccess.showOption) {
      modes.push({
        id: 'transcribe',
        label: getScratchpadTranscribeUseLabel(transcribeAccess),
      })
    }
    if (analyseAccess.showOption) {
      modes.push({
        id: 'analyse',
        label: getScratchpadAnalyseUseLabel(analyseAccess),
      })
    }
    return modes
  }, [item, analyseAccess, transcribeAccess])

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
    if (isScratchpadTranscribeMode(modeId)) {
      setShowTranscribe(true)
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
      <div className="scratchpad-editor-chrome-leading">
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
      </div>
      {props.children ? (
        <div className="scratchpad-editor-chrome-tools" ref={props.toolsRef}>
          {props.children}
        </div>
      ) : null}
      <div className="scratchpad-editor-chrome-main">
        {props.beforeTitle ? (
          <div className="scratchpad-editor-chrome-before-title">
            {props.beforeTitle}
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
          <Dropdown.Menu popperConfig={SCRATCHPAD_DROPDOWN_POPPER}>
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
        <ScratchpadDriveSyncControl
          scratchpadSync={props.scratchpadSync}
          token={props.token}
          login={props.login}
          requestGoogleScopes={props.requestGoogleScopes}
          compact={true}
        />
        <Button variant="danger" size="sm" onClick={handleDelete} title="Delete">
          {icons.deletebin || 'Delete'}
        </Button>
        {associateModes.length || (props.extraUseActions && props.extraUseActions.length) ? (
          <Dropdown className="scratchpad-associate-dropdown">
            <Dropdown.Toggle variant="outline-primary" size="sm">
              Use
            </Dropdown.Toggle>
            <Dropdown.Menu popperConfig={SCRATCHPAD_DROPDOWN_POPPER}>
              {associateModes.map(function(mode) {
                return (
                  <Dropdown.Item key={mode.id} onClick={function() { openUseMode(mode.id) }}>
                    {mode.label}
                  </Dropdown.Item>
                )
              })}
              {(props.extraUseActions || []).map(function(action) {
                return (
                  <Dropdown.Item key={action.id} onClick={action.onClick}>
                    {action.label}
                  </Dropdown.Item>
                )
              })}
            </Dropdown.Menu>
          </Dropdown>
        ) : null}
      </div>

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

      <ScratchpadTranscribeModal
        show={showTranscribe}
        item={item}
        access={transcribeAccess}
        token={props.token}
        login={props.login}
        onHide={function() { setShowTranscribe(false) }}
        onCreated={function() {
          setShowTranscribe(false)
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
