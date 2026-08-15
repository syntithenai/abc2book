/**
 * App-level CachedMedia Drive backup after login and when the setting is on.
 */
import { useEffect, useRef } from 'react'
import useGoogleDocument from './useGoogleDocument'
import { tokenHasDriveAccess } from './googleDrivePickerClient'
import {
  registerCachedMediaDriveBackupContext,
  syncOutstandingCachedMediaBackup,
} from './mediaCacheDriveBackup'
import { isMediaCacheDriveBackupEnabled } from './mediaCacheDriveBackupSettings'
import { flushCachedMediaDriveDeletes } from './mediaCacheDriveDeletes'

export default function useMediaCacheDriveBackupSync(token, logout) {
  const driveApi = useGoogleDocument(token, logout || function() {})
  const ranFor = useRef(null)

  useEffect(function() {
    registerCachedMediaDriveBackupContext({ driveApi: driveApi, token: token })
    return function() {
      registerCachedMediaDriveBackupContext({ driveApi: null, token: null })
    }
  }, [driveApi, token])

  useEffect(function() {
    if (!token || !tokenHasDriveAccess(token)) return undefined
    function onOnline() {
      flushCachedMediaDriveDeletes(driveApi, { token: token }).catch(function() {})
      if (isMediaCacheDriveBackupEnabled()) {
        syncOutstandingCachedMediaBackup({ driveApi: driveApi, token: token }).catch(function() {})
      }
    }
    window.addEventListener('online', onOnline)
    return function() {
      window.removeEventListener('online', onOnline)
    }
  }, [driveApi, token])

  useEffect(function() {
    const key = token && token.access_token ? String(token.access_token).slice(0, 24) : null
    if (!key || !tokenHasDriveAccess(token)) {
      ranFor.current = null
      return
    }
    if (ranFor.current === key) return
    ranFor.current = key
    if (!isMediaCacheDriveBackupEnabled()) {
      flushCachedMediaDriveDeletes(driveApi, { token: token }).catch(function() {})
      return
    }
    syncOutstandingCachedMediaBackup({ driveApi: driveApi, token: token }).catch(function() {})
  }, [token, driveApi])

  return {
    driveApi: driveApi,
    syncNow: function() {
      return syncOutstandingCachedMediaBackup({ force: true, token: token, driveApi: driveApi })
    },
  }
}
