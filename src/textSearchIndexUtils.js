export const LOCAL_SEARCH_DISPLAY_LIMIT = 25
export const LOCAL_SEARCH_INTERNAL_LIMIT = 50

const COLLECTION_LABELS = {
  '0': 'FolkTuneFinder',
  '1': 'The Session',
  '2': "Jim's Roots",
  '3': 'Misc',
  '4': 'Norbeck',
  '5': 'Folkinfo',
  '6': 'JC',
}

const TRADITIONAL_RHYTHMS = {
  reel: true,
  jig: true,
  hornpipe: true,
  'slip jig': true,
  polka: true,
  slide: true,
  march: true,
  strathspey: true,
  barndance: true,
  waltz: true,
}

const SONG_RHYTHMS = {
  song: true,
  ballad: true,
  air: true,
  waltz: true,
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/, '')
    .replace(/\s+the$/, '')
    .trim()
}

export function tokenizeSearchQuery(text, stripCommonWords) {
  const cleanText = stripCommonWords(
    String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .trim()
  )
  return cleanText
    .split(' ')
    .map(function(part) { return part.trim() })
    .filter(function(part) {
      // Drop ultra-short fragments ("de", "of") that otherwise match inside
      // unrelated titles via naive substring checks.
      return part.length >= 3
    })
}

export function collectionLabelForIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return ''
  const firstId = String(ids[0] || '')
  const collectionNumber = firstId.split('-')[0]
  return COLLECTION_LABELS[collectionNumber] || 'Collection'
}

export function inferSongTypeFromRhythm(rhythm) {
  const value = String(rhythm || '').toLowerCase().trim()
  if (!value) return 'instrumental'
  if (SONG_RHYTHMS[value]) return 'song'
  if (TRADITIONAL_RHYTHMS[value]) return 'traditional_tune'
  if (value.indexOf('song') >= 0 || value.indexOf('ballad') >= 0) return 'song'
  if (value.indexOf('reel') >= 0 || value.indexOf('jig') >= 0 || value.indexOf('tune') >= 0) {
    return 'traditional_tune'
  }
  return 'instrumental'
}

export function inferNotationSongType(rhythm, artist) {
  const artistText = String(artist || '').trim()
  if (artistText) {
    const fromRhythm = inferSongTypeFromRhythm(rhythm || '')
    if (fromRhythm === 'traditional_tune') return 'traditional_tune'
    return 'song'
  }
  return inferSongTypeFromRhythm(rhythm || '')
}

function countMatchedTokens(title, tokens) {
  const words = normalizeTitle(title)
    .split(' ')
    .filter(Boolean)
  let matched = 0
  tokens.forEach(function(token) {
    const needle = String(token || '').toLowerCase()
    if (!needle) return
    if (words.some(function(word) { return word === needle })) {
      matched += 1
    }
  })
  return matched
}

export function scoreSearchResult(query, title, indexTokenScore, tokens) {
  const normalizedQuery = normalizeTitle(query)
  const normalizedTitle = normalizeTitle(title)
  const queryTokens = tokens && tokens.length > 0 ? tokens : tokenizeSearchQuery(query, function(text) { return text })
  const matchedTokenCount = countMatchedTokens(title, queryTokens)
  const tokenCoverage = queryTokens.length > 0 ? matchedTokenCount / queryTokens.length : 0

  let score = Number(indexTokenScore) || 0
  score += matchedTokenCount * 2

  if (normalizedQuery && normalizedTitle === normalizedQuery) {
    score += 12
  } else if (normalizedQuery && normalizedTitle.indexOf(normalizedQuery) === 0) {
    score += 8
  } else if (normalizedQuery && normalizedTitle.indexOf(normalizedQuery) !== -1) {
    score += 4
  }

  if (queryTokens.length > 1 && matchedTokenCount < queryTokens.length) {
    score -= (queryTokens.length - matchedTokenCount) * 2
  }

  return {
    score: score,
    matchedTokenCount: matchedTokenCount,
    tokenCoverage: tokenCoverage,
    queryTokenCount: queryTokens.length,
  }
}

export function compareSearchResults(a, b) {
  if (b.score !== a.score) return b.score - a.score
  if (b.matchedTokenCount !== a.matchedTokenCount) {
    return b.matchedTokenCount - a.matchedTokenCount
  }
  if (a.name.length !== b.name.length) return a.name.length - b.name.length
  return a.name.localeCompare(b.name)
}

export function isStrongLocalMatch(query, results) {
  if (!Array.isArray(results) || results.length === 0) return false
  const top = results[0]
  const normalizedQuery = normalizeTitle(query)
  const normalizedTitle = normalizeTitle(top.name)
  if (normalizedQuery && normalizedTitle === normalizedQuery) return true
  // Multi-word queries need every significant token present (not half coverage).
  if ((top.queryTokenCount || 0) > 1) {
    return top.matchedTokenCount === top.queryTokenCount
      && top.score >= (top.queryTokenCount * 3)
  }
  return top.matchedTokenCount === top.queryTokenCount && top.score >= top.queryTokenCount
}

export function formatLocalSearchLabel(result) {
  const source = collectionLabelForIds(result.ids)
  if (!source) return result.name
  return result.name + ' (' + source + ')'
}
