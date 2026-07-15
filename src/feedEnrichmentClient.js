import { factHash } from './feedFactExtractors'
import { upsertFeedItems } from './feedItemStore'

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

function itemFromWiki(tune, summary) {
  const extract = String(summary && summary.extract || '').trim()
  if (extract.length < 40) return null
  const image = summary.thumbnail && summary.thumbnail.source ? summary.thumbnail.source : ''
  const pageUrl = summary.content_urls && summary.content_urls.desktop
    ? summary.content_urls.desktop.page
    : ''
  const title = String(tune.name || summary.title || 'Tune')
  const fact = {
    predicate: 'bio_snippet',
    subjectName: title,
    objectText: extract,
    tuneId: tune.id != null ? String(tune.id) : null,
  }
  return {
    id: makeId('wiki'),
    type: 'news',
    tuneId: fact.tuneId,
    artist: String(tune.composer || ''),
    headline: 'From Wikipedia: ' + title,
    teaser: extract.slice(0, 140) + (extract.length > 140 ? '…' : ''),
    body: extract,
    imageUrl: image,
    source: 'wikipedia',
    sourceUrl: pageUrl,
    factHash: factHash(fact) + '_wiki',
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

async function musicBrainzRecording(title, artist, signal) {
  const q = artist
    ? ('recording:"' + title + '" AND artist:"' + artist + '"')
    : ('recording:"' + title + '"')
  const url = 'https://musicbrainz.org/ws/2/recording?query='
    + encodeURIComponent(q) + '&fmt=json&limit=5'
  try {
    const data = await fetchJson(url, signal)
    const recordings = data && Array.isArray(data.recordings) ? data.recordings : []
    return recordings[0] || null
  } catch (e) {
    return null
  }
}

function itemFromMb(tune, recording) {
  if (!recording) return null
  const date = recording['first-release-date'] || ''
  const releases = Array.isArray(recording.releases) ? recording.releases : []
  const releaseTitle = releases[0] && releases[0].title ? releases[0].title : ''
  if (!date && !releaseTitle) return null
  const title = String(tune.name || recording.title || 'Tune')
  const objectText = releaseTitle
    ? (title + ' appears related to “' + releaseTitle + '”'
      + (date ? (' (first release ' + date + ')') : '') + '.')
    : (title + ' has a MusicBrainz first-release date of ' + date + '.')
  const year = date ? parseInt(String(date).slice(0, 4), 10) : null
  const fact = {
    predicate: 'first_released',
    subjectName: title,
    objectText: objectText,
    tuneId: tune.id != null ? String(tune.id) : null,
  }
  return {
    id: makeId('mb'),
    type: 'album',
    tuneId: fact.tuneId,
    artist: String(tune.composer || ''),
    headline: 'Release note: ' + title,
    teaser: objectText.slice(0, 140),
    body: objectText,
    imageUrl: '',
    source: 'musicbrainz',
    sourceUrl: recording.id ? ('https://musicbrainz.org/recording/' + recording.id) : '',
    factHash: factHash(fact) + '_mb',
    generation: 'musicbrainz',
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
    objectYear: Number.isFinite(year) ? year : null,
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

/**
 * Background Wikipedia + MusicBrainz enrichment. Never throws to caller.
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
  }, opts.timeoutMs || 20000)

  try {
    for (var i = 0; i < viewIds.length; i++) {
      const tune = tunes[viewIds[i]]
      if (!tune || !tune.name) continue
      const summary = await wikipediaSummary(tune.name, signal)
      const wikiItem = summary ? itemFromWiki(tune, summary) : null
      const recording = await musicBrainzRecording(tune.name, tune.composer || '', signal)
      const mbItem = itemFromMb(tune, recording)
      const batch = [wikiItem, mbItem].filter(Boolean)
      if (batch.length) {
        upsertFeedItems(batch)
        onItems(batch)
      }
      await sleep(400)
    }
  } catch (e) {
    // soft-fail
  } finally {
    clearTimeout(timeout)
  }
}
