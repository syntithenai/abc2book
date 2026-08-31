import { curatedScrapeUrl } from './resourceBase'
import { PUBLISHABLE_SCRAPE_FILES } from './bookTaxonomy.js'

/**
 * Resolve ordered scrape filenames for a curated entry.
 * - link: single file (legacy)
 * - links: explicit multi-file list
 * - all: true → all publishable scrape files
 */
export function resolveCuratedScrapeLinks(bookMeta) {
  const meta = bookMeta || {}
  if (meta.all === true) {
    return PUBLISHABLE_SCRAPE_FILES.slice()
  }
  if (Array.isArray(meta.links) && meta.links.length > 0) {
    return meta.links.map(function(link) { return String(link || '').trim() }).filter(Boolean)
  }
  if (meta.link) {
    return [String(meta.link).trim()]
  }
  return []
}

/**
 * Build import path for a curated collection entry.
 * Multi-file / all-scope cards use /importcurated/<title>.
 * Single-file cards keep legacy /importlink/... URLs.
 */
export function buildCuratedImportPath(bookMeta, title) {
  const meta = bookMeta || {}
  const links = resolveCuratedScrapeLinks(meta)
  if (!links.length) return null

  if (meta.all === true || links.length > 1 || (title && meta.useCatalogRoute)) {
    const key = encodeURIComponent(String(title || meta.title || '').trim())
    if (!key) return null
    let path = '/importcurated/' + key
    if (meta.book) path += '/book/' + encodeURIComponent(meta.book)
    if (meta.tag) path += '/tag/' + encodeURIComponent(meta.tag)
    return path
  }

  let path = '/importlink/' + encodeURIComponent(curatedScrapeUrl(links[0]))
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
    if (!meta) return
    const links = resolveCuratedScrapeLinks(meta)
    if (!links.length) return
    // Legacy single-link matching only.
    if (links.length !== 1) return
    if (curatedScrapeUrl(links[0]) !== source) return

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

export function findCuratedByTitle(curatedTuneBooks, title) {
  const books = curatedTuneBooks || {}
  const key = String(title || '').trim()
  if (!key || !books[key]) return null
  return Object.assign({ title: key }, books[key])
}
