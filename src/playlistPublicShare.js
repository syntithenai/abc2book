/**
 * Public playlist share links encode ordered scrape tune refs so recipients can
 * import without signing in or reading the sharer's Google tunebook.
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
import { deflateSync, inflateSync } from 'fflate'

/** Current encoder version (compact grouped scrape files). */
export const PLAYLIST_PUBLIC_SHARE_VERSION = 2
/** Legacy flat [scrapeFile, tuneId] pairs. */
export const PLAYLIST_PUBLIC_SHARE_VERSION_V1 = 1
const COMPRESSED_PREFIX = 'z.'

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
 * Prefers srcUrl when it points at /scrape/, else a publishable B: book.
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

export function playlistItemsFromRecordOrQueue(playlistOrQueue) {
  const source = playlistOrQueue || {}
  if (Array.isArray(source.items)) return source.items
  return []
}

const MEDIA_SOURCE_LABELS = {
  library: 'your music library',
  'owned-recording': 'your recordings',
  'google-drive': 'Google Drive',
  local: 'a local-only URL',
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

/**
 * Classify a tune media link that recipients cannot play without the sharer's
 * private library / Drive access. Returns null for YouTube and other public URLs.
 */
export function classifyPlaylistMediaLinkSource(link) {
  if (!link) return null

  if (isOwnedMediaLink(link)) {
    return {
      kind: 'owned-recording',
      label: MEDIA_SOURCE_LABELS['owned-recording'],
    }
  }

  const uri = linkUriString(link)
  const entryId = link.collectionEntryId != null ? String(link.collectionEntryId).trim() : ''
  if (
    entryId
    || isMusicCollectionLinkUri(uri)
    || isMusicCollectionByEntryUri(uri)
  ) {
    return {
      kind: 'library',
      label: MEDIA_SOURCE_LABELS.library,
    }
  }

  if (link.googleId || isGoogleDriveMediaUri(uri)) {
    return {
      kind: 'google-drive',
      label: MEDIA_SOURCE_LABELS['google-drive'],
    }
  }

  if (isLocalOnlyMediaUri(uri)) {
    return {
      kind: 'local',
      label: MEDIA_SOURCE_LABELS.local,
    }
  }

  return null
}

function collectPlaylistItemMediaLinks(item, tune) {
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
 * Find playlist media that will not play for recipients (library, Drive, etc.).
 */
export function analyzePlaylistShareMediaPlayability(playlistOrQueue, tunes) {
  const items = playlistItemsFromRecordOrQueue(playlistOrQueue)
  const issues = []
  const seen = {}

  items.forEach(function(item, index) {
    const tuneId = item && item.tuneId != null ? String(item.tuneId).trim() : ''
    if (!tuneId) return
    const tune = tunes && tunes[tuneId] ? tunes[tuneId] : null
    if (!tune) return

    const mediaLinks = collectPlaylistItemMediaLinks(item, tune)
    mediaLinks.forEach(function(entry) {
      const source = classifyPlaylistMediaLinkSource(entry.link)
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
    totalItems: items.length,
    warning: issues.length
      ? buildPlaylistShareMediaWarning(issues, { shareMode: 'generic' })
      : '',
  }
}

/**
 * True when a public scrape share is possible — sharers can still choose a
 * Google/login link instead (ongoing tunebook sync, and private media upload).
 */
export function playlistShareOffersVariantChoice(publishedAnalysis) {
  return !!(publishedAnalysis && publishedAnalysis.ok)
}

/**
 * Default share variant when both public and Google links are available.
 * Prefer Google when private media would otherwise not play for recipients.
 */
export function defaultPlaylistShareVariant(mediaAnalysis) {
  if (mediaAnalysis && !mediaAnalysis.ok && Array.isArray(mediaAnalysis.issues) && mediaAnalysis.issues.length) {
    return 'google'
  }
  return 'public'
}

export function buildPlaylistShareMediaWarning(issues, options) {
  const list = Array.isArray(issues) ? issues : []
  if (!list.length) return ''
  const opts = options || {}
  const shareMode = opts.shareMode || 'generic'

  const kindCounts = {}
  list.forEach(function(issue) {
    const kind = issue && issue.kind ? issue.kind : 'local'
    kindCounts[kind] = (kindCounts[kind] || 0) + 1
  })
  const sourceParts = Object.keys(kindCounts).map(function(kind) {
    const label = MEDIA_SOURCE_LABELS[kind] || kind
    return label
  })
  // Unique labels, stable order: library, owned, drive, local
  const order = ['library', 'owned-recording', 'google-drive', 'local']
  const uniqueLabels = []
  order.forEach(function(kind) {
    if (kindCounts[kind] && uniqueLabels.indexOf(MEDIA_SOURCE_LABELS[kind]) === -1) {
      uniqueLabels.push(MEDIA_SOURCE_LABELS[kind])
    }
  })
  sourceParts.forEach(function(label) {
    if (uniqueLabels.indexOf(label) === -1) uniqueLabels.push(label)
  })

  const names = []
  const seenNames = {}
  list.forEach(function(issue) {
    const name = issue && issue.name ? issue.name : 'unknown'
    if (seenNames[name]) return
    seenNames[name] = true
    names.push(name)
  })
  const shown = names.slice(0, 5)
  const more = names.length > 5 ? ' (+' + (names.length - 5) + ' more)' : ''

  let outcome
  if (shareMode === 'public') {
    outcome = 'Recipients of a public scrape share will not be able to play that media — only publicly published links (for example YouTube) from scrape collections will work.'
  } else if (shareMode === 'google') {
    outcome = 'Recipients will only be able to play that media if it is uploaded to Google Drive and shared publicly during this share; library and private Drive links otherwise will not play for them.'
  } else {
    outcome = 'Recipients may not be able to play that media.'
  }

  return (
    'Some playlist media is sourced from '
    + uniqueLabels.join(', ')
    + '. '
    + outcome
    + ' Affected: '
    + shown.join(', ')
    + more
    + '.'
  )
}

/**
 * Analyze whether a playlist can be shared via encoded public scrape refs.
 */
export function analyzePlaylistPublishedShare(playlistOrQueue, tunes) {
  const items = playlistItemsFromRecordOrQueue(playlistOrQueue)
  const missing = []
  const refs = []
  const seen = {}

  items.forEach(function(item, index) {
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

  const ok = items.length > 0 && missing.length === 0
  return {
    ok: ok,
    refs: refs,
    missing: missing,
    totalItems: items.length,
    warning: ok
      ? ''
      : buildPlaylistPublishedShareWarning(missing, items.length),
  }
}

export function buildPlaylistPublishedShareWarning(missing, totalItems) {
  const list = Array.isArray(missing) ? missing : []
  if (!list.length) return ''
  const names = list.slice(0, 5).map(function(entry) {
    return entry && entry.name ? entry.name : 'unknown'
  })
  const more = list.length > 5 ? ' (+' + (list.length - 5) + ' more)' : ''
  return (
    'This playlist cannot use a public scrape-only share link because '
    + list.length + ' of ' + (totalItems || list.length)
    + ' item' + (list.length === 1 ? ' is' : 's are')
    + ' not available from published tunebook.net collections (scrape/). '
    + 'Recipients will need to sign in and open your shared Google tunebook to import playlist details. '
    + 'Unavailable: ' + names.join(', ') + more + '.'
  )
}

export function buildPlaylistPublicSharePayload(name, refs) {
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
    v: PLAYLIST_PUBLIC_SHARE_VERSION,
    n: String(name || '').trim() || 'Playlist',
    f: files,
    i: items,
  }
}

function shortenScrapeFileName(file) {
  const raw = String(file || '').trim()
  if (/\.abc$/i.test(raw)) return raw.slice(0, -4)
  return raw
}

function expandScrapeFileName(file) {
  const raw = String(file || '').trim()
  if (!raw) return ''
  if (/\.[a-z0-9]+$/i.test(raw)) return raw
  return raw + '.abc'
}

function bytesToBase64Url(bytes) {
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

function base64UrlToBytes(encoded) {
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

function utf8BytesFromString(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str)
  return new Uint8Array(Buffer.from(str, 'utf8'))
}

function stringFromUtf8Bytes(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes)
  return Buffer.from(bytes).toString('utf8')
}

export function encodePlaylistPublicSharePayload(payload) {
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

function parsePlaylistPublicShareObject(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const version = Number(parsed.v)
  const name = String(parsed.n || '').trim() || 'Playlist'
  const refs = []

  if (version === PLAYLIST_PUBLIC_SHARE_VERSION_V1) {
    if (!Array.isArray(parsed.i)) return null
    parsed.i.forEach(function(pair) {
      if (!Array.isArray(pair) || pair.length < 2) return
      const scrapeFile = String(pair[0] || '').trim()
      const tuneId = String(pair[1] || '').trim()
      if (!scrapeFile || !tuneId) return
      refs.push({ scrapeFile: scrapeFile, tuneId: tuneId })
    })
  } else if (version === PLAYLIST_PUBLIC_SHARE_VERSION) {
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

export function decodePlaylistPublicSharePayload(encoded) {
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
    return parsePlaylistPublicShareObject(JSON.parse(json))
  } catch (e) {
    return null
  }
}

export function isQrEncodableShareLink(link) {
  const value = String(link || '')
  if (!value) return false
  // qrcode.react uses binary mode for mixed-case URLs; stay under version-40 / L.
  return value.length <= QR_CODE_MAX_BINARY_CHARS
}

/**
 * Prefer a QR-safe variant of a share link (drop fresh=1 if that tips capacity).
 */
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

export function buildPlaylistPublicShareLink(options) {
  const opts = options || {}
  const analysis = opts.analysis || analyzePlaylistPublishedShare(opts.playlist, opts.tunes)
  if (!analysis || !analysis.ok) return ''
  const payload = buildPlaylistPublicSharePayload(opts.name || (opts.playlist && opts.playlist.name), analysis.refs)
  const encoded = encodePlaylistPublicSharePayload(payload)
  if (!encoded) return ''
  const base = shareOrigin(opts.origin)
  const link = base + '/#/importplaylist/' + encoded
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}

export function groupPlaylistPublicRefsByScrapeFile(refs) {
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

export function curatedScrapeUrlForPlaylistRef(scrapeFile) {
  return curatedScrapeUrl(scrapeFile)
}
