import { useEffect, useState } from 'react'
import { Alert, Button, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
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
  const [dismissed, setDismissed] = useState(false)

  useEffect(function() {
    return subscribeScratchpad(function() {
      setRevision(function(n) { return n + 1 })
      setDismissed(false)
    })
  }, [])

  useEffect(function() {
    return subscribeScratchpadSync(function() {
      setRevision(function(n) { return n + 1 })
      setDismissed(false)
    })
  }, [])

  const summary = scratchpadPendingSyncSummary()
  const syncState = getScratchpadSyncState()
  const syncing = syncState.status === 'syncing'
  const token = props.token
  const hasDrive = token && tokenHasDriveAccess(token)
  const showStatus = !dismissed && syncState.message && syncState.status !== 'idle'
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
    setDismissed(false)
    let activeToken = token
    if (!tokenHasDriveAccess(token) && props.requestGoogleScopes) {
      const updated = await ensureDriveFileScope(props.requestGoogleScopes, token)
      if (!updated || !tokenHasDriveAccess(updated)) return
      activeToken = updated
    }
    if (scratchpadSync.syncNow) {
      const result = await scratchpadSync.syncNow()
      if (compact && result) {
        if (result.ok && !result.skipped) {
          toast.success(getScratchpadSyncState().message || 'Scratchpad synced with Google Drive.')
        } else if (!result.ok) {
          toast.error(result.error || getScratchpadSyncState().message || 'Scratchpad sync failed')
        }
      }
    }
  }

  return (
    <div className={compact ? 'scratchpad-drive-sync-control scratchpad-drive-sync-control--compact' : 'scratchpad-drive-sync-control'}>
      <Button
        size="sm"
        variant="outline-secondary"
        className="scratchpad-drive-sync-btn"
        disabled={syncing}
        title={hasDrive ? 'Sync scratchpad with Google Drive' : 'Sign in with Google Drive access to sync'}
        onClick={handleSync}
      >
        {syncing ? (
          <span><Spinner animation="border" size="sm" className="me-1" /> Syncing</span>
        ) : 'Sync Drive'}
        {summary.pending && !syncing ? (
          <span className="scratchpad-drive-sync-pending badge bg-warning text-dark ms-1">{pendingLabel}</span>
        ) : null}
      </Button>
      {showStatus && !compact ? (
        <Alert
          variant={syncState.status === 'error' ? 'danger' : syncState.status === 'success' ? 'success' : 'info'}
          className="scratchpad-drive-sync-alert py-2 mt-2"
          dismissible
          onClose={function() { setDismissed(true) }}
        >
          {syncState.message}
        </Alert>
      ) : null}
    </div>
  )
}
