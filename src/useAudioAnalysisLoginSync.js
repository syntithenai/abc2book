/**
 * App-level Audio Analysis Drive sync after login.
 * Safe to call repeatedly; overlaps are ignored while a sync is in flight.
 */
import { useEffect, useRef } from 'react'
import useGoogleDocument from './useGoogleDocument'
import { syncAudioAnalysisWithDrive } from './audioAnalysisCloudSync'
import { listUnsyncedSets, listDeletedSets, listDeletedGroups, listGroups } from './soundpostSetStore'
import { tokenHasDriveAccess } from './googleDrivePickerClient'

let inFlight = null

export async function syncAudioAnalysisAfterLogin(driveApi, options) {
  const opts = options || {}
  if (!driveApi) return { ok: false, error: 'No Drive API' }
  if (inFlight) return inFlight

  inFlight = (async function() {
    try {
      const unsynced = await listUnsyncedSets()
      const groups = await listGroups()
      const unsyncedGroups = groups.filter(function(g) {
        return g.needsSync === true
      })
      const deletedSets = await listDeletedSets()
      const deletedGroups = await listDeletedGroups()
      if (
        !opts.force &&
        unsynced.length === 0 &&
        unsyncedGroups.length === 0 &&
        deletedSets.length === 0 &&
        deletedGroups.length === 0
      ) {
        return { ok: true, skipped: true, sets: 0 }
      }
      return await syncAudioAnalysisWithDrive(driveApi, opts)
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * When Google token appears, sync unsynced sets and offline deletes.
 */
export default function useAudioAnalysisLoginSync(token, logout) {
  const driveApi = useGoogleDocument(token, logout || function() {})
  const ranFor = useRef(null)

  useEffect(function() {
    const key = token && token.access_token ? String(token.access_token).slice(0, 24) : null
    if (!key || !tokenHasDriveAccess(token)) {
      ranFor.current = null
      return
    }
    if (ranFor.current === key) return
    ranFor.current = key
    syncAudioAnalysisAfterLogin(driveApi).catch(function() {})
  }, [token, driveApi])

  return {
    driveApi: driveApi,
    syncNow: function() {
      return syncAudioAnalysisAfterLogin(driveApi, { force: true })
    }
  }
}
