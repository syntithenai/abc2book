import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  listWorkspaces,
  getActiveWorkspaceId,
  getWorkspace,
  setActiveWorkspaceId,
  createWorkspace,
} from '../../scratchpadStore'
import {
  getScratchpadAnalyseChoices,
  getScratchpadAnalyseBackgroundStartMessage,
} from '../../scratchpadAnalyseAccess'
import { runScratchpadAnalyse } from '../../scratchpadAnalyse'
import useAbcjsParser from '../../useAbcjsParser'
import ScratchpadWorkspaceDialog from './ScratchpadWorkspaceDialog'
import { resolveResolverAccessToken } from '../../resolverAccessToken'

export default function ScratchpadAnalyseModal(props) {
  const item = props.item
  const access = props.access
  const tunebook = props.tunebook
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [analysisMode, setAnalysisMode] = useState('')
  const [error, setError] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [pendingRunAfterLogin, setPendingRunAfterLogin] = useState(false)

  const choices = useMemo(function() {
    return getScratchpadAnalyseChoices(access)
  }, [access])

  const resolvedToken = resolveResolverAccessToken(props.token)

  useEffect(function() {
    if (!props.show) return undefined
    const list = listWorkspaces()
    setWorkspaces(list)
    const activeId = getActiveWorkspaceId()
    const defaultWorkspace = activeId && getWorkspace(activeId) ? activeId : (item && item.workspaceId) || ''
    setWorkspaceId(defaultWorkspace)
    setError('')
    setPendingRunAfterLogin(false)
    if (choices.length === 1) {
      setAnalysisMode(choices[0].id)
    } else {
      setAnalysisMode('')
    }
    return undefined
  }, [props.show, item && item.id, choices])

  useEffect(function() {
    if (!pendingRunAfterLogin || !resolvedToken || access.needsLogin) return undefined
    if (!workspaceId || !analysisMode) return undefined
    setPendingRunAfterLogin(false)
    startBackgroundAnalysis()
    return undefined
  }, [pendingRunAfterLogin, resolvedToken, access && access.needsLogin, workspaceId, analysisMode])

  function handleHide() {
    if (props.onHide) props.onHide()
  }

  function handleCreateWorkspace(name) {
    const ws = createWorkspace(name)
    setWorkspaces(listWorkspaces())
    setWorkspaceId(ws.id)
    setShowCreateDialog(false)
  }

  function startBackgroundAnalysis() {
    if (!item || !workspaceId || !analysisMode) return
    if (access && access.needsLogin) return

    setActiveWorkspaceId(workspaceId)
    if (props.onHide) props.onHide()

    toast.info(
      getScratchpadAnalyseBackgroundStartMessage(item.type, analysisMode),
      { autoClose: 5000 }
    )

    runScratchpadAnalyse(item, {
      workspaceId: workspaceId,
      mode: analysisMode,
      token: props.token,
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      onOpenItem: props.onOpenItem,
    }).then(function(created) {
      if (created && props.onCreated) props.onCreated(created.id)
    }).catch(function() {
      // Errors are surfaced via toast in runScratchpadAnalyse.
    })
  }

  function handleRunClick() {
    if (access && access.needsLogin) {
      if (typeof props.login !== 'function') {
        setError('Log in to use the media resolver')
        return
      }
      setPendingRunAfterLogin(true)
      props.login().catch(function() {
        setPendingRunAfterLogin(false)
      })
      return
    }
    startBackgroundAnalysis()
  }

  const canRun = !!workspaceId
    && !!analysisMode
    && (access && access.canUse)

  const modalTitle = access && access.itemType === 'image'
    ? 'Optical recognition'
    : 'Analyse scratchpad item'
  const runLabel = access && access.needsLogin
    ? (access.itemType === 'image' ? 'Log in for optical recognition' : 'Log in and analyse')
    : (access && access.itemType === 'image' ? 'Recognise' : 'Analyse')

  return (
    <>
      <Modal
        show={!!props.show}
        onHide={handleHide}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>{modalTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {access && access.needsLogin && access.loginWarning ? (
            <Alert variant="warning" className="small">
              {access.loginWarning.message}
            </Alert>
          ) : null}
          {access && access.unavailableHelperText ? (
            <p className="text-muted small">{access.unavailableHelperText}</p>
          ) : null}
          <p className="text-muted small">
            Choose a workspace and analysis type. Analysis runs in the background and you will get a notification when the new scratchpad record is ready.
          </p>
          {workspaces.length === 0 ? (
            <p className="mb-3">No workspaces yet. Create one to continue.</p>
          ) : (
            <Form.Group className="mb-3">
              <Form.Label>Workspace</Form.Label>
              <Form.Select
                value={workspaceId}
                onChange={function(e) { setWorkspaceId(e.target.value) }}
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
          {choices.length > 0 ? (
            <Form.Group className="mb-0">
              <Form.Label>Analysis type</Form.Label>
              {choices.map(function(choice) {
                return (
                  <Form.Check
                    key={choice.id}
                    type="radio"
                    id={'scratchpad-analyse-' + choice.id}
                    name="scratchpad-analyse-mode"
                    label={choice.helperText ? (choice.label + ' — ' + choice.helperText) : choice.label}
                    value={choice.id}
                    checked={analysisMode === choice.id}
                    onChange={function() { setAnalysisMode(choice.id) }}
                  />
                )
              })}
            </Form.Group>
          ) : null}
          {error ? <Alert variant="danger" className="mt-3 mb-0 small">{error}</Alert> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleHide}>Cancel</Button>
          <Button
            variant="outline-secondary"
            onClick={function() { setShowCreateDialog(true) }}
          >
            New workspace…
          </Button>
          <Button
            variant="primary"
            disabled={!canRun && !(access && access.needsLogin && workspaceId && analysisMode)}
            onClick={handleRunClick}
          >
            {runLabel}
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
