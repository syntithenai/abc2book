import { getRecentTunes } from './recentTunes'
import { createQueue, tuneIdsFromTunes, sortTunesForQueue } from './nowPlayingQueue'

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

export function buildRecentPlaylistTuneIds(tunes, tunebook, limit) {
  const recentTunes = getRecentTunes(tunes)
  const { books: recentBooks, tags: recentTags } = collectRecentBooksAndTags(recentTunes)
  const candidates = Object.values(tunes || {}).filter(function(tune) {
    return tuneMatchesRecent(tune, recentBooks, recentTags)
  })
  const selected = shuffleArray(candidates)
  const hasNotesOrChords = tunebook && tunebook.hasNotesOrChords
    ? tunebook.hasNotesOrChords.bind(tunebook)
    : function() { return true }
  const hasLinks = tunebook && tunebook.hasLinks
    ? tunebook.hasLinks.bind(tunebook)
    : function() { return false }
  const sorted = sortTunesForQueue(selected, hasNotesOrChords, hasLinks)
  return tuneIdsFromTunes(sorted, typeof limit === 'number' ? limit : PLAYLIST_SIZE)
}

/** @deprecated tag-based playlist — use buildRecentPlaylistTuneIds + tunebook.createQueueFromTuneIds */
export function generateCurrentPlaylist(tunebook, tunes, callbacks) {
  const tuneIds = buildRecentPlaylistTuneIds(tunes, tunebook, PLAYLIST_SIZE)
  if (callbacks && typeof callbacks.forceRefresh === 'function') callbacks.forceRefresh()
  return { count: tuneIds.length, tag: CURRENT_PLAYLIST_TAG, tuneIds: tuneIds }
}
