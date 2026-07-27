import { createPracticeListTombstone } from './practiceListSync'
import { normalizePracticeListTuneIds } from './practiceListMergeUtils'

const STORAGE_KEY = 'bookstorage_practice_lists'
const DELETED_STORAGE_KEY = 'bookstorage_deleted_practice_lists'

export const MIN_RECOMMENDED_PRACTICE_LIST_TUNES = 3

const changeListeners = []
let onPracticeListsChangedHandler = null

export function setPracticeListsChangeHandler(handler) {
  onPracticeListsChangedHandler = typeof handler === 'function' ? handler : null
}

export function subscribePracticeLists(listener) {
  if (typeof listener !== 'function') return function() {}
  changeListeners.push(listener)
  return function() {
    const idx = changeListeners.indexOf(listener)
    if (idx !== -1) changeListeners.splice(idx, 1)
  }
}

export function notifyPracticeListsChanged() {
  changeListeners.forEach(function(listener) {
    try { listener() } catch (e) { /* ignore */ }
  })
  if (typeof onPracticeListsChangedHandler === 'function') {
    try { onPracticeListsChangedHandler() } catch (e) { /* ignore */ }
  }
}

export function readPracticeListsMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

export function writePracticeListsMap(lists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists || {}))
}

export function readDeletedPracticeLists() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

export function writeDeletedPracticeLists(deletedLists) {
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(deletedLists || {}))
}

export { normalizePracticeListTuneIds } from './practiceListMergeUtils'

function normalizePracticeListRecord(list, listId) {
  const next = Object.assign({}, list)
  if (listId) next.id = listId
  next.tuneIds = normalizePracticeListTuneIds(next.tuneIds)
  return next
}

export function listPracticeLists() {
  const lists = readPracticeListsMap()
  return Object.keys(lists).map(function(id) {
    return normalizePracticeListRecord(lists[id], id)
  }).sort(function(a, b) {
    const aUpdated = a.updatedAt || 0
    const bUpdated = b.updatedAt || 0
    if (aUpdated !== bUpdated) return bUpdated - aUpdated
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function getPracticeList(listId) {
  const lists = readPracticeListsMap()
  if (!lists[listId]) return null
  return normalizePracticeListRecord(lists[listId], listId)
}

export function savePracticeList(list) {
  const lists = readPracticeListsMap()
  const id = list.id || ('practice-list-' + Date.now())
  const normalized = normalizePracticeListRecord(list)
  const next = Object.assign({}, normalized, { updatedAt: Date.now() })
  delete next.id
  lists[id] = next
  writePracticeListsMap(lists)

  const deleted = readDeletedPracticeLists()
  if (deleted[id]) {
    delete deleted[id]
    writeDeletedPracticeLists(deleted)
  }

  notifyPracticeListsChanged()
  return Object.assign({ id: id }, next)
}

export function appendTunesToPracticeList(listId, tuneIds) {
  const ids = Array.isArray(tuneIds) ? tuneIds.filter(Boolean) : []
  if (!listId || !ids.length) return null
  const existing = getPracticeList(listId)
  if (!existing) return null
  const merged = normalizePracticeListTuneIds((existing.tuneIds || []).concat(ids))
  return savePracticeList(Object.assign({}, existing, { tuneIds: merged }))
}

export function deletePracticeList(listId) {
  const lists = readPracticeListsMap()
  const existing = lists[listId]
  delete lists[listId]
  writePracticeListsMap(lists)

  const deleted = readDeletedPracticeLists()
  deleted[listId] = createPracticeListTombstone(
    listId,
    existing && existing.name ? existing.name : undefined,
    Date.now()
  )
  writeDeletedPracticeLists(deleted)
  notifyPracticeListsChanged()
}

export function duplicatePracticeList(listId) {
  const existing = getPracticeList(listId)
  if (!existing) return null
  const copy = Object.assign({}, existing, {
    id: undefined,
    name: (existing.name || 'Practice list') + ' copy',
  })
  return savePracticeList(copy)
}

export function practiceListTuneCount(list) {
  return normalizePracticeListTuneIds(list && list.tuneIds).length
}

export function allPracticeListTuneIds() {
  const lists = listPracticeLists()
  const merged = []
  lists.forEach(function(list) {
    if (list && Array.isArray(list.tuneIds)) {
      merged.push.apply(merged, list.tuneIds)
    }
  })
  return normalizePracticeListTuneIds(merged)
}

export function allPracticeListTuneCount() {
  return allPracticeListTuneIds().length
}
