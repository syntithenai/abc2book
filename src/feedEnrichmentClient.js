import { factHash } from './feedFactExtractors'
import { upsertFeedItems } from './feedItemStore'
import { primaryArtist } from './tuneBibliographicUtils'

const WIKI_BODY_CAP = 12000
const WIKI_IMAGES_MAX = 12

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal: signal })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

async function wikipediaSummary(title, signal) {
  const pageTitle = String(title || '').trim()
  if (!pageTitle) return null
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
    + encodeURIComponent(pageTitle.replace(/ /g, '_'))
  try {
    return await fetchJson(url, signal)
  } catch (e) {
    return null
  }
}

/** Intro section only (exintro): the lead text before the first heading. */
async function wikipediaIntroExtract(pageTitle, signal) {
  const title = String(pageTitle || '').trim()
  if (!title) return ''
  const url = 'https://en.wikipedia.org/w/api.php?action=query'
    + '&prop=extracts&explaintext=1&exintro=1&exsectionformat=plain'
    + '&titles=' + encodeURIComponent(title)
    + '&format=json&origin=*'
  try {
    const data = await fetchJson(url, signal)
    const pages = data && data.query && data.query.pages ? data.query.pages : {}
    const keys = Object.keys(pages)
    if (!keys.length) return ''
    const page = pages[keys[0]]
    if (!page || page.missing != null) return ''
    return String(page.extract || '').trim()
  } catch (e) {
    return ''
  }
}

const WIKI_IMAGE_SKIP_RE = /commons-logo|wikisource-logo|wiktionary|edit-icon|question_book|ambox|padlock|\.svg($|\?)|\.ogg($|\?)|\.mid($|\?)/i

/** Pick displayable image URLs out of a REST media-list response. */
export function wikiMediaToImageUrls(mediaList, max) {
  const cap = max > 0 ? max : WIKI_IMAGES_MAX
  const items = mediaList && Array.isArray(mediaList.items) ? mediaList.items : []
  const urls = []
  const seen = {}
  items.forEach(function(entry) {
    if (urls.length >= cap) return
    if (!entry || entry.type !== 'image') return
    const srcset = Array.isArray(entry.srcset) ? entry.srcset : []
    let src = srcset[0] && srcset[0].src ? String(srcset[0].src) : ''
    if (!src) return
    if (src.indexOf('//') === 0) src = 'https:' + src
    if (WIKI_IMAGE_SKIP_RE.test(src)) return
    if (seen[src]) return
    seen[src] = true
    urls.push(src)
  })
  return urls
}

async function wikipediaArticleImages(pageTitle, signal) {
  const title = String(pageTitle || '').trim()
  if (!title) return []
  const url = 'https://en.wikipedia.org/api/rest_v1/page/media-list/'
    + encodeURIComponent(title.replace(/ /g, '_'))
  try {
    const data = await fetchJson(url, signal)
    return wikiMediaToImageUrls(data)
  } catch (e) {
    return []
  }
}

function itemFromWiki(tune, summary, introExtract, imageUrls) {
  const short = String(summary && summary.extract || '').trim()
  let body = String(introExtract || short).trim()
  if (body.length < 40) return null
  if (body.length > WIKI_BODY_CAP) body = body.slice(0, WIKI_BODY_CAP) + '\n…'
  const thumb = summary.thumbnail && summary.thumbnail.source ? summary.thumbnail.source : ''
  const images = (imageUrls && imageUrls.length ? imageUrls : (thumb ? [thumb] : [])).slice(0, WIKI_IMAGES_MAX)
  const image = images[0] || thumb
  const pageUrl = summary.content_urls && summary.content_urls.desktop
    ? summary.content_urls.desktop.page
    : ''
  const wikiTitle = String(summary.title || tune.name || 'Tune').trim()
  const title = String(tune.name || wikiTitle)
  const fact = {
    predicate: 'wiki_article',
    subjectName: title,
    objectText: wikiTitle,
    tuneId: tune.id != null ? String(tune.id) : null,
  }
  return {
    id: makeId('wiki'),
    type: 'news',
    tuneId: fact.tuneId,
    artist: String(primaryArtist(tune) || tune.composer || ''),
    headline: String(tune.name || wikiTitle).trim() || wikiTitle,
    teaser: (short || body).slice(0, 160) + ((short || body).length > 160 ? '…' : ''),
    body: body,
    imageUrl: image,
    imageUrls: images,
    source: 'wikipedia',
    sourceUrl: pageUrl,
    factHash: factHash(fact),
    generation: 'wiki',
    quiz: null,
    lessonId: null,
    createdAt: Date.now(),
    status: 'queued',
    lastShownAt: null,
    dismissedAt: null,
    expandedAt: null,
    answeredAt: null,
    reuseEligible: false,
    srsDueAt: null,
    isNew: true,
    attemptCount: 0,
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

async function resolveWikiForTune(tune, signal) {
  const title = String(tune.name || '').trim()
  const artist = primaryArtist(tune) || String(tune.composer || '').trim()
  const queries = []
  if (title && artist) queries.push(title + ' (song)')
  if (title) queries.push(title)
  if (artist) queries.push(artist)

  for (var i = 0; i < queries.length; i++) {
    const summary = await wikipediaSummary(queries[i], signal)
    if (!summary || summary.type === 'disambiguation') continue
    const pageTitle = summary.title || queries[i]
    const intro = await wikipediaIntroExtract(pageTitle, signal)
    const images = await wikipediaArticleImages(pageTitle, signal)
    const item = itemFromWiki(tune, summary, intro, images)
    if (item) return item
  }
  return null
}

/**
 * Background Wikipedia enrichment (no MusicBrainz release cards).
 * Batches all items and calls onItems once at the end.
 */
export async function runFeedEnrichment(options) {
  const opts = options || {}
  const tunes = opts.tunes || {}
  const viewIds = Array.isArray(opts.viewIds) ? opts.viewIds : []
  const onItems = typeof opts.onItems === 'function' ? opts.onItems : function() {}
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const signal = controller ? controller.signal : undefined
  const timeout = setTimeout(function() {
    if (controller) controller.abort()
  }, opts.timeoutMs || 45000)

  const collected = []
  try {
    for (var i = 0; i < viewIds.length; i++) {
      const tune = tunes[viewIds[i]]
      if (!tune || !tune.name) continue
      const wikiItem = await resolveWikiForTune(tune, signal)
      if (wikiItem) collected.push(wikiItem)
      await sleep(350)
    }
    if (collected.length) {
      upsertFeedItems(collected)
      onItems(collected)
    }
  } catch (e) {
    // soft-fail
  } finally {
    clearTimeout(timeout)
  }
  return collected
}
