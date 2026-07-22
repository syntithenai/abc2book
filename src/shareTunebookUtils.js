import { appendFreshLoadParam } from './appFreshLoadUtils'
import { normalizePerformanceSetItems } from './performanceSetStore'
import { tuneIdsForPlaylistRecord } from './savedPlaylistsStore'

export const SHARE_KINDS = ['tune', 'book', 'set', 'playlist', 'tag', 'all']

function sameTuneId(a, b) {
  return String(a) === String(b)
}

export function matchesShareImportScope(tune, limits) {
  if (!tune) return false
  const opts = limits || {}
  if (Array.isArray(opts.limitToTuneIds)) {
    if (opts.limitToTuneIds.length === 0) return false
    return opts.limitToTuneIds.some(function(id) { return sameTuneId(tune.id, id) })
  }
  if (opts.limitToTuneId && !sameTuneId(tune.id, opts.limitToTuneId)) return false
  if (opts.limitToBookName && (!Array.isArray(tune.books) || tune.books.indexOf(opts.limitToBookName) === -1)) return false
  if (opts.limitToTagName && (!Array.isArray(tune.tags) || tune.tags.indexOf(opts.limitToTagName) === -1)) return false
  if (Array.isArray(opts.limitToTagNames) && opts.limitToTagNames.length > 0) {
    const tags = Array.isArray(tune.tags) ? tune.tags : []
    for (let i = 0; i < opts.limitToTagNames.length; i += 1) {
      if (tags.indexOf(opts.limitToTagNames[i]) === -1) return false
    }
  }
  return true
}

export function shareOrigin(origin) {
  if (origin && String(origin).trim()) return String(origin).replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }
  return 'https://tunebook.net'
}

export function buildShareImportLink(options) {
  const opts = options || {}
  const googleDocumentId = opts.googleDocumentId
  if (!googleDocumentId) return ''

  const base = shareOrigin(opts.origin)
  let path = '/#/importdoc/' + encodeURIComponent(googleDocumentId)

  const kind = opts.shareKind || 'all'
  if (kind === 'tune' && opts.tuneId) {
    path += '/share/tune/' + encodeURIComponent(opts.tuneId)
  } else if (kind === 'book' && opts.bookName) {
    path += '/share/book/' + encodeURIComponent(opts.bookName)
  } else if (kind === 'set' && opts.setId) {
    path += '/share/set/' + encodeURIComponent(opts.setId)
  } else if (kind === 'playlist' && opts.playlistId) {
    path += '/share/playlist/' + encodeURIComponent(opts.playlistId)
  } else if (kind === 'tag' && opts.tagName) {
    path += '/share/tag/' + encodeURIComponent(opts.tagName)
  }

  const includeFreshParam = opts.includeFreshParam !== false
  const link = base + path
  return includeFreshParam ? appendFreshLoadParam(link) : link
}

export function shareModalTitle(shareKind, context) {
  const ctx = context || {}
  if (shareKind === 'tune') return 'Share Tune'
  if (shareKind === 'book' && ctx.bookName) return 'Share Book — ' + ctx.bookName
  if (shareKind === 'set' && ctx.setName) return 'Share Set — ' + ctx.setName
  if (shareKind === 'set') return 'Share Set'
  if (shareKind === 'playlist' && ctx.playlistName) return 'Share Playlist — ' + ctx.playlistName
  if (shareKind === 'playlist') return 'Share Playlist'
  return 'Share Tunebook'
}

export function shareEmailSubject(shareKind, context) {
  const ctx = context || {}
  if (shareKind === 'tune' && ctx.tuneName) return 'Shared tune: ' + ctx.tuneName
  if (shareKind === 'book' && ctx.bookName) return 'Shared tune book: ' + ctx.bookName
  if (shareKind === 'set' && ctx.setName) return 'Shared setlist: ' + ctx.setName
  if (shareKind === 'playlist' && ctx.playlistName) return 'Shared playlist: ' + ctx.playlistName
  return 'Shared tunebook from tunebook.net'
}

export function parseImportDocRouteParams(params) {
  const p = params || {}
  let scopeHint = 'all'
  let tuneId = null
  let bookName = null
  let setId = null
  let playlistId = null
  let tagName = null

  if (p.tuneId) {
    scopeHint = 'tune'
    tuneId = decodeURIComponent(p.tuneId)
  } else if (p.bookName) {
    scopeHint = 'book'
    bookName = decodeURIComponent(p.bookName)
  } else if (p.setId) {
    scopeHint = 'set'
    setId = decodeURIComponent(p.setId)
  } else if (p.playlistId) {
    scopeHint = 'playlist'
    playlistId = decodeURIComponent(p.playlistId)
  } else if (p.tagName) {
    scopeHint = 'tag'
    tagName = decodeURIComponent(p.tagName)
  }

  return { scopeHint, tuneId, bookName, setId, playlistId, tagName }
}

export function booksForTune(tunes, tuneId) {
  if (!tunes || !tuneId) return []
  const tune = tunes[tuneId]
  if (!tune || !Array.isArray(tune.books)) return []
  return tune.books.filter(function(name) { return name && String(name).trim() })
}

export function countTunesInBook(tunes, bookName) {
  if (!tunes || !bookName) return 0
  return Object.values(tunes).filter(function(tune) {
    return tune && Array.isArray(tune.books) && tune.books.indexOf(bookName) !== -1
  }).length
}

export function tuneIdsForSet(setRecord) {
  if (!setRecord) return []
  const items = normalizePerformanceSetItems(setRecord.items)
  const ids = []
  const seen = {}
  items.forEach(function(item) {
    if (!item || item.type === 'note' || !item.tuneId) return
    const id = String(item.tuneId)
    if (seen[id]) return
    seen[id] = true
    ids.push(id)
  })
  return ids
}

export function tuneIdsForPlaylist(playlistRecord) {
  return tuneIdsForPlaylistRecord(playlistRecord)
}
