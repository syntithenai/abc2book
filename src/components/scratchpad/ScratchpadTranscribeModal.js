import { useEffect, useState } from 'react'
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
  getScratchpadTranscribeUseLabel,
  getScratchpadTranscribeBackgroundStartMessage,
} from '../../scratchpadTranscribeAccess'
import { openCreditSettings } from '../../resolverCreditAccess'
import { enqueueScratchpadTranscribeJob } from '../../scratchpadBackgroundJobs'
import ScratchpadWorkspaceDialog from './ScratchpadWorkspaceDialog'
import { resolveResolverAccessToken } from '../../resolverAccessToken'

export default function ScratchpadTranscribeModal(props) {
  const item = props.item
  const access = props.access
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [error, setError] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [pendingRunAfterLogin, setPendingRunAfterLogin] = useState(false)

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
    return undefined
  }, [props.show, item && item.id])

  useEffect(function() {
    if (!pendingRunAfterLogin || !resolvedToken) return undefined
    if (!access || access.needsLogin || access.needsCredit) return undefined
    if (!workspaceId) return undefined
    setPendingRunAfterLogin(false)
    startBackgroundTranscribe()
    return undefined
  }, [pendingRunAfterLogin, resolvedToken, access && access.needsLogin, access && access.needsCredit, workspaceId])

  function handleHide() {
    if (props.onHide) props.onHide()
  }

  function handleCreateWorkspace(name) {
    const ws = createWorkspace(name)
    setWorkspaces(listWorkspaces())
    setWorkspaceId(ws.id)
    setShowCreateDialog(false)
  }

  function startBackgroundTranscribe() {
    if (!item || !workspaceId) return
    if (access && (access.needsLogin || access.needsCredit)) return

    setActiveWorkspaceId(workspaceId)
    if (props.onHide) props.onHide()

    toast.info(
      getScratchpadTranscribeBackgroundStartMessage(),
      { autoClose: 5000 }
    )

    enqueueScratchpadTranscribeJob({
      item: item,
      workspaceId: workspaceId,
      token: props.token,
      onOpenItem: props.onOpenItem,
    })
    if (props.onCreated) props.onCreated()
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
    if (access && access.needsCredit) {
      openCreditSettings()
      return
    }
    startBackgroundTranscribe()
  }

  const canRun = !!workspaceId && (access && access.canUse)
  const runLabel = access ? getScratchpadTranscribeUseLabel(access) : 'Transcribe'

  return (
    <>
      <Modal
        show={!!props.show}
        onHide={handleHide}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Transcribe audio</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {access && (access.needsLogin || access.needsCredit) && access.loginWarning ? (
            <Alert variant="warning" className="small">
              {access.loginWarning.message}
            </Alert>
          ) : null}
          <p className="text-muted small">
            Choose a workspace for the new text record. Transcription runs in the background using Whisper and you will get a notification when it is ready.
          </p>
          {workspaces.length === 0 ? (
            <p className="mb-3">No workspaces yet. Create one to continue.</p>
          ) : (
            <Form.Group className="mb-0">
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
            disabled={!canRun && !(access && (access.needsLogin || access.needsCredit) && workspaceId)}
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
