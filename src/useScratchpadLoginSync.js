/**
 * App-level Scratchpad Drive sync after login.
 */
import { useEffect, useRef } from 'react'
import useGoogleDocument from './useGoogleDocument'
import { syncScratchpadWithDrive } from './scratchpadCloudSync'
import { listAllScratchpadItems } from './scratchpadStore'

let inFlight = null

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
      if (!opts.force && pending.length === 0 && items.length === 0) {
        return { ok: true, skipped: true, items: 0 }
      }
      return await syncScratchpadWithDrive(driveApi, opts)
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export default function useScratchpadLoginSync(token, logout) {
  const driveApi = useGoogleDocument(token, logout || function() {})
  const ranFor = useRef(null)

  useEffect(function() {
    const key = token && token.access_token ? String(token.access_token).slice(0, 24) : null
    if (!key) {
      ranFor.current = null
      return
    }
    if (ranFor.current === key) return
    ranFor.current = key
    syncScratchpadAfterLogin(driveApi).catch(function() {})
  }, [token, driveApi])

  return {
    driveApi: driveApi,
    syncNow: function() {
      return syncScratchpadAfterLogin(driveApi, { force: true })
    },
  }
}
