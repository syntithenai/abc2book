import { isMassDeleteBatch } from './incomingMergeUtils'

export const LAST_DRIVE_UPLOAD_STORAGE_KEY = 'bookstorage_last_drive_upload'

const SAMPLE_LIMIT = 12

function tuneDisplayName(tune, id) {
  if (!tune) return id || '(untitled)'
  const name = String(tune.name || tune.title || '').trim()
  return name || id || '(untitled)'
}

export function readLastDriveUploadSnapshot() {
  try {
    const raw = localStorage.getItem(LAST_DRIVE_UPLOAD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const ids = Array.isArray(parsed.ids) ? parsed.ids.map(String) : []
    const names = parsed.names && typeof parsed.names === 'object' ? parsed.names : {}
    return {
      count: typeof parsed.count === 'number' ? parsed.count : ids.length,
      ids: ids,
      names: names,
      savedAt: parsed.savedAt || null,
    }
  } catch (e) {
    return null
  }
}

export function writeLastDriveUploadSnapshot(tunes) {
  const map = tunes || {}
  const ids = Object.keys(map)
  const names = {}
  ids.forEach(function(id) {
    names[id] = tuneDisplayName(map[id], id)
  })
  const snapshot = {
    count: ids.length,
    ids: ids,
    names: names,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(LAST_DRIVE_UPLOAD_STORAGE_KEY, JSON.stringify(snapshot))
  } catch (e) {
    // ignore quota / private mode
  }
  return snapshot
}

/**
 * Build a shrink warning when the pending upload would remove a dangerous
 * number of tunes vs the last successful Drive upload.
 * Returns null when no confirmation is needed.
 */
export function buildDriveUploadShrinkWarning(previousSnapshot, nextTunes) {
  const prev = previousSnapshot || null
  const next = nextTunes || {}
  if (!prev || !Array.isArray(prev.ids) || prev.ids.length === 0) return null

  const nextIds = Object.keys(next)
  const nextSet = {}
  nextIds.forEach(function(id) { nextSet[id] = true })

  const removedIds = prev.ids.filter(function(id) { return !nextSet[id] })
  const removedCount = removedIds.length
  if (!isMassDeleteBatch(removedCount, prev.count || prev.ids.length)) return null

  const prevNames = prev.names || {}
  const sampleNames = removedIds.slice(0, SAMPLE_LIMIT).map(function(id) {
    return prevNames[id] || id
  })

  return {
    previousCount: prev.count || prev.ids.length,
    nextCount: nextIds.length,
    removedCount: removedCount,
    addedCount: nextIds.filter(function(id) {
      return prev.ids.indexOf(id) === -1
    }).length,
    sampleNames: sampleNames,
    sampleTruncated: removedIds.length > SAMPLE_LIMIT,
  }
}

export function shouldConfirmDriveUploadShrink(previousSnapshot, nextTunes) {
  return !!buildDriveUploadShrinkWarning(previousSnapshot, nextTunes)
}
