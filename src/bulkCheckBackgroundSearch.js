import { lyricLinesToText } from './wLinesUtils'
import { primaryArtist } from './tuneBibliographicUtils'

function tuneTitle(tune) {
  return tune && tune.name ? String(tune.name).trim() : ''
}

/**
 * Queue a composer/artist lookup for one tune (background job).
 */
export function enqueueBulkCheckArtistSearch(fieldLookupQueue, tune, options) {
  const opts = options || {}
  if (!fieldLookupQueue || !tune || !tune.id) return false
  const title = tuneTitle(tune)
  if (!title) return false

  const jobId = fieldLookupQueue.enqueueLookup({
    tuneId: tune.id,
    kind: 'composer',
    title: title,
    artist: primaryArtist(tune),
    tuneName: title,
    accessToken: opts.token || null,
    searchOptions: opts.searchOptions || {},
  })
  return !!jobId
}

/**
 * Queue background research for one tune (background job).
 */
export function enqueueBulkCheckBackgroundResearch(backgroundQueue, tune, options) {
  const opts = options || {}
  if (!backgroundQueue || !tune || !tune.id) return false
  const title = tuneTitle(tune)
  if (!title) return false

  const ids = backgroundQueue.enqueueTunes([tune], {
    accessToken: opts.token || null,
    force: true,
    searchMode: 'auto',
    lyricsForTune: lyricLinesToText,
  })
  if (ids && ids.length > 0) {
    backgroundQueue.start()
    return true
  }
  return false
}
