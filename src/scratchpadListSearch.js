import { listAllScratchpadItems, listItems } from './scratchpadStore'

export function scratchpadItemUpdatedAtMs(item) {
  if (!item) return 0
  const updatedAt = item.updatedAt
  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) return updatedAt
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? parsed : 0
}

export function sortScratchpadItemsByUpdatedAt(items) {
  const list = Array.isArray(items) ? items.slice() : []
  return list.sort(function(a, b) {
    return scratchpadItemUpdatedAtMs(b) - scratchpadItemUpdatedAtMs(a)
  })
}

export function listScratchpadItemsForWorkspaceFilter(workspaceFilterId) {
  if (!workspaceFilterId) return listAllScratchpadItems()
  return listItems(workspaceFilterId)
}

export function scratchpadItemSearchHaystack(item) {
  if (!item) return ''
  const parts = [
    item.title,
    item.type,
    item.linkedTuneId,
  ]
  if (item.type === 'text' && item.text && item.text.body) {
    parts.push(item.text.body)
  }
  if (item.type === 'notation' && item.notation && item.notation.tuneSnapshot) {
    const snap = item.notation.tuneSnapshot
    if (snap.name) parts.push(snap.name)
    if (snap.composer) parts.push(snap.composer)
  }
  return parts.map(function(part) { return String(part || '') }).join('\n').toLowerCase()
}

export function filterScratchpadItems(items, query) {
  const list = Array.isArray(items) ? items : []
  const q = String(query || '').trim().toLowerCase()
  if (!q) return list
  return list.filter(function(item) {
    return scratchpadItemSearchHaystack(item).indexOf(q) >= 0
  })
}

export function getScratchpadListItems(workspaceFilterId, query) {
  return filterScratchpadItems(
    sortScratchpadItemsByUpdatedAt(listScratchpadItemsForWorkspaceFilter(workspaceFilterId)),
    query
  )
}
