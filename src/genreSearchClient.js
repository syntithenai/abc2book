import axios from 'axios'
import { resolveArtistMbid } from './artistDiscographyClient'
import {
  BIBLIO_CONFIDENCE_HIGH,
  BIBLIO_CONFIDENCE_LOW,
  BIBLIO_CONFIDENCE_MEDIUM,
  isAmbiguousTitle,
  scoreRecordingTitleMatch,
  sortCandidatesByConfidence,
  splitCandidatesByConfidence,
} from './bibliographicSearchUtils'
import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  normalizeInferredGenre,
} from './genreInference'
import { getMusicGenreList } from './musicGenreOptions'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from './externalSearchLinks'
import { isGenericArtist, searchRecordingsScoped } from './recordingArtistsClient'

const GENRE_ACCEPT_HEADER = 'application/x-ndjson, application/json'
const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'

function normalizeSingleGenreResult(body) {
  const genre = typeof body.genre === 'string' ? body.genre.trim() : ''
  if (!genre) {
    throw new Error('Genre search returned no genre')
  }
  return {
    genre: genre,
    preview: typeof body.preview === 'string' && body.preview.trim()
      ? body.preview.trim()
      : genre,
    source: typeof body.source === 'string' ? body.source : '',
    reason: typeof body.reason === 'string' ? body.reason : '',
    confidence: typeof body.confidence === 'string' ? body.confidence : '',
  }
}

export function normalizeGenreSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid genre search response')
  }
  if (body.error) {
    throw new Error(body.error)
  }
  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleGenreResult(candidate)
    })
    if (candidates.length === 0) {
      throw new Error('Genre search returned no candidates')
    }
    return { empty: false, multiple: true, candidates: candidates }
  }
  if (body.empty === true) {
    return { empty: true, candidates: [] }
  }
  return Object.assign({ empty: false, multiple: false }, normalizeSingleGenreResult(body))
}

export function handleGenreSearchStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress(event.message || '', event.progress, event.stage || '')
    }
    return null
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Genre search failed')
  }
  if (event.type === 'result') {
    return normalizeGenreSearch(event.body)
  }
  return null
}

async function parseGenreSearchResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable genre search response')
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Genre search failed')
  }
  return normalizeGenreSearch(body)
}

async function parseStreamingGenreSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseGenreSearchResponse(response)
  }
  const reader = response.body && response.body.getReader
    ? response.body.getReader()
    : null
  if (!reader) {
    return parseGenreSearchResponse(response)
  }
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim()
      if (!line) continue
      const event = JSON.parse(line)
      const result = handleGenreSearchStreamEvent(event, onProgress)
      if (result) return result
    }
  }
  throw new Error('Genre search stream ended without a result')
}

function finishCandidates(candidates) {
  const sorted = sortCandidatesByConfidence(candidates || [])
  const split = splitCandidatesByConfidence(sorted)
  if (!sorted.length) {
    return { empty: true, candidates: [], autoApply: [], suggestions: [] }
  }
  if (sorted.length === 1) {
    return Object.assign({
      empty: false,
      multiple: false,
      autoApply: split.autoApply,
      suggestions: split.suggestions,
    }, sorted[0])
  }
  return {
    empty: false,
    multiple: true,
    candidates: sorted,
    autoApply: split.autoApply,
    suggestions: split.suggestions,
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Exported for tests — word-boundary genre matching in free text. */
export function textContainsGenreLabel(haystack, genre) {
  const key = String(genre || '').trim().toLowerCase()
  if (!key || key.length < 3) return false
  // Word-ish boundaries so "western" does not match "southwestern"
  // and "pop" does not match "popular".
  const pattern = new RegExp('(?:^|[^a-z0-9])' + escapeRegExp(key) + '(?:[^a-z0-9]|$)', 'i')
  return pattern.test(String(haystack || ''))
}

function normalizeTitleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function wikipediaPageMatchesSong(pageTitle, extract, songTitle) {
  const want = normalizeTitleKey(songTitle)
  if (!want) return false
  const haveTitle = normalizeTitleKey(pageTitle)
  const haveExtract = normalizeTitleKey(extract).slice(0, 400)
  if (haveTitle && (haveTitle === want || haveTitle.indexOf(want) >= 0 || want.indexOf(haveTitle) >= 0)) {
    return true
  }
  // Reject place pages etc. unless the extract clearly names the song.
  return !!(haveExtract && haveExtract.indexOf(want) >= 0)
}

function createGenreCollector(currentGenre) {
  const candidates = []
  const seen = {}
  const currentKey = String(currentGenre || '').trim().toLowerCase()

  function push(genre, source, reason, confidence) {
    const label = normalizeInferredGenre(genre) || String(genre || '').trim()
    if (!label) return
    const key = label.toLowerCase()
    if (seen[key]) return
    if (currentKey && key === currentKey) return
    seen[key] = true
    candidates.push({
      genre: label,
      preview: label,
      source: source || 'inference',
      reason: reason || '',
      confidence: confidence || BIBLIO_CONFIDENCE_MEDIUM,
    })
  }

  function pushFromText(text, source, reason, confidence) {
    const haystack = String(text || '')
    if (!haystack.trim()) return
    // Prefer longer genre names so "Progressive Bluegrass" wins over "Bluegrass".
    const genres = getMusicGenreList().slice().sort(function(a, b) {
      return b.length - a.length
    })
    genres.forEach(function(genre) {
      if (candidates.length >= 8) return
      if (textContainsGenreLabel(haystack, genre)) {
        push(genre, source, reason, confidence)
      }
    })
  }

  return {
    push: push,
    pushFromText: pushFromText,
    list: function() { return candidates.slice(0, 8) },
  }
}

/**
 * Sync heuristics from rhythm / title / background only.
 */
export function searchGenreLocal(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()
  const rhythm = String(opts.rhythm || '').trim()
  const backgroundInfo = String(opts.backgroundInfo || '').trim()
  const collector = createGenreCollector(opts.currentGenre)

  const inferred = inferGenreFromSearchContext(buildGenreSearchContext({
    text: backgroundInfo,
    title: title,
    artist: artist,
  }, {
    title: title,
    artist: artist,
    rhythm: rhythm,
  }))
  if (inferred && inferred.genre) {
    collector.push(inferred.genre, 'inference', inferred.reason || '', BIBLIO_CONFIDENCE_HIGH)
  }
  collector.pushFromText(
    [title, artist, rhythm, backgroundInfo].join(' '),
    'title match',
    'matched text',
    BIBLIO_CONFIDENCE_MEDIUM
  )
  return finishCandidates(collector.list())
}

async function fetchWikipediaExtract(title, artist, signal) {
  const queries = []
  const cleanTitle = String(title || '').trim()
  const cleanArtist = String(artist || '').trim()
  if (!cleanTitle) return ''
  // Prefer the bare title first — "Title (song)" often 404s and OpenSearch can
  // return unrelated place pages (e.g. Copperkettle, Ontario).
  queries.push(cleanTitle)
  if (cleanArtist) queries.push(cleanTitle + ' ' + cleanArtist)
  queries.push(cleanTitle + ' (song)')

  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i]
    try {
      const summaryUrl = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
        + encodeURIComponent(query.replace(/ /g, '_'))
      const summaryRes = await axios.get(summaryUrl, {
        signal: signal,
        validateStatus: function(status) { return status >= 200 && status < 500 },
      })
      if (
        summaryRes.status === 200
        && summaryRes.data
        && summaryRes.data.extract
        && wikipediaPageMatchesSong(summaryRes.data.title, summaryRes.data.extract, cleanTitle)
      ) {
        return String(summaryRes.data.extract || '')
      }
      const searchUrl = 'https://en.wikipedia.org/w/api.php?action=opensearch'
        + '&search=' + encodeURIComponent(query)
        + '&limit=5&namespace=0&format=json&origin=*'
      const searchRes = await axios.get(searchUrl, { signal: signal })
      const pageTitles = (searchRes.data && searchRes.data[1]) || []
      for (let p = 0; p < pageTitles.length; p += 1) {
        const pageTitle = pageTitles[p]
        if (!pageTitle) continue
        const pageRes = await axios.get(
          'https://en.wikipedia.org/api/rest_v1/page/summary/'
            + encodeURIComponent(String(pageTitle).replace(/ /g, '_')),
          {
            signal: signal,
            validateStatus: function(status) { return status >= 200 && status < 500 },
          }
        )
        if (
          pageRes.status === 200
          && pageRes.data
          && pageRes.data.extract
          && wikipediaPageMatchesSong(pageRes.data.title || pageTitle, pageRes.data.extract, cleanTitle)
        ) {
          return String(pageRes.data.extract || '')
        }
      }
    } catch (e) {
      // best-effort
    }
  }
  return ''
}

async function fetchMusicBrainzArtistGenres(artist, signal) {
  const name = String(artist || '').trim()
  if (!name || isGenericArtist(name)) return []
  try {
    const resolved = await resolveArtistMbid(name, signal)
    if (!resolved || !resolved.id) return []

    const detailRes = await axios.get(MUSICBRAINZ_BASE + '/artist/' + resolved.id, {
      params: { fmt: 'json', inc: 'tags+genres' },
      signal: signal,
    })
    return collectScoredGenreLabels(detailRes.data || {})
  } catch (e) {
    return []
  }
}

function collectScoredGenreLabels(data) {
  const scored = []
  ;(data.genres || []).forEach(function(entry) {
    const label = entry && entry.name
    if (!label) return
    scored.push({ name: label, count: Number(entry.count) || 0 })
  })
  ;(data.tags || []).forEach(function(entry) {
    const label = entry && entry.name
    if (!label) return
    scored.push({ name: label, count: Number(entry.count) || 0 })
  })
  scored.sort(function(a, b) { return b.count - a.count })
  return scored.map(function(entry) { return entry.name })
}

async function fetchMusicBrainzRecordingGenres(title, artist, signal) {
  const queryTitle = String(title || '').trim()
  if (!queryTitle) return []
  let artistMbid = ''
  const artistName = String(artist || '').trim()
  if (artistName && !isGenericArtist(artistName)) {
    const resolved = await resolveArtistMbid(artistName, signal)
    if (resolved && resolved.id) artistMbid = resolved.id
  }
  const recordings = await searchRecordingsScoped(queryTitle, artistMbid, {
    signal: signal,
    limit: 8,
  })
  const ranked = recordings.slice().sort(function(a, b) {
    return scoreRecordingTitleMatch(b, queryTitle) - scoreRecordingTitleMatch(a, queryTitle)
  })
  const best = ranked.find(function(recording) {
    return scoreRecordingTitleMatch(recording, queryTitle) >= 70
  })
  if (!best || !best.id) return []
  try {
    const detailRes = await axios.get(MUSICBRAINZ_BASE + '/recording/' + best.id, {
      params: { fmt: 'json', inc: 'genres+tags+work-rels' },
      signal: signal,
    })
    const data = detailRes.data || {}
    const labels = collectScoredGenreLabels(data)
    const workRelation = (data.relations || []).find(function(relation) {
      return relation && relation.type === 'performance' && relation.work && relation.work.id
    })
    if (workRelation && workRelation.work && workRelation.work.id) {
      const workRes = await axios.get(MUSICBRAINZ_BASE + '/work/' + workRelation.work.id, {
        params: { fmt: 'json', inc: 'genres+tags' },
        signal: signal,
      })
      collectScoredGenreLabels(workRes.data || {}).forEach(function(name) {
        if (labels.indexOf(name) < 0) labels.push(name)
      })
    }
    return labels
  } catch (e) {
    return []
  }
}

/**
 * Browser-side genre suggestions: local heuristics + Wikipedia + MusicBrainz.
 */
export async function searchGenreLight(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()
  const ambiguousTitle = isAmbiguousTitle(title)
  const collector = createGenreCollector(opts.currentGenre)

  const local = searchGenreLocal(opts)
  ;(local.candidates || (local.genre ? [local] : [])).forEach(function(entry) {
    collector.push(
      entry.genre,
      entry.source,
      entry.reason,
      entry.confidence || BIBLIO_CONFIDENCE_MEDIUM
    )
  })

  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Checking recording tags…', 0.25, 'musicbrainz-recording')
  }
  const recordingGenres = await fetchMusicBrainzRecordingGenres(title, artist, opts.signal)
  recordingGenres.forEach(function(name) {
    const canonical = normalizeInferredGenre(name)
    if (canonical) {
      collector.push(canonical, 'MusicBrainz', 'recording/work genre tag', BIBLIO_CONFIDENCE_HIGH)
    }
  })

  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Checking Wikipedia…', 0.45, 'wikipedia')
  }
  const extract = await fetchWikipediaExtract(title, artist, opts.signal)
  if (extract) {
    collector.pushFromText(
      extract,
      'Wikipedia',
      'matched article text',
      ambiguousTitle ? BIBLIO_CONFIDENCE_LOW : BIBLIO_CONFIDENCE_MEDIUM
    )
  }

  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Checking MusicBrainz…', 0.7, 'musicbrainz')
  }
  const mbGenres = await fetchMusicBrainzArtistGenres(artist, opts.signal)
  mbGenres.forEach(function(name) {
    const canonical = normalizeInferredGenre(name)
    if (canonical) {
      collector.push(canonical, 'MusicBrainz', 'artist genre tag', BIBLIO_CONFIDENCE_MEDIUM)
    }
  })

  return finishCandidates(collector.list())
}

export async function searchGenreViaResolver(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  if (!title) {
    throw new Error('Song title is required')
  }
  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Starting genre search...', 0, 'start')
  }

  const response = await fetchViaMediaProxy('/discover-genre', opts.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title,
      artist: String(opts.artist || '').trim(),
      rhythm: String(opts.rhythm || '').trim(),
      backgroundInfo: String(opts.backgroundInfo || '').trim(),
      currentGenre: String(opts.currentGenre || '').trim(),
    }),
    signal: opts.signal,
    headers: {
      Accept: GENRE_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  })

  const contentType = response.headers.get('content-type') || ''
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingGenreSearchResponse(response, opts.onProgress)
  }
  return parseGenreSearchResponse(response)
}

function shouldUseResolver(options) {
  if (options && options.forceLightweight) return false
  if (options && options.forceResolver) return true
  if (options && options.resolverAvailable === false) return false
  if (options && options.resolverAvailable === true) return true
  if (!isMediaProxyConfigured()) return false
  const health = getMediaResolverHealthState()
  if (health && health.checked) return !!health.available
  return true
}

function genreResultHasHits(result) {
  if (!result || result.empty) return false
  if (result.genre) return true
  return Array.isArray(result.candidates) && result.candidates.length > 0
}

/**
 * Genre search: resolver (web + LLM) when available, else Wikipedia/MusicBrainz/heuristics.
 */
export async function searchGenre(options) {
  const opts = options || {}
  if (shouldUseResolver(opts)) {
    try {
      const result = await searchGenreViaResolver(opts)
      if (genreResultHasHits(result)) return result
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
    }
  }
  return searchGenreLight(opts)
}

export function buildGoogleGenreSearchQuestion(title, artist) {
  return buildExternalSearchQuestion('genre', title, artist)
}

export function buildGoogleGenreSearchUrl(title, artist) {
  return buildGoogleSearchQuestionUrl(buildGoogleGenreSearchQuestion(title, artist))
}
