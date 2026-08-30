import { tempoRangeSortKey } from './tempoRange'

/**
 * Sort group keys the same way IndexLayout renders them.
 */
export function compareSearchGroupKeys(groupBy, a, b) {
  if (!a || (a.trim && a.trim() === '')) return -1
  if (!b || (b.trim && b.trim() === '')) return 1
  if (groupBy === 'tempoRange') {
    return tempoRangeSortKey(a) > tempoRangeSortKey(b) ? 1 : -1
  }
  if (parseInt(a) > 0 && parseInt(b) > 0) {
    return parseInt(a) > parseInt(b) ? 1 : -1
  }
  return a > b ? 1 : -1
}

function pushTuneId(orderedIds, tune) {
  if (tune && tune.id != null && tune.id !== '') {
    orderedIds.push(tune.id)
  }
}

function sameTuneId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

/**
 * Build ordered search groups matching IndexLayout section order.
 * Ungrouped lists become a single group with key ''.
 *
 * @returns {Array<{ key: string, ids: Array }>|null}
 */
export function buildOrderedSearchListGroups(filtered, grouped, groupBy) {
  if (!Array.isArray(filtered) || filtered.length === 0) return null

  const hasGroups = grouped
    && typeof grouped === 'object'
    && !Array.isArray(grouped)
    && Object.keys(grouped).length > 0

  if (!hasGroups) {
    const ids = []
    filtered.forEach(function(tune) {
      pushTuneId(ids, tune)
    })
    return ids.length > 0 ? [{ key: '', ids: ids }] : null
  }

  const groups = []
  Object.keys(grouped).sort(function(a, b) {
    return compareSearchGroupKeys(groupBy, a, b)
  }).forEach(function(groupKey) {
    const indexes = grouped[groupKey]
    if (!Array.isArray(indexes) || indexes.length === 0) return
    const ids = []
    indexes.forEach(function(itemKey) {
      pushTuneId(ids, filtered[itemKey])
    })
    if (ids.length > 0) {
      groups.push({ key: String(groupKey), ids: ids })
    }
  })
  return groups.length > 0 ? groups : null
}

/**
 * Flatten the current search list into tune ids in on-screen order.
 * Includes empty group keys — IndexLayout still renders that section (blank
 * heading) for tunes missing the group field (e.g. no confidence/boost).
 *
 * @returns {Array|null} ordered ids, or null when list state is unavailable
 */
export function buildOrderedSearchListIds(filtered, grouped, groupBy) {
  const groups = buildOrderedSearchListGroups(filtered, grouped, groupBy)
  if (!groups) return null
  const orderedIds = []
  groups.forEach(function(group) {
    group.ids.forEach(function(id) {
      orderedIds.push(id)
    })
  })
  return orderedIds.length > 0 ? orderedIds : null
}

/**
 * @param {Array<{ key: string, ids: Array }>|null} groups
 * @param {*} tuneId
 * @returns {number} group index or -1
 */
export function findSearchListGroupIndex(groups, tuneId) {
  if (!Array.isArray(groups) || groups.length === 0 || tuneId == null || tuneId === '') {
    return -1
  }
  for (let i = 0; i < groups.length; i++) {
    const ids = groups[i] && groups[i].ids
    if (!Array.isArray(ids)) continue
    if (ids.some(function(id) { return sameTuneId(id, tuneId) })) return i
  }
  return -1
}

/**
 * First tune id of the adjacent search group (wraps).
 * @returns {*|null}
 */
export function adjacentSearchListGroupFirstId(groups, tuneId, direction) {
  if (!Array.isArray(groups) || groups.length === 0) return null
  const dir = direction > 0 ? 1 : -1
  let idx = findSearchListGroupIndex(groups, tuneId)
  if (idx === -1) {
    idx = dir > 0 ? -1 : 0
  }
  const nextIdx = (idx + dir + groups.length) % groups.length
  const nextGroup = groups[nextIdx]
  if (!nextGroup || !Array.isArray(nextGroup.ids) || nextGroup.ids.length === 0) return null
  return nextGroup.ids[0]
}

/**
 * Sibling tune ids for the group containing tuneId.
 * @returns {Array|null}
 */
export function findSearchListGroupIds(groups, tuneId) {
  const idx = findSearchListGroupIndex(groups, tuneId)
  if (idx < 0) return null
  const group = groups[idx]
  return group && Array.isArray(group.ids) ? group.ids.slice() : null
}

/**
 * True when the group key is an explicit book page number (not the blank
 * bucket used for unordered / unpaged tunes).
 */
export function isExplicitBookPageGroupKey(groupKey) {
  return parseInt(groupKey, 10) > 0
}

/**
 * Page groups that have an explicit page number only.
 * @returns {Array<{ key: string, ids: Array }>}
 */
export function filterExplicitBookPageGroups(groups) {
  if (!Array.isArray(groups)) return []
  return groups.filter(function(group) {
    return group && isExplicitBookPageGroupKey(group.key)
  })
}

/**
 * Sibling ids only when the tune sits on an explicit book page.
 * Unordered / blank-key groups return null so callers treat the tune alone.
 * @returns {Array|null}
 */
export function findExplicitBookPageSiblingIds(groups, tuneId) {
  const idx = findSearchListGroupIndex(groups, tuneId)
  if (idx < 0) return null
  const group = groups[idx]
  if (!group || !isExplicitBookPageGroupKey(group.key)) return null
  return Array.isArray(group.ids) ? group.ids.slice() : null
}

/** DOM id for a stacked page-tune section in single view. */
export function tunePageSectionDomId(tuneId) {
  if (tuneId == null || tuneId === '') return ''
  return 'tune-page-section-' + String(tuneId)
}
