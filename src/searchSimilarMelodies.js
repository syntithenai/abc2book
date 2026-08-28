import {
  abcToContour,
  contourSimilarity,
  hasUsableContour,
  MIN_CONTOUR_SCORE,
  DEFAULT_QUERY_MAX_NOTES,
} from './abcContour'
import { searchSimilarMelodiesViaResolver } from './similarMelodiesClient'
import * as notationImportUtils from './notationImportUtils'
import { notationSourceBadgeLabel } from './notationSearchSites'

export { hasUsableContour, MIN_CONTOUR_SCORE }

const DEFAULT_LIMIT = 12

/** Drop lyric lines so w:/W: text cannot pollute pitch extraction. */
export function abcForContourMatching(abcText) {
  return String(abcText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function(line) {
      const trimmed = line.trim()
      if (!trimmed) return true
      return !/^[wW]:/.test(trimmed)
    })
    .join('\n')
}

function tuneAbc(tune, abcTools) {
  if (!tune || !abcTools || typeof abcTools.json2abc !== 'function') return ''
  try {
    return String(abcTools.json2abc(tune) || '').trim()
  } catch (e) {
    return ''
  }
}

function normalizeAbcKey(abc) {
  return String(abc || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, 160)
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function resultScore(row) {
  const score = row && (row.contourScore != null ? row.contourScore : row.matchScore)
  const num = Number(score)
  return Number.isFinite(num) ? num : 0
}

/**
 * Exact tunebook duplicates via import hash (same signal as Duplicate Manager).
 */
export function searchTunebookExactDuplicates(options) {
  const opts = options || {}
  const queryTune = opts.queryTune
  const tunes = opts.tunes || {}
  const abcTools = opts.abcTools
  const excludeTuneId = opts.excludeTuneId
    ? String(opts.excludeTuneId)
    : (queryTune && queryTune.id ? String(queryTune.id) : '')
  const getHash = abcTools && typeof abcTools.getTuneImportHash === 'function'
    ? abcTools.getTuneImportHash
    : null
  if (!queryTune || !getHash) return []

  let queryHash = ''
  try {
    queryHash = getHash(queryTune)
  } catch (e) {
    return []
  }
  if (!queryHash) return []

  const out = []
  Object.keys(tunes).forEach(function(id) {
    if (excludeTuneId && String(id) === excludeTuneId) return
    const tune = tunes[id]
    if (!tune || !tune.id) return
    let hash = ''
    try {
      hash = getHash(tune)
    } catch (e) {
      return
    }
    if (!hash || hash !== queryHash) return
    const abc = tuneAbc(tune, abcTools)
    out.push({
      kind: 'tunebook',
      tuneId: String(tune.id || id),
      title: String(tune.name || tune.title || 'Untitled').trim() || 'Untitled',
      abc: abc,
      contourScore: 100,
      matchScore: 100,
      source: 'Your tunebook',
      sourceUrl: '',
      matchType: 'exact-duplicate',
    })
  })
  return out
}

/**
 * Score tunebook tunes against a query ABC using client-side contour matching.
 */
export function searchTunebookByContour(options) {
  const opts = options || {}
  const queryAbc = abcForContourMatching(String(opts.queryAbc || '').trim())
  const tunes = opts.tunes || {}
  const abcTools = opts.abcTools
  const excludeTuneId = opts.excludeTuneId ? String(opts.excludeTuneId) : ''
  const limit = opts.limit > 0 ? opts.limit : DEFAULT_LIMIT
  const minScore = opts.minScore != null ? Number(opts.minScore) : MIN_CONTOUR_SCORE

  if (!queryAbc || !hasUsableContour(queryAbc, DEFAULT_QUERY_MAX_NOTES)) {
    return []
  }

  const query = abcToContour(queryAbc, DEFAULT_QUERY_MAX_NOTES)
  const scored = []

  Object.keys(tunes).forEach(function(id) {
    if (excludeTuneId && String(id) === excludeTuneId) return
    const tune = tunes[id]
    if (!tune) return
    const abc = tuneAbc(tune, abcTools)
    if (!abc) return
    const candidate = abcToContour(abcForContourMatching(abc), DEFAULT_QUERY_MAX_NOTES)
    const score = contourSimilarity(query, candidate)
    if (score < minScore) return
    scored.push({
      kind: 'tunebook',
      tuneId: String(tune.id || id),
      title: String(tune.name || tune.title || 'Untitled').trim() || 'Untitled',
      abc: abc,
      contourScore: Math.round(score * 10) / 10,
      matchScore: Math.round(score),
      source: 'Your tunebook',
      sourceUrl: '',
    })
  })

  scored.sort(function(a, b) {
    return resultScore(b) - resultScore(a)
  })
  return scored.slice(0, limit)
}

function mapResourceCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null
  const abc = String(candidate.abc || '').trim()
  if (!abc) return null
  const scoreRaw = candidate.contourScore != null
    ? candidate.contourScore
    : candidate.matchScore
  const score = Number(scoreRaw)
  const title = String(
    candidate.title
    || (candidate.tuneMeta && candidate.tuneMeta.name)
    || 'Untitled'
  ).trim() || 'Untitled'
  const source = String(candidate.source || '').trim()
  return {
    kind: 'resource',
    tuneId: '',
    title: title,
    abc: abc,
    contourScore: Number.isFinite(score) ? Math.round(score * 10) / 10 : 0,
    matchScore: Number.isFinite(score) ? Math.round(score) : 0,
    source: notationSourceBadgeLabel(source) || source || 'Resources',
    sourceUrl: String(candidate.sourceUrl || ''),
    candidate: candidate,
  }
}

export function mergeSimilarMelodyRows(localRows, remoteRows, excludeTuneId, limit) {
  const seenTuneIds = {}
  const seenAbcKeys = {}
  const merged = []
  const exclude = excludeTuneId ? String(excludeTuneId) : ''

  function pushUnique(row) {
    if (!row) return
    if (exclude && row.tuneId && String(row.tuneId) === exclude) return
    if (row.kind === 'tunebook' && row.tuneId) {
      const tid = String(row.tuneId)
      if (seenTuneIds[tid]) return
      seenTuneIds[tid] = true
      const abcKey = normalizeAbcKey(row.abc)
      if (abcKey) seenAbcKeys[abcKey] = true
      merged.push(row)
      return
    }
    const abcKey = normalizeAbcKey(row.abc) || (row.sourceUrl || row.title || '')
    if (!abcKey || seenAbcKeys[abcKey]) return
    seenAbcKeys[abcKey] = true
    merged.push(row)
  }

  ;(localRows || []).forEach(pushUnique)
  ;(remoteRows || []).forEach(pushUnique)
  merged.sort(function(a, b) {
    return resultScore(b) - resultScore(a)
  })
  return merged.slice(0, limit > 0 ? limit : DEFAULT_LIMIT)
}

/**
 * Tunebook-only similar melody search (exact duplicates + contour).
 */
export function searchSimilarMelodiesLocal(options) {
  const opts = options || {}
  const rawQueryAbc = String(opts.queryAbc || opts.abc || '').trim()
  const queryAbc = abcForContourMatching(rawQueryAbc)
  const limit = opts.limit > 0 ? opts.limit : DEFAULT_LIMIT

  if (!queryAbc || !hasUsableContour(queryAbc, DEFAULT_QUERY_MAX_NOTES)) {
    return []
  }

  const exactLocal = searchTunebookExactDuplicates({
    queryTune: opts.queryTune,
    tunes: opts.tunes,
    abcTools: opts.abcTools,
    excludeTuneId: opts.excludeTuneId,
  })

  const contourLocal = searchTunebookByContour({
    queryAbc: rawQueryAbc,
    tunes: opts.tunes,
    abcTools: opts.abcTools,
    excludeTuneId: opts.excludeTuneId,
    limit: limit,
    minScore: opts.minScore,
  })

  const localById = {}
  exactLocal.concat(contourLocal).forEach(function(row) {
    if (!row || !row.tuneId) return
    const prev = localById[row.tuneId]
    if (!prev || resultScore(row) > resultScore(prev) || row.matchType === 'exact-duplicate') {
      localById[row.tuneId] = row
    }
  })
  const localRows = Object.keys(localById).map(function(id) { return localById[id] })
  localRows.sort(function(a, b) {
    return resultScore(b) - resultScore(a)
  })
  return localRows
}

/**
 * Resource corpus search via hosted resolver contour index.
 */
export async function searchSimilarMelodiesRemote(options) {
  const opts = options || {}
  const queryAbc = abcForContourMatching(String(opts.queryAbc || opts.abc || '').trim())
  if (!queryAbc || !hasUsableContour(queryAbc, DEFAULT_QUERY_MAX_NOTES)) {
    return { rows: [], resolverUnavailable: false, resolverError: null }
  }

  try {
    const body = await searchSimilarMelodiesViaResolver({
      abc: queryAbc,
      accessToken: opts.accessToken,
      signal: opts.signal,
      limit: opts.limit,
      timeoutMs: opts.timeoutMs,
      resolverAvailable: opts.resolverAvailable,
    })
    return {
      rows: (body.candidates || []).map(mapResourceCandidate).filter(Boolean),
      resolverUnavailable: false,
      resolverError: null,
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { rows: [], resolverUnavailable: false, resolverError: null }
    }
    return {
      rows: [],
      resolverUnavailable: true,
      resolverError: err && err.message ? String(err.message) : 'Similar melodies search failed',
    }
  }
}

/**
 * Parallel tunebook + resolver contour search; merged and sorted by score.
 */
export async function searchSimilarMelodies(options) {
  const opts = options || {}
  const rawQueryAbc = String(opts.queryAbc || opts.abc || '').trim()
  const queryAbc = abcForContourMatching(rawQueryAbc)
  const limit = opts.limit > 0 ? opts.limit : DEFAULT_LIMIT

  if (!queryAbc || !hasUsableContour(queryAbc, DEFAULT_QUERY_MAX_NOTES)) {
    return {
      results: [],
      tunebookCount: 0,
      resourceCount: 0,
      resolverUnavailable: false,
      resolverError: null,
    }
  }

  const localRows = searchSimilarMelodiesLocal(opts)
  const remote = await searchSimilarMelodiesRemote(opts)
  const remoteRows = remote.rows || []

  if (!remoteRows.length && opts.resolverAvailable === false) {
    remote.resolverUnavailable = true
  }

  const merged = mergeSimilarMelodyRows(
    localRows,
    remoteRows,
    opts.excludeTuneId,
    limit
  )

  return {
    results: merged,
    tunebookCount: localRows.length,
    resourceCount: remoteRows.length,
    resolverUnavailable: !!remote.resolverUnavailable,
    resolverError: remote.resolverError || null,
  }
}

/**
 * Find an existing tunebook tune whose import hash matches the imported candidate.
 */
export function findTunebookTuneByImportHash(tunes, importedTune, getTuneImportHash, excludeTuneId) {
  if (!importedTune || typeof getTuneImportHash !== 'function') return null
  const targetHash = getTuneImportHash(importedTune)
  if (!targetHash) return null
  const exclude = excludeTuneId ? String(excludeTuneId) : ''
  const list = tunes && typeof tunes === 'object' ? Object.values(tunes) : []
  for (let i = 0; i < list.length; i++) {
    const tune = list[i]
    if (!tune || !tune.id) continue
    if (exclude && String(tune.id) === exclude) continue
    try {
      if (getTuneImportHash(tune) === targetHash) return tune
    } catch (e) {
      // ignore hash failures
    }
  }
  return null
}

/**
 * Resolve a similar-melody result to a tunebook tune id (reuse or import).
 * Returns { tuneId, created }.
 */
export function resolveSimilarMelodySelection(result, options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  const tunes = opts.tunes || (tunebook && tunebook.getTunes ? tunebook.getTunes() : {})
  const excludeTuneId = opts.excludeTuneId ? String(opts.excludeTuneId) : ''

  if (!result) {
    throw new Error('No similar melody selected')
  }

  if (result.kind === 'tunebook' && result.tuneId) {
    return { tuneId: String(result.tuneId), created: false }
  }

  if (!tunebook || !tunebook.abcTools) {
    throw new Error('Tunebook is required to import a similar melody')
  }

  const abcTools = tunebook.abcTools
  const imported = notationImportUtils.importedTuneFromNotationCandidate(
    abcTools,
    result.abc,
    result.candidate || {
      title: result.title,
      source: result.source,
      sourceUrl: result.sourceUrl,
    }
  )
  if (!imported) {
    throw new Error('Could not parse similar melody ABC')
  }

  const existing = findTunebookTuneByImportHash(
    tunes,
    imported,
    abcTools.getTuneImportHash,
    excludeTuneId
  )
  if (existing && existing.id) {
    return { tuneId: String(existing.id), created: false }
  }

  delete imported.id
  const created = tunebook.createTune(imported)
  tunebook.saveTune(created, false, {
    historyLabel: opts.historyLabel || 'Similar melody import',
  })
  if (!created || !created.id) {
    throw new Error('Failed to save similar melody')
  }
  return { tuneId: String(created.id), created: true }
}
