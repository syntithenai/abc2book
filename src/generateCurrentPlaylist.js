import { getRecentTunes } from './recentTunes'

export const CURRENT_PLAYLIST_TAG = 'Current Playlist'
const PLAYLIST_SIZE = 20

function shuffleArray(items) {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

function collectRecentBooksAndTags(recentTunes) {
  const books = new Set()
  const tags = new Set()
  recentTunes.forEach(function(tune) {
    if (Array.isArray(tune.books)) {
      tune.books.forEach(function(book) {
        if (book && book.trim()) books.add(book.trim())
      })
    }
    if (Array.isArray(tune.tags)) {
      tune.tags.forEach(function(tag) {
        if (tag && tag.trim() && tag !== CURRENT_PLAYLIST_TAG) tags.add(tag.trim())
      })
    }
  })
  return { books, tags }
}

function tuneMatchesRecent(tune, recentBooks, recentTags) {
  if (!tune || !tune.id) return false
  const books = Array.isArray(tune.books) ? tune.books : []
  const tags = Array.isArray(tune.tags) ? tune.tags : []
  if (books.some(function(book) { return recentBooks.has(book) })) return true
  if (tags.some(function(tag) { return recentTags.has(tag) })) return true
  return false
}

function reindexTunes(tunebook, tunes, tuneIds) {
  tuneIds.forEach(function(id) {
    if (tunes[id]) tunebook.indexes.indexTune(tunes[id])
  })
}

function tuneIdsWithTag(tunes, tag) {
  return Object.values(tunes || {})
    .filter(function(tune) {
      return tune && tune.id && Array.isArray(tune.tags) && tune.tags.indexOf(tag) !== -1
    })
    .map(function(tune) { return tune.id })
}

export function generateCurrentPlaylist(tunebook, tunes, callbacks) {
  const { setTagFilter, setCurrentTuneBook, setFilter, forceRefresh } = callbacks

  const clearedIds = tuneIdsWithTag(tunes, CURRENT_PLAYLIST_TAG)
  if (clearedIds.length > 0) {
    tunebook.removeTunesFromTag(clearedIds, CURRENT_PLAYLIST_TAG)
    reindexTunes(tunebook, tunes, clearedIds)
  }

  tunebook.indexes.addTagToIndex(CURRENT_PLAYLIST_TAG)

  const recentTunes = getRecentTunes(tunes)
  const { books: recentBooks, tags: recentTags } = collectRecentBooksAndTags(recentTunes)

  const candidates = Object.values(tunes || {}).filter(function(tune) {
    return tuneMatchesRecent(tune, recentBooks, recentTags)
  })

  const selected = shuffleArray(candidates).slice(0, PLAYLIST_SIZE)
  const selectedIds = selected.map(function(tune) { return tune.id })

  if (selectedIds.length > 0) {
    tunebook.addTunesToTag(selectedIds, CURRENT_PLAYLIST_TAG)
    reindexTunes(tunebook, tunes, selectedIds)
  }

  setFilter('')
  setCurrentTuneBook('')
  setTagFilter([CURRENT_PLAYLIST_TAG])
  if (typeof forceRefresh === 'function') forceRefresh()

  return { count: selectedIds.length, tag: CURRENT_PLAYLIST_TAG }
}
