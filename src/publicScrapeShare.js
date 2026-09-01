/**
 * Shared public-scrape share analysis: publishability, private media warnings,
 * variant defaults, and QR capacity helpers used by playlist/tune/book/set shares.
 */

import { isPublishableBook, scrapeFileForBook } from './bookTaxonomy'
import { isOwnedMediaLink } from './linkRecording'
import {
  isMusicCollectionByEntryUri,
  isMusicCollectionLinkUri,
} from './musicCollectionLinkUtils'
import { isStaticTunebookNetUrl } from './syncSourcesStore'
import { curatedScrapeUrl } from './resourceBase'
import { appendFreshLoadParam } from './appFreshLoadUtils'
import { shareOrigin } from './shareTunebookUtils'
import { linkUriString } from './tuneLinkUri'
import { normalizePerformanceSetItems } from './performanceSetStore'
import { deflateSync, inflateSync } from 'fflate'

/** Compact payload version shared by playlist + set public links. */
export const PUBLIC_SCRAPE_SHARE_VERSION = 2
export const PUBLIC_SCRAPE_SHARE_VERSION_V1 = 1
export const COMPRESSED_PREFIX = 'z.'

/** QR binary capacity for version 40 / level L (qrcode.react throws above this). */
export const QR_CODE_MAX_BINARY_CHARS = 2953

function parseSourceUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) {
    try { return new URL(raw) } catch (e) { return null }
  }
  if (raw.startsWith('/')) {
    try { return new URL(raw, 'https://tunebook.net') } catch (e) { return null }
  }
  try { return new URL(raw, 'https://tunebook.net') } catch (e) { return null }
}

/** Extract scrape/*.abc filename from a static tunebook.net /scrape URL. */
export function scrapeFilenameFromUrl(url) {
  const parsed = parseSourceUrl(url)
  if (!parsed) {
    const raw = String(url || '').trim()
    if (raw.indexOf('scrape/') === 0) return raw.slice('scrape/'.length)
    if (raw.indexOf('/scrape/') === 0) return raw.slice('/scrape/'.length)
    return null
  }
  const path = parsed.pathname || ''
  const idx = path.indexOf('/scrape/')
  if (idx === -1) return null
  const file = path.slice(idx + '/scrape/'.length).replace(/^\/+/, '')
  return file || null
}

/**
 * Resolve a published scrape ref for a tune, or null if not publicly available.
 */
export function resolveTunePublishedScrapeRef(tune) {
  if (!tune || tune.id == null || String(tune.id).trim() === '') return null
  const tuneId = String(tune.id).trim()

  const src = String(tune.srcUrl || '').trim()
  if (src && isStaticTunebookNetUrl(src)) {
    const file = scrapeFilenameFromUrl(src)
    if (file) {
      return { scrapeFile: file, tuneId: tuneId, via: 'srcUrl' }
    }
  }

  const books = Array.isArray(tune.books) ? tune.books : []
  for (let i = 0; i < books.length; i += 1) {
    const book = books[i]
    if (!isPublishableBook(book)) continue
    const file = scrapeFileForBook(book)
    if (!file) continue
    return { scrapeFile: file, tuneId: tuneId, via: 'book', book: String(book).trim() }
  }

  return null
}

export function shareOffersVariantChoice(publishedAnalysis) {
  return !!(publishedAnalysis && publishedAnalysis.ok)
}

export function defaultShareVariant(mediaAnalysis) {
  if (mediaAnalysis && !mediaAnalysis.ok && Array.isArray(mediaAnalysis.issues) && mediaAnalysis.issues.length) {
    return 'google'
  }
  return 'public'
}

export function buildPublishedShareWarning(missing) {
  const list = Array.isArray(missing) ? missing : []
  if (!list.length) return ''
  const names = list.slice(0, 3).map(function(entry) {
    return entry && entry.name ? entry.name : 'unknown'
  })
  const more = list.length > 3 ? ' +' + (list.length - 3) : ''
  return 'Needs Google share — some tunes aren’t published'
    + (names.length ? ' (' + names.join(', ') + more + ')' : '')
}

export function buildShareMediaWarning(issues) {
  const list = Array.isArray(issues) ? issues : []
  if (!list.length) return ''
  const names = []
  const seenNames = {}
  list.forEach(function(issue) {
    const name = issue && issue.name ? issue.name : ''
    if (!name || seenNames[name]) return
    seenNames[name] = true
    names.push(name)
  })
  const shown = names.slice(0, 3)
  const more = names.length > 3 ? ' +' + (names.length - 3) : ''
  let msg = 'Some media won’t play for others (library / Drive / recordings).'
  if (shown.length) msg += ' Affected: ' + shown.join(', ') + more + '.'
  return msg
}

function isGoogleDriveMediaUri(uri) {
  const src = String(uri || '').trim().toLowerCase()
  if (!src) return false
  if (src.indexOf('drive.google.com') >= 0) return true
  if (src.indexOf('docs.google.com') >= 0 && src.indexOf('/uc') >= 0) return true
  if (src.indexOf('googleusercontent.com') >= 0) return true
  return false
}

function isLocalOnlyMediaUri(uri) {
  const src = String(uri || '').trim()
  if (!src) return false
  if (/^blob:/i.test(src)) return true
  if (/^file:/i.test(src)) return true
  try {
    const parsed = new URL(src)
    const host = String(parsed.hostname || '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1'
  } catch (e) {
    return false
  }
}

export function classifyShareMediaLinkSource(link) {
  if (!link) return null

  if (isOwnedMediaLink(link)) {
    return { kind: 'owned-recording', label: 'recordings' }
  }

  const uri = linkUriString(link)
  const entryId = link.collectionEntryId != null ? String(link.collectionEntryId).trim() : ''
  if (
    entryId
    || isMusicCollectionLinkUri(uri)
    || isMusicCollectionByEntryUri(uri)
  ) {
    return { kind: 'library', label: 'library' }
  }

  if (link.googleId || isGoogleDriveMediaUri(uri)) {
    return { kind: 'google-drive', label: 'Google Drive' }
  }

  if (isLocalOnlyMediaUri(uri)) {
    return { kind: 'local', label: 'local' }
  }

  return null
}

function collectItemMediaLinks(item, tune) {
  if (!tune || !Array.isArray(tune.links) || !tune.links.length) return []
  if (item && item.linkIndex != null) {
    const idx = parseInt(item.linkIndex, 10)
    if (!isNaN(idx) && idx >= 0 && idx < tune.links.length && tune.links[idx]) {
      return [{ link: tune.links[idx], linkIndex: idx }]
    }
  }
  return tune.links.map(function(link, linkIndex) {
    return { link: link, linkIndex: linkIndex }
  }).filter(function(entry) {
    return !!(entry.link && (linkUriString(entry.link) || entry.link.recordingId || entry.link.googleId || entry.link.collectionEntryId))
  })
}

/**
 * Analyze private media for an ordered list of { tuneId, linkIndex? } items.
 */
export function analyzeShareMediaPlayability(items, tunes) {
  const list = Array.isArray(items) ? items : []
  const issues = []
  const seen = {}

  list.forEach(function(item, index) {
    const tuneId = item && item.tuneId != null ? String(item.tuneId).trim() : ''
    if (!tuneId) return
    const tune = tunes && tunes[tuneId] ? tunes[tuneId] : null
    if (!tune) return

    collectItemMediaLinks(item, tune).forEach(function(entry) {
      const source = classifyShareMediaLinkSource(entry.link)
      if (!source) return
      const key = tuneId + '\0' + entry.linkIndex + '\0' + source.kind
      if (seen[key]) return
      seen[key] = true
      issues.push({
        index: index,
        tuneId: tuneId,
        name: (tune.name && String(tune.name).trim()) || tuneId,
        linkIndex: entry.linkIndex,
        linkTitle: (entry.link.title && String(entry.link.title).trim())
          || ('Link ' + (entry.linkIndex + 1)),
        kind: source.kind,
        label: source.label,
      })
    })
  })

  return {
    ok: issues.length === 0,
    issues: issues,
    totalItems: list.length,
    warning: issues.length ? buildShareMediaWarning(issues) : '',
  }
}

function analyzeItemsPublishedShare(items, tunes) {
  const list = Array.isArray(items) ? items : []
  const missing = []
  const refs = []
  const seen = {}

  list.forEach(function(item, index) {
    const tuneId = item && item.tuneId != null ? String(item.tuneId).trim() : ''
    if (!tuneId) {
      missing.push({
        index: index,
        tuneId: null,
        name: 'Untitled item',
        reason: 'missing-tune-id',
      })
      return
    }
    const tune = tunes && tunes[tuneId] ? tunes[tuneId] : null
    if (!tune) {
      missing.push({
        index: index,
        tuneId: tuneId,
        name: 'Missing tune',
        reason: 'tune-not-in-library',
      })
      return
    }
    const ref = resolveTunePublishedScrapeRef(tune)
    if (!ref) {
      missing.push({
        index: index,
        tuneId: tuneId,
        name: (tune.name && String(tune.name).trim()) || tuneId,
        reason: 'not-published-scrape',
      })
      return
    }
    const key = ref.scrapeFile + '\0' + ref.tuneId
    if (seen[key]) return
    seen[key] = true
    refs.push(ref)
  })

  const ok = list.length > 0 && missing.length === 0
  return {
    ok: ok,
    refs: refs,
    missing: missing,
    totalItems: list.length,
    warning: ok ? '' : buildPublishedShareWarning(missing),
  }
}

export function itemsFromPlaylistOrQueue(playlistOrQueue) {
  const source = playlistOrQueue || {}
  if (Array.isArray(source.items)) return source.items
  return []
}

export function itemsFromPerformanceSet(setRecord) {
  return normalizePerformanceSetItems(setRecord && setRecord.items).map(function(item) {
    return {
      tuneId: item && item.tuneId != null ? String(item.tuneId) : '',
      linkIndex: item && item.linkIndex != null ? item.linkIndex : undefined,
    }
  }).filter(function(item) { return !!item.tuneId })
}

export function analyzePlaylistPublishedShare(playlistOrQueue, tunes) {
  return analyzeItemsPublishedShare(itemsFromPlaylistOrQueue(playlistOrQueue), tunes)
}

export function analyzeSetPublishedShare(setRecord, tunes) {
  return analyzeItemsPublishedShare(itemsFromPerformanceSet(setRecord), tunes)
}

export function analyzeTunePublishedShare(tune) {
  const ref = resolveTunePublishedScrapeRef(tune)
  if (!ref) {
    const name = (tune && tune.name && String(tune.name).trim()) || (tune && tune.id) || 'Tune'
    return {
      ok: false,
      refs: [],
      missing: [{ tuneId: tune && tune.id, name: name, reason: 'not-published-scrape' }],
      totalItems: 1,
      warning: buildPublishedShareWarning([{ name: name }]),
      ref: null,
    }
  }
  return {
    ok: true,
    refs: [ref],
    missing: [],
    totalItems: 1,
    warning: '',
    ref: ref,
  }
}

export function analyzeBookPublishedShare(bookName) {
  const name = String(bookName || '').trim()
  if (!name || !isPublishableBook(name)) {
    return {
      ok: false,
      scrapeFile: null,
      bookName: name,
      warning: name
        ? 'Needs Google share — book isn’t published'
        : 'Needs Google share',
    }
  }
  const scrapeFile = scrapeFileForBook(name)
  if (!scrapeFile) {
    return {
      ok: false,
      scrapeFile: null,
      bookName: name,
      warning: 'Needs Google share — book isn’t published',
    }
  }
  return {
    ok: true,
    scrapeFile: scrapeFile,
    bookName: name,
    warning: '',
  }
}

export function analyzeShareMediaForTuneIds(tuneIds, tunes) {
  const items = (tuneIds || []).map(function(id) {
    return { tuneId: id }
  })
  return analyzeShareMediaPlayability(items, tunes)
}

export function analyzeShareMediaForPlaylist(playlistOrQueue, tunes) {
  return analyzeShareMediaPlayability(itemsFromPlaylistOrQueue(playlistOrQueue), tunes)
}

export function analyzeShareMediaForSet(setRecord, tunes) {
  return analyzeShareMediaPlayability(itemsFromPerformanceSet(setRecord), tunes)
}

export function analyzeShareMediaForTune(tune) {
  if (!tune || tune.id == null) {
    return { ok: true, issues: [], totalItems: 0, warning: '' }
  }
  return analyzeShareMediaPlayability([{ tuneId: String(tune.id) }], { [String(tune.id)]: tune })
}

export function shortenScrapeFileName(file) {
  const raw = String(file || '').trim()
  if (/\.abc$/i.test(raw)) return raw.slice(0, -4)
  return raw
}

export function expandScrapeFileName(file) {
  const raw = String(file || '').trim()
  if (!raw) return ''
  if (/\.[a-z0-9]+$/i.test(raw)) return raw
  return raw + '.abc'
}

export function bytesToBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  if (typeof btoa === 'function') {
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function base64UrlToBytes(encoded) {
  let b64 = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  if (typeof atob === 'function') {
    const binary = atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
    return out
  }
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export function utf8BytesFromString(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str)
  return new Uint8Array(Buffer.from(str, 'utf8'))
}

export function stringFromUtf8Bytes(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes)
  return Buffer.from(bytes).toString('utf8')
}

export function buildPublicScrapeSharePayload(name, refs, defaultName) {
  const fileIndex = {}
  const files = []
  const items = []
  ;(refs || []).forEach(function(ref) {
    if (!ref || !ref.scrapeFile || ref.tuneId == null) return
    const scrapeFile = String(ref.scrapeFile).trim()
    const tuneId = String(ref.tuneId).trim()
    if (!scrapeFile || !tuneId) return
    let idx = fileIndex[scrapeFile]
    if (idx == null) {
      idx = files.length
      fileIndex[scrapeFile] = idx
      files.push(shortenScrapeFileName(scrapeFile))
    }
    items.push([idx, tuneId])
  })
  return {
    v: PUBLIC_SCRAPE_SHARE_VERSION,
    n: String(name || '').trim() || defaultName || 'Shared',
    f: files,
    i: items,
  }
}

export function encodePublicScrapeSharePayload(payload) {
  const json = JSON.stringify(payload || {})
  const rawBytes = utf8BytesFromString(json)
  const plain = bytesToBase64Url(rawBytes)
  try {
    const compressed = deflateSync(rawBytes, { level: 9 })
    const z = COMPRESSED_PREFIX + bytesToBase64Url(compressed)
    return z.length < plain.length ? z : plain
  } catch (e) {
    return plain
  }
}

function parsePublicScrapeShareObject(parsed, defaultName) {
  if (!parsed || typeof parsed !== 'object') return null
  const version = Number(parsed.v)
  const name = String(parsed.n || '').trim() || defaultName || 'Shared'
  const refs = []

  if (version === PUBLIC_SCRAPE_SHARE_VERSION_V1) {
    if (!Array.isArray(parsed.i)) return null
    parsed.i.forEach(function(pair) {
      if (!Array.isArray(pair) || pair.length < 2) return
      const scrapeFile = String(pair[0] || '').trim()
      const tuneId = String(pair[1] || '').trim()
      if (!scrapeFile || !tuneId) return
      refs.push({ scrapeFile: scrapeFile, tuneId: tuneId })
    })
  } else if (version === PUBLIC_SCRAPE_SHARE_VERSION) {
    const files = Array.isArray(parsed.f) ? parsed.f : []
    if (!Array.isArray(parsed.i)) return null
    parsed.i.forEach(function(pair) {
      if (!Array.isArray(pair) || pair.length < 2) return
      const fileIdx = parseInt(pair[0], 10)
      const tuneId = String(pair[1] || '').trim()
      if (isNaN(fileIdx) || fileIdx < 0 || fileIdx >= files.length || !tuneId) return
      const scrapeFile = expandScrapeFileName(files[fileIdx])
      if (!scrapeFile) return
      refs.push({ scrapeFile: scrapeFile, tuneId: tuneId })
    })
  } else {
    return null
  }

  if (!refs.length) return null
  return {
    v: version,
    name: name,
    refs: refs,
  }
}

export function decodePublicScrapeSharePayload(encoded, defaultName) {
  const raw = String(encoded || '').trim()
  if (!raw) return null
  try {
    let json
    if (raw.indexOf(COMPRESSED_PREFIX) === 0) {
      const bytes = inflateSync(base64UrlToBytes(raw.slice(COMPRESSED_PREFIX.length)))
      json = stringFromUtf8Bytes(bytes)
    } else {
      let b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      if (typeof atob === 'function') {
        json = decodeURIComponent(escape(atob(b64)))
      } else {
        json = Buffer.from(b64, 'base64').toString('utf8')
      }
    }
    return parsePublicScrapeShareObject(JSON.parse(json), defaultName)
  } catch (e) {
    return null
  }
}

export function groupPublicRefsByScrapeFile(refs) {
  const groups = {}
  ;(refs || []).forEach(function(ref) {
    if (!ref || !ref.scrapeFile || !ref.tuneId) return
    if (!groups[ref.scrapeFile]) groups[ref.scrapeFile] = []
    if (groups[ref.scrapeFile].indexOf(ref.tuneId) === -1) {
      groups[ref.scrapeFile].push(ref.tuneId)
    }
  })
  return groups
}

export function curatedScrapeUrlForShareRef(scrapeFile) {
  return curatedScrapeUrl(scrapeFile)
}

export function isQrEncodableShareLink(link) {
  const value = String(link || '')
  if (!value) return false
  return value.length <= QR_CODE_MAX_BINARY_CHARS
}

export function qrSafeShareLink(link) {
  const full = String(link || '')
  if (!full) return ''
  if (isQrEncodableShareLink(full)) return full
  const withoutFresh = full
    .replace(/\?fresh=1&/g, '?')
    .replace(/[?&]fresh=1$/g, '')
    .replace(/\?&/g, '?')
    .replace(/\?$/g, '')
  if (withoutFresh !== full && isQrEncodableShareLink(withoutFresh)) return withoutFresh
  return ''
}

export function buildTunePublicShareLink(options) {
  const opts = options || {}
  const tune = opts.tune
  const analysis = opts.analysis || analyzeTunePublishedShare(tune)
  if (!analysis || !analysis.ok || !analysis.ref) return ''
  const scrapeUrl = curatedScrapeUrl(analysis.ref.scrapeFile)
  const base = shareOrigin(opts.origin)
  const link = base + '/#/importlink/' + encodeURIComponent(scrapeUrl)
    + '/tune/' + encodeURIComponent(analysis.ref.tuneId) + '/play'
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}

export function buildBookPublicShareLink(options) {
  const opts = options || {}
  const bookName = opts.bookName
  const analysis = opts.analysis || analyzeBookPublishedShare(bookName)
  if (!analysis || !analysis.ok || !analysis.scrapeFile) return ''
  const scrapeUrl = curatedScrapeUrl(analysis.scrapeFile)
  const base = shareOrigin(opts.origin)
  const link = base + '/#/importlink/' + encodeURIComponent(scrapeUrl)
    + '/book/' + encodeURIComponent(analysis.bookName)
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}

export function buildSetPublicShareLink(options) {
  const opts = options || {}
  const analysis = opts.analysis || analyzeSetPublishedShare(opts.set, opts.tunes)
  if (!analysis || !analysis.ok) return ''
  const payload = buildPublicScrapeSharePayload(
    opts.name || (opts.set && opts.set.name),
    analysis.refs,
    'Set'
  )
  const encoded = encodePublicScrapeSharePayload(payload)
  if (!encoded) return ''
  const base = shareOrigin(opts.origin)
  const link = base + '/#/importset/' + encoded
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}
