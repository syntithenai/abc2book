/**
 * App-level Scratchpad Drive sync after login.
 */
import { useEffect, useRef } from 'react'
import useGoogleDocument from './useGoogleDocument'
import { syncScratchpadWithDrive } from './scratchpadCloudSync'
import {
  listAllScratchpadItems,
  subscribeScratchpad,
  scratchpadHasPendingSync,
} from './scratchpadStore'
import { tokenHasDriveAccess } from './googleDrivePickerClient'
import {
  registerScratchpadDriveApi,
  flushScratchpadDriveDeletes,
  listPendingScratchpadDriveDeletes,
} from './scratchpadDriveDeletes'
import {
  getScratchpadSyncState,
  patchScratchpadSyncState,
} from './scratchpadSyncStatus'

const AUTO_SYNC_DEBOUNCE_MS = 3000

let inFlight = null

function formatSyncSuccessMessage(result) {
  const parts = []
  if (result && result.items != null) parts.push(result.items + ' item(s)')
  if (result && result.uploaded) parts.push('uploaded ' + result.uploaded)
  if (result && result.downloaded) parts.push('downloaded ' + result.downloaded)
  if (!parts.length) return 'Scratchpad synced with Google Drive.'
  return 'Synced ' + parts.join('; ') + '.'
}

export async function syncScratchpadAfterLogin(driveApi, options) {
  const opts = options || {}
  if (!driveApi) return { ok: false, error: 'No Drive API' }
  if (inFlight) return inFlight

  inFlight = (async function() {
    try {
      const items = listAllScratchpadItems()
      const pending = items.filter(function(item) {
        return item.sync && item.sync.uploadPending
      })
      const pendingDeletes = await listPendingScratchpadDriveDeletes()
      if (
        !opts.force &&
        pending.length === 0 &&
        items.length === 0 &&
        !scratchpadHasPendingSync() &&
        pendingDeletes.length === 0
      ) {
        await flushScratchpadDriveDeletes(driveApi, opts)
        return { ok: true, skipped: true, items: 0 }
      }
      patchScratchpadSyncState({ status: 'syncing', message: 'Syncing scratchpad with Google Drive…' })
      const result = await syncScratchpadWithDrive(driveApi, opts)
      if (!result.ok) {
        patchScratchpadSyncState({
          status: 'error',
          message: result.error || 'Scratchpad sync failed',
          lastResult: result,
        })
        return result
      }
      patchScratchpadSyncState({
        status: 'success',
        message: formatSyncSuccessMessage(result),
        lastResult: result,
      })
      return result
    } catch (err) {
      const message = (err && err.message) ? err.message : String(err)
      patchScratchpadSyncState({
        status: 'error',
        message: message,
        lastResult: { ok: false, error: message },
      })
      return { ok: false, error: message }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export default function useScratchpadLoginSync(token, logout) {
  const driveApi = useGoogleDocument(token, logout || function() {})
  const ranFor = useRef(null)
  const debounceTimer = useRef(null)

  useEffect(function() {
    registerScratchpadDriveApi(driveApi)
    return function() {
      registerScratchpadDriveApi(null)
    }
  }, [driveApi])

  useEffect(function() {
    if (!token || !tokenHasDriveAccess(token)) return undefined
    return subscribeScratchpad(function() {
      flushScratchpadDriveDeletes(driveApi, { token: token }).catch(function() {})
      if (!scratchpadHasPendingSync()) return
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(function() {
        syncScratchpadAfterLogin(driveApi, { token: token }).catch(function() {})
      }, AUTO_SYNC_DEBOUNCE_MS)
    })
  }, [driveApi, token])

  useEffect(function() {
    return function() {
      clearTimeout(debounceTimer.current)
    }
  }, [])

  useEffect(function() {
    const key = token && token.access_token ? String(token.access_token).slice(0, 24) : null
    if (!key || !tokenHasDriveAccess(token)) {
      ranFor.current = null
      return
    }
    if (ranFor.current === key) return
    ranFor.current = key
    syncScratchpadAfterLogin(driveApi, { token: token }).catch(function() {})
  }, [token, driveApi])

  return {
    driveApi: driveApi,
    syncState: getScratchpadSyncState(),
    syncNow: function() {
      return syncScratchpadAfterLogin(driveApi, { force: true, token: token })
    },
  }
}
