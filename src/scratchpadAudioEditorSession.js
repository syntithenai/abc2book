import { getScratchpadItem } from './scratchpadStore'
import { resolveAudioProject } from './scratchpadAudioProject'

const sessionByItemId = new Map()
const STORAGE_PREFIX = 'scratchpad-audio-editor:'

function trackCount(audio) {
  return audio && Array.isArray(audio.tracks) ? audio.tracks.length : 0
}

function readStorage(itemId) {
  if (!itemId) return null
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + itemId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return resolveAudioProject({ id: itemId, type: 'audio', audio: parsed })
  } catch (e) {
    return null
  }
}

function writeStorage(itemId, audioProject) {
  if (!itemId || !audioProject) return
  try {
    sessionStorage.setItem(STORAGE_PREFIX + itemId, JSON.stringify(audioProject))
  } catch (e) { /* quota or private mode */ }
}

function pickBestProject(candidates) {
  let best = null
  let bestCount = -1
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]
    if (!candidate) continue
    const count = trackCount(candidate)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * Restores in-memory audio project across React Fast Refresh / remounts.
 * Uses sessionStorage + in-memory cache + scratchpad store; keeps the copy with the most tracks.
 */
export function readScratchpadAudioEditorSession(item) {
  const itemId = item && item.id
  if (!itemId) return resolveAudioProject(item)

  const fromStore = resolveAudioProject(getScratchpadItem(itemId) || item)
  const fromStorage = readStorage(itemId)
  const fromCache = sessionByItemId.get(itemId)
  const best = pickBestProject([fromCache, fromStorage, fromStore]) || fromStore

  sessionByItemId.set(itemId, best)
  return best
}

export function writeScratchpadAudioEditorSession(itemId, audioProject) {
  if (!itemId || !audioProject) return
  sessionByItemId.set(itemId, audioProject)
  writeStorage(itemId, audioProject)
}

export function clearScratchpadAudioEditorSession(itemId) {
  if (!itemId) return
  sessionByItemId.delete(itemId)
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + itemId)
  } catch (e) { /* ignore */ }
}
