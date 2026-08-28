/**
 * Ultimate Guitar discovery + sheet fetch via TuneBook Helper.
 * Hosted resolvers are often blocked by UG on cloud IPs; the extension fetches
 * pages from the user's browser session, then the resolver only extracts sheets.
 */

import { scoreTitleArtistMatch } from './notationMatchUtils'
import {
  fetchPageHtmlViaExtension,
  isUltimateGuitarPageUrl,
  isYoutubeExtensionConnected,
} from './youtubeExtensionClient'
import { fetchViaMediaProxy } from './mediaProxyClient'
import { CHORDS_LIGHT_ERROR } from './chordsSearchLight'
import { parseNdjsonLine } from './ndjsonParse'

const UG_JS_STORE_RE = /(?:class="[^"]*js-store[^"]*"[^>]*data-content="([^"]+)"|data-content="([^"]+)"[^>]*class="[^"]*js-store[^"]*")/i
const MAX_EXTENSION_SHEETS = 3
const CHORDS_ACCEPT_HEADER = 'application/x-ndjson, application/json'

function decodeHtmlEntities(value) {
  const text = String(value || '')
  if (typeof document !== 'undefined' && document.createElement) {
    const el = document.createElement('textarea')
    el.innerHTML = text
    return el.value
  }
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function buildUltimateGuitarSearchUrl(title, artist) {
  const query = [title, artist].map(function(part) {
    return String(part || '').trim()
  }).filter(Boolean).join(' ').trim()
  if (!query) return ''
  return (
    'https://www.ultimate-guitar.com/search.php?search_type=title&type=300&value='
    + encodeURIComponent(query)
  )
}

function parseUgJsStore(htmlText) {
  if (!htmlText) return null
  const match = UG_JS_STORE_RE.exec(htmlText)
  const encoded = match && (match[1] || match[2])
  if (!encoded) return null
  try {
    return JSON.parse(decodeHtmlEntities(encoded))
  } catch (e) {
    return null
  }
}

function walkUgTabEntries(node, out) {
  if (!node) return
  if (Array.isArray(node)) {
    node.forEach(function(item) { walkUgTabEntries(item, out) })
    return
  }
  if (typeof node !== 'object') return
  const tabUrl = node.tab_url || node.tabUrl
  if (typeof tabUrl === 'string' && tabUrl.trim()) {
    out.push(node)
  }
  Object.keys(node).forEach(function(key) {
    walkUgTabEntries(node[key], out)
  })
}

function validateUgChordUrl(rawUrl) {
  const url = String(rawUrl || '').trim()
  if (!url || !isUltimateGuitarPageUrl(url)) return ''
  const lower = url.toLowerCase()
  if (lower.indexOf('-chords-') < 0 && lower.indexOf('/chords/') < 0) {
    return ''
  }
  return url
}

/**
 * Parse Ultimate Guitar search-page HTML into ranked chord tab candidates.
 */
export function ultimateGuitarSearchCandidatesFromHtml(htmlText, title, artist) {
  const store = parseUgJsStore(htmlText)
  if (!store) return []
  const rows = []
  walkUgTabEntries(store, rows)
  const candidates = []
  const seen = new Set()
  rows.forEach(function(row) {
    const tabType = String(row.type || row.type_name || '').trim().toLowerCase()
    if (tabType && tabType !== 'chords' && tabType !== 'chord') return
    const validated = validateUgChordUrl(row.tab_url || row.tabUrl)
    if (!validated || seen.has(validated)) return
    if (!tabType && validated.toLowerCase().indexOf('-chords-') < 0) return
    seen.add(validated)
    const songName = String(row.song_name || row.songName || title || '').trim()
    const artistName = String(row.artist_name || row.artistName || artist || '').trim()
    let score = scoreTitleArtistMatch(songName, artistName, title, artist)
    const votes = Number(row.votes) || 0
    const rating = Number(row.rating) || 0
    score += Math.min(220, Math.floor(votes / 50)) + Math.floor(rating * 8)
    score += 200
    candidates.push({
      url: validated,
      title: songName || title,
      artist: artistName || artist,
      source: 'tabs.ultimate-guitar.com',
      score: score,
    })
  })
  candidates.sort(function(a, b) { return b.score - a.score })
  return candidates
}

async function extractChordSheetViaResolver(options) {
  // Dynamic import avoids a static cycle with chordsSearchClient.
  const { normalizeChordsSearch } = await import('./chordsSearchClient')
  const response = await fetchViaMediaProxy('/search-chords', options.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: options.title || '',
      artist: options.artist || '',
      url: options.url || '',
      pageHtml: options.pageHtml || '',
    }),
    signal: options.signal,
    headers: {
      Accept: CHORDS_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  })

  const contentType = response.headers.get('content-type') || ''
  if (contentType.indexOf('application/x-ndjson') >= 0 && response.body
    && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result = null
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.trim()) continue
        const event = parseNdjsonLine(line)
        if (event && event.type === 'result') {
          result = normalizeChordsSearch(event.body)
        } else if (event && event.type === 'error') {
          throw new Error(event.message || 'Chords extract failed')
        }
      }
    }
    if (buffer.trim()) {
      const event = parseNdjsonLine(buffer)
      if (event && event.type === 'result') {
        result = normalizeChordsSearch(event.body)
      } else if (event && event.type === 'error') {
        throw new Error(event.message || 'Chords extract failed')
      }
    }
    if (!result) throw new Error('Chords extract stream ended without a result')
    return result
  }

  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable chords extract response')
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Chords extract failed')
  }
  return normalizeChordsSearch(body)
}

/**
 * When TuneBook Helper is connected, discover + fetch UG sheets in the browser
 * and only ask the resolver to extract (no cloud IP scrape of UG).
 */
export async function searchChordsViaUltimateGuitarExtension(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()
  if (!title) {
    throw new Error('Song title is required')
  }

  const connected = await isYoutubeExtensionConnected()
  if (!connected) {
    throw new Error('TuneBook Helper extension is not connected')
  }

  const searchUrl = buildUltimateGuitarSearchUrl(title, artist)
  if (!searchUrl) {
    throw new Error(CHORDS_LIGHT_ERROR)
  }

  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Searching Ultimate Guitar via TuneBook Helper…', 0.08, 'extension')
  }

  const searchPage = await fetchPageHtmlViaExtension(searchUrl)
  if (opts.signal && opts.signal.aborted) {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    throw err
  }

  const candidates = ultimateGuitarSearchCandidatesFromHtml(
    searchPage && searchPage.html,
    title,
    artist
  )
  if (!candidates.length) {
    throw new Error(CHORDS_LIGHT_ERROR)
  }

  const sheets = []
  const limit = Math.min(MAX_EXTENSION_SHEETS, candidates.length)
  for (let i = 0; i < limit; i += 1) {
    if (opts.signal && opts.signal.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      throw err
    }
    const candidate = candidates[i]
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(
        'Fetching Ultimate Guitar sheet ' + (i + 1) + ' of ' + limit + ' via Helper…',
        0.15 + (0.55 * (i + 1) / limit),
        'extension'
      )
    }
    let page
    try {
      page = await fetchPageHtmlViaExtension(candidate.url)
    } catch (fetchErr) {
      continue
    }
    try {
      const extracted = await extractChordSheetViaResolver({
        title: candidate.title || title,
        artist: candidate.artist || artist,
        url: (page && page.finalUrl) || candidate.url,
        pageHtml: page && page.html,
        accessToken: opts.accessToken,
        signal: opts.signal,
      })
      if (extracted && !extracted.empty) {
        if (extracted.multiple && Array.isArray(extracted.candidates)) {
          sheets.push.apply(sheets, extracted.candidates)
        } else {
          sheets.push(extracted)
        }
      }
    } catch (extractErr) {
      // Try the next UG candidate.
    }
  }

  if (!sheets.length) {
    throw new Error(CHORDS_LIGHT_ERROR)
  }
  if (sheets.length === 1) {
    return sheets[0]
  }
  return {
    multiple: true,
    candidates: sheets,
  }
}
