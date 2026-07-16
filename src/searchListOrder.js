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

/**
 * Flatten the current search list into tune ids in on-screen order.
 * Includes empty group keys — IndexLayout still renders that section (blank
 * heading) for tunes missing the group field (e.g. no confidence/boost).
 *
 * @returns {Array|null} ordered ids, or null when list state is unavailable
 */
export function buildOrderedSearchListIds(filtered, grouped, groupBy) {
  if (!Array.isArray(filtered) || filtered.length === 0) return null

  const hasGroups = grouped
    && typeof grouped === 'object'
    && !Array.isArray(grouped)
    && Object.keys(grouped).length > 0

  if (!hasGroups) {
    const orderedIds = []
    filtered.forEach(function(tune) {
      pushTuneId(orderedIds, tune)
    })
    return orderedIds
  }

  const orderedIds = []
  Object.keys(grouped).sort(function(a, b) {
    return compareSearchGroupKeys(groupBy, a, b)
  }).forEach(function(groupKey) {
    const indexes = grouped[groupKey]
    if (!Array.isArray(indexes) || indexes.length === 0) return
    indexes.forEach(function(itemKey) {
      pushTuneId(orderedIds, filtered[itemKey])
    })
  })
  return orderedIds
}
