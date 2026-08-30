import { curatedScrapeUrl } from './resourceBase'

/**
 * Build /importlink/... path for a curated collection entry.
 */
export function buildCuratedImportPath(bookMeta) {
  const meta = bookMeta || {}
  if (!meta.link) return null
  let path = '/importlink/' + encodeURIComponent(curatedScrapeUrl(meta.link))
  if (meta.book) {
    path += '/book/' + encodeURIComponent(meta.book)
  }
  if (meta.tag) {
    path += '/tag/' + encodeURIComponent(meta.tag)
  }
  return path
}

/**
 * Resolve a curated-book display title from an import-link route.
 * Many curated entries share a scrape file; prefer book/tag matches.
 */
export function findCuratedImportTitle(curatedTuneBooks, link, bookName, tagName) {
  const meta = findCuratedImportMeta(curatedTuneBooks, link, bookName, tagName)
  return meta ? meta.title : null
}

/**
 * Resolve curated meta (+ title key) for an import-link route.
 */
export function findCuratedImportMeta(curatedTuneBooks, link, bookName, tagName) {
  const books = curatedTuneBooks || {}
  const source = curatedScrapeUrl(link)
  if (!source) return null

  let best = null
  let bestScore = -1
  Object.keys(books).forEach(function(title) {
    const meta = books[title]
    if (!meta || !meta.link) return
    if (curatedScrapeUrl(meta.link) !== source) return

    let score = 1
    if (meta.book) {
      if (!bookName || String(meta.book) !== String(bookName)) return
      score += 2
    }
    if (meta.tag) {
      if (!tagName || String(meta.tag) !== String(tagName)) return
      score += 2
    }
    if (score > bestScore) {
      bestScore = score
      best = Object.assign({ title: title }, meta)
    }
  })
  return best
}
