/**
 * Resolve playable tune IDs for a Books hub collection filter (book / tag / genre / artist).
 */

import { PLAYLIST_MAX_ITEMS } from './tuneScaleConstants'

function isPlayableTune(tune, tunebook) {
  if (!tune || !tune.id || !tunebook) return false
  const hasMusic = tunebook.hasNotesOrChords && tunebook.hasNotesOrChords(tune)
  const hasLinks = tunebook.hasLinks
    ? tunebook.hasLinks(tune)
    : (Array.isArray(tune.links) && tune.links.length > 0)
  return hasMusic || hasLinks
}

export function getPlayableTuneIdsForCollection(tunebook, tunes, filter) {
  const opts = filter || {}
  let list = []
  if (opts.book) {
    list = tunebook.fromBook(opts.book)
  } else if (opts.tags && opts.tags.length) {
    list = tunebook.fromSearch('', null, opts.tags)
  } else if (opts.genres && opts.genres.length) {
    list = tunebook.fromSearch('', null, [], tunes, opts.genres, opts.artists || [])
  } else if (opts.artists && opts.artists.length) {
    list = tunebook.fromSearch('', null, [], tunes, [], opts.artists)
  }
  if (!Array.isArray(list)) return []
  return list.filter(function(tune) {
    return isPlayableTune(tune, tunebook)
  }).map(function(tune) {
    return tune.id
  }).slice(0, PLAYLIST_MAX_ITEMS)
}

export function getPlayableTuneIdsFromListRows(filtered, tunes, tunebook, selectedIds) {
  const ids = []
  if (selectedIds && selectedIds.length) {
    selectedIds.forEach(function(id) {
      const tune = tunes && tunes[id]
      if (isPlayableTune(tune, tunebook)) ids.push(id)
    })
    return ids.slice(0, PLAYLIST_MAX_ITEMS)
  }
  if (!Array.isArray(filtered)) return ids
  filtered.forEach(function(row) {
    const tune = row && row.tune ? row.tune : row
    if (isPlayableTune(tune, tunebook)) ids.push(tune.id)
  })
  return ids.slice(0, PLAYLIST_MAX_ITEMS)
}
