/**
 * Queue and flush Google Drive deletes for scratchpad audio blobs
 * removed from local projects (deleted tracks/takes/mixdowns).
 */
import localforage from 'localforage'

const PENDING_DELETE_KEY = 'scratchpad_pending_drive_deletes'

const pendingStore = localforage.createInstance({
  name: 'abc2book',
  storeName: 'scratchpad_sync',
})

let registeredDriveApi = null

export function registerScratchpadDriveApi(driveApi) {
  registeredDriveApi = driveApi || null
}

async function readPendingDriveDeletes() {
  const list = await pendingStore.getItem(PENDING_DELETE_KEY)
  return Array.isArray(list) ? list.filter(Boolean).map(String) : []
}

async function writePendingDriveDeletes(ids) {
  const unique = []
  const seen = {}
  ;(ids || []).forEach(function(id) {
    const key = String(id || '')
    if (!key || seen[key]) return
    seen[key] = true
    unique.push(key)
  })
  await pendingStore.setItem(PENDING_DELETE_KEY, unique)
  return unique
}

export async function clearScratchpadDriveDeleteQueue() {
  await pendingStore.removeItem(PENDING_DELETE_KEY)
}

export async function enqueueScratchpadDriveDeletes(fileIds) {
  const incoming = (fileIds || []).filter(Boolean).map(String)
  if (!incoming.length) return await readPendingDriveDeletes()
  const list = await readPendingDriveDeletes()
  incoming.forEach(function(id) {
    if (list.indexOf(id) < 0) list.push(id)
  })
  return writePendingDriveDeletes(list)
}

export async function flushScratchpadDriveDeletes(driveApi, options) {
  const api = driveApi || registeredDriveApi
  const opts = options || {}
  if (!api || typeof api.deleteDocument !== 'function') {
    return { deleted: 0, remaining: await readPendingDriveDeletes() }
  }
  const accessToken = opts.token && opts.token.access_token
    ? opts.token.access_token
    : opts.accessToken
  if (!accessToken) {
    return { deleted: 0, remaining: await readPendingDriveDeletes() }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { deleted: 0, remaining: await readPendingDriveDeletes() }
  }

  const pending = await readPendingDriveDeletes()
  if (!pending.length) return { deleted: 0, remaining: [] }

  const remaining = []
  let deleted = 0
  for (let i = 0; i < pending.length; i += 1) {
    const fileId = pending[i]
    try {
      const result = await api.deleteDocument(fileId)
      if (result && result.error) {
        const status = result.error.response && result.error.response.status
        if (status === 404) {
          deleted += 1
        } else {
          remaining.push(fileId)
        }
      } else {
        deleted += 1
      }
    } catch (e) {
      remaining.push(fileId)
    }
  }
  await writePendingDriveDeletes(remaining)
  return { deleted: deleted, remaining: remaining }
}

export async function enqueueAndTryFlushScratchpadDriveDeletes(fileIds, options) {
  await enqueueScratchpadDriveDeletes(fileIds)
  return flushScratchpadDriveDeletes(options && options.driveApi, options || {})
}
