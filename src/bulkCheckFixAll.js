import { STRUCTURE_FIX_ACTIONS } from './tuneAbcStructureFix'

/** Preview/wizard fixes — Fix all opens the review modal for these. */
export const FIX_ALL_PREVIEW_ACTIONS = new Set([
  'normalizeAbc',
  'appendFinalBarline',
])

/** Searches started as background jobs during Fix all. */
export const FIX_ALL_BACKGROUND_ACTIONS = new Set([
  'searchArtist',
  'backgroundInfo',
])

const FIX_ALL_SEARCH_ORDER = [
  'capitalizeTitle',
  'searchAbc',
  'searchChordsLyrics',
  'searchArtist',
  'backgroundInfo',
]

export function orderFixAllActionIds(actionIds) {
  const ids = Array.isArray(actionIds) ? actionIds.slice() : []
  const ordered = []

  STRUCTURE_FIX_ACTIONS.forEach(function(item) {
    if (ids.indexOf(item.id) >= 0) ordered.push(item.id)
  })
  FIX_ALL_SEARCH_ORDER.forEach(function(actionId) {
    if (ids.indexOf(actionId) >= 0 && ordered.indexOf(actionId) < 0) {
      ordered.push(actionId)
    }
  })
  ids.forEach(function(actionId) {
    if (ordered.indexOf(actionId) < 0) ordered.push(actionId)
  })
  return ordered
}
