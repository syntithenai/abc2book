import { useEffect, useState } from 'react'
import { Button, ButtonGroup, Spinner } from 'react-bootstrap'
import { icons } from '../../Icons'
import { scratchpadPendingSyncSummary, subscribeScratchpad } from '../../scratchpadStore'
import { tokenHasDriveAccess, ensureDriveFileScope } from '../../googleDrivePickerClient'
import {
  getScratchpadSyncState,
  subscribeScratchpadSync,
} from '../../scratchpadSyncStatus'

export default function ScratchpadDriveSyncControl(props) {
  const scratchpadSync = props.scratchpadSync || {}
  const compact = !!props.compact
  const [revision, setRevision] = useState(0)

  useEffect(function() {
    return subscribeScratchpad(function() {
      setRevision(function(n) { return n + 1 })
    })
  }, [])

  useEffect(function() {
    return subscribeScratchpadSync(function() {
      setRevision(function(n) { return n + 1 })
    })
  }, [])

  const summary = scratchpadPendingSyncSummary()
  const syncState = getScratchpadSyncState()
  const syncing = syncState.status === 'syncing'
  const token = props.token
  const hasDrive = token && tokenHasDriveAccess(token)
  const showResultStatus = !summary.pending
    && !syncing
    && syncState.message
    && (syncState.status === 'success' || syncState.status === 'error')
  const statusVariant = syncState.status === 'error' ? 'outline-danger' : 'outline-success'
  const pendingLabel = summary.pending
    ? (summary.pendingItems + summary.tombstones > 0
      ? String(summary.pendingItems + summary.tombstones) + ' pending'
      : 'pending')
    : ''

  async function handleSync() {
    if (!token || !token.access_token) {
      if (props.login) props.login()
      return
    }
    let activeToken = token
    if (!tokenHasDriveAccess(token) && props.requestGoogleScopes) {
      const updated = await ensureDriveFileScope(props.requestGoogleScopes, token)
      if (!updated || !tokenHasDriveAccess(updated)) return
      activeToken = updated
    }
    if (scratchpadSync.syncNow) {
      await scratchpadSync.syncNow()
    }
  }

  function renderMainLabel() {
    if (syncing) {
      return (
        <span>
          <Spinner animation="border" size="sm" className="me-1" />
          Syncing
        </span>
      )
    }
    if (showResultStatus) {
      return syncState.message
    }
    return 'Sync Drive'
  }

  const buttonVariant = showResultStatus ? statusVariant : 'outline-secondary'
  const reloadIcon = icons.repeat || icons.arrowgoback || '↻'

  return (
    <ButtonGroup
      size="sm"
      className={compact
        ? 'scratchpad-drive-sync-control scratchpad-drive-sync-control--compact'
        : 'scratchpad-drive-sync-control'}
    >
      {showResultStatus ? (
        <Button
          variant={buttonVariant}
          className="scratchpad-drive-sync-reload-btn"
          title="Sync again"
          onClick={handleSync}
        >
          {reloadIcon}
        </Button>
      ) : null}
      <Button
        variant={buttonVariant}
        className={'scratchpad-drive-sync-btn' + (showResultStatus ? ' scratchpad-drive-sync-status-btn' : '')}
        disabled={syncing}
        title={showResultStatus
          ? syncState.message
          : (hasDrive ? 'Sync scratchpad with Google Drive' : 'Sign in with Google Drive access to sync')}
        onClick={showResultStatus ? undefined : handleSync}
      >
        {renderMainLabel()}
        {summary.pending && !syncing && !showResultStatus ? (
          <span className="scratchpad-drive-sync-pending badge bg-warning text-dark ms-1">{pendingLabel}</span>
        ) : null}
      </Button>
    </ButtonGroup>
  )
}
