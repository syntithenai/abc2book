import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../pageTitle'
import {
  ensureDefaultWorkspace,
  subscribeScratchpad,
  getActiveWorkspaceId,
} from '../scratchpadStore'
import ScratchpadToolbar from '../components/scratchpad/ScratchpadToolbar'
import ScratchpadItemGrid from '../components/scratchpad/ScratchpadItemGrid'

export default function ScratchpadPage(props) {
  useDocumentTitle('Scratchpad')
  const navigate = useNavigate()
  const [revision, setRevision] = useState(0)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(getActiveWorkspaceId())

  useEffect(function() {
    ensureDefaultWorkspace()
    setActiveWorkspaceId(getActiveWorkspaceId())
    return subscribeScratchpad(function() {
      setRevision(function(n) { return n + 1 })
      setActiveWorkspaceId(getActiveWorkspaceId())
    })
  }, [])

  function handleItemClick(itemId) {
    navigate('/scratchpad/' + encodeURIComponent(itemId))
  }

  function handleCreated(itemId) {
    navigate('/scratchpad/' + encodeURIComponent(itemId))
  }

  return (
    <div className="scratchpad-page">
      <ScratchpadToolbar
        tunebook={props.tunebook}
        token={props.token}
        activeWorkspaceId={activeWorkspaceId}
        revision={revision}
        onCreated={handleCreated}
      />
      <ScratchpadItemGrid
        tunebook={props.tunebook}
        workspaceId={activeWorkspaceId}
        revision={revision}
        onItemClick={handleItemClick}
      />
    </div>
  )
}
