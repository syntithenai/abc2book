import { isMassDeleteBatch } from './incomingMergeUtils'

/**
 * Refuse to persist a pending tunes map when it would mass-shrink what is
 * currently in memory. This catches the hydrate race where a stale/empty
 * setTunes schedules a write, hydrate loads the full book into memory, then
 * the pending tiny write flushes and wipes IndexedDB.
 */
export function shouldRefuseTunesPersist(pendingTunes, inMemoryTunes) {
  const pending = pendingTunes && typeof pendingTunes === 'object' ? pendingTunes : null
  const memory = inMemoryTunes && typeof inMemoryTunes === 'object' ? inMemoryTunes : null
  if (!pending || !memory) return false
  const pendingCount = Object.keys(pending).length
  const memoryCount = Object.keys(memory).length
  if (memoryCount <= 0) return false
  if (pendingCount >= memoryCount) return false
  const removedCount = memoryCount - pendingCount
  return isMassDeleteBatch(removedCount, memoryCount)
}

export function countTunes(tunes) {
  if (!tunes || typeof tunes !== 'object') return 0
  return Object.keys(tunes).length
}
