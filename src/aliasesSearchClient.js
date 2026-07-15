import { searchNotation } from './notationSearchClient'
import { normalizeMatchText } from './notationMatchUtils'

/**
 * Harvest alternate titles / AKA aliases from The Session + other ABC notation sources.
 */
export function harvestAliasesFromNotationResult(result, options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const titleKey = normalizeMatchText(title)
  const existing = {}
  ;(Array.isArray(opts.existingAliases) ? opts.existingAliases : []).forEach(function(alias) {
    const key = normalizeMatchText(alias)
    if (key) existing[key] = true
  })
  if (titleKey) existing[titleKey] = true

  const ranked = []
  const seen = Object.assign({}, existing)

  function pushAlias(alias, source, url, rankBoost) {
    const name = String(alias || '').trim()
    if (!name) return
    const key = normalizeMatchText(name)
    if (!key || seen[key]) return
    seen[key] = true
    const sourceLabel = String(source || 'ABC').trim() || 'ABC'
    const isSession = /session/i.test(sourceLabel) || /thesession\.org/i.test(String(url || ''))
    ranked.push({
      alias: name,
      preview: name,
      source: sourceLabel,
      url: url || '',
      rank: (isSession ? 100 : 50) + (rankBoost || 0),
    })
  }

  function harvestCandidate(candidate) {
    if (!candidate) return
    const source = candidate.source || (candidate.tuneMeta && candidate.tuneMeta.source) || 'ABC'
    const url = candidate.sourceUrl || candidate.url
      || (candidate.tuneMeta && (candidate.tuneMeta.url || candidate.tuneMeta.sourceUrl))
      || ''
    const meta = candidate.tuneMeta && typeof candidate.tuneMeta === 'object' ? candidate.tuneMeta : null
    if (meta) {
      if (Array.isArray(meta.aliases)) {
        meta.aliases.forEach(function(alias) {
          pushAlias(alias, source, url, 20)
        })
      }
      const metaName = String(meta.name || '').trim()
      if (metaName && normalizeMatchText(metaName) !== titleKey) {
        pushAlias(metaName, source, url, 10)
      }
    }
    const candTitle = String(candidate.title || '').trim()
    if (candTitle && normalizeMatchText(candTitle) !== titleKey) {
      pushAlias(candTitle, source, url, 5)
    }
  }

  if (result && Array.isArray(result.candidates)) {
    result.candidates.forEach(harvestCandidate)
  } else if (result && !result.empty) {
    harvestCandidate(result)
  }

  ranked.sort(function(a, b) { return (b.rank || 0) - (a.rank || 0) })
  return ranked.map(function(item) {
    return {
      alias: item.alias,
      preview: item.preview,
      source: item.source,
      url: item.url,
    }
  })
}

export async function searchAliases(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  if (!title) {
    return { empty: true, candidates: [] }
  }

  const notationResult = await searchNotation({
    title: title,
    artist: opts.artist || '',
    accessToken: opts.accessToken,
    signal: opts.signal,
    resolverAvailable: opts.resolverAvailable,
    onProgress: opts.onProgress,
    forceLightweight: opts.forceLightweight,
    forceResolver: opts.forceResolver,
  })

  const candidates = harvestAliasesFromNotationResult(notationResult, {
    title: title,
    existingAliases: opts.existingAliases,
  })

  if (candidates.length === 0) {
    return { empty: true, candidates: [] }
  }
  if (candidates.length === 1) {
    return Object.assign({ empty: false, multiple: false }, candidates[0])
  }
  return { empty: false, multiple: true, candidates: candidates }
}

export function buildGoogleAliasesSearchUrl(title, artist) {
  return 'https://www.google.com/search?q='
    + encodeURIComponent([title, artist, 'also known as alias tune'].filter(Boolean).join(' '))
}

export function buildTheSessionAliasesSearchUrl(title) {
  const q = encodeURIComponent(String(title || '').trim())
  return 'https://thesession.org/tunes/search?q=' + q
}
