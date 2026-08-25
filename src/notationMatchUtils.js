import { foldEuropeanLetters } from './searchTextUtils'

export function normalizeMatchText(value) {
  return foldEuropeanLetters(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Strip The Session display decorations so "Planxty Burke (waltz) — setting 1"
 * still matches query "Planxty Burke".
 */
export function stripNotationMatchDecorations(value) {
  return String(value || '')
    .replace(/\s*[—–-]\s*setting\s+\d+\s*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()
}

const NOTATION_TUNE_TYPE_RE = /\b(reels?|jigs?|hornpipes?|slip\s*jigs?|polkas?|slides?|strathspeys?|barndances?|mazurkas?|waltzes?|marches?|airs?|songs?|tunes?)\b/gi

export function stripNotationQueryDecorations(value) {
  let text = stripNotationMatchDecorations(String(value || ''))
  text = text.replace(NOTATION_TUNE_TYPE_RE, ' ').replace(/\s+/g, ' ').trim()
  text = text.replace(/^the\s+/i, '').trim()
  return text
}

function levenshteinDistance(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  const matrix = []
  for (let i = 0; i <= right.length; i += 1) matrix[i] = [i]
  for (let j = 0; j <= left.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= right.length; i += 1) {
    for (let j = 1; j <= left.length; j += 1) {
      if (right.charAt(i - 1) === left.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[right.length][left.length]
}

function notationTitleMatchKey(value) {
  return normalizeMatchText(stripNotationQueryDecorations(value))
}

export function fuzzyNotationTitleSimilarity(titleA, titleB) {
  const keyA = notationTitleMatchKey(titleA)
  const keyB = notationTitleMatchKey(titleB)
  if (!keyA || !keyB) return 0
  if (keyA === keyB) return 1
  if (meaningfulSubstringOverlap(keyA, keyB)) {
    const shorter = Math.min(keyA.length, keyB.length)
    const longer = Math.max(keyA.length, keyB.length)
    return shorter / longer
  }
  const distance = levenshteinDistance(keyA, keyB)
  const longer = Math.max(keyA.length, keyB.length)
  if (!longer) return 0
  return Math.max(0, 1 - (distance / longer))
}

export function editDistanceOneVariants(word) {
  const value = String(word || '').toLowerCase()
  if (value.length < 4) return []
  const variants = []
  const seen = new Set()
  function push(item) {
    if (!item || item === value || item.length < 4 || seen.has(item)) return
    seen.add(item)
    variants.push(item)
  }
  for (let i = 0; i < value.length; i += 1) {
    push(value.slice(0, i) + value.slice(i + 1))
  }
  for (let i = 0; i < value.length - 1; i += 1) {
    push(value.slice(0, i) + value[i + 1] + value[i] + value.slice(i + 2))
  }
  return variants
}

export function buildThesessionSearchQueries(title) {
  const queries = []
  const seen = new Set()
  function add(query) {
    const text = String(query || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    queries.push(text)
  }

  const base = String(title || '').trim()
  if (!base) return queries
  add(base)

  const stripped = stripNotationQueryDecorations(base)
  if (stripped && stripped.toLowerCase() !== base.toLowerCase()) add(stripped)

  const words = stripped.split(/\s+/).filter(function(word) {
    return word.length >= 4
  }).sort(function(a, b) { return b.length - a.length })
  words.slice(0, 2).forEach(function(word) {
    editDistanceOneVariants(word).forEach(add)
  })
  return queries.slice(0, 12)
}

function meaningfulSubstringOverlap(a, b) {
  if (!a || !b) return false
  if (a.indexOf(b) === -1 && b.indexOf(a) === -1) return false
  const shorter = Math.min(a.length, b.length)
  const longer = Math.max(a.length, b.length)
  // Avoid "clare" ranking as a close match for "claredelune".
  return shorter >= 5 && (shorter / longer) >= 0.65
}

function fuzzyTitleMatchScoreFromKeys(titleKey, candidateTitleKey) {
  if (!titleKey || !candidateTitleKey) return 0
  if (titleKey === candidateTitleKey) return 80
  if (meaningfulSubstringOverlap(titleKey, candidateTitleKey)) return 45
  const distance = levenshteinDistance(titleKey, candidateTitleKey)
  const longer = Math.max(titleKey.length, candidateTitleKey.length)
  if (!longer) return 0
  const similarity = Math.max(0, 1 - (distance / longer))
  if (similarity >= 0.92) return 78
  if (similarity >= 0.85) return 68
  if (similarity >= 0.78) return 58
  if (similarity >= 0.72) return 48
  return 0
}


export function scoreTitleArtistMatch(candidateTitle, candidateArtist, title, artist) {
  const titleKey = notationTitleMatchKey(title)
  const artistKey = normalizeMatchText(artist)
  const candidateTitleKey = notationTitleMatchKey(candidateTitle)
  const candidateArtistKey = normalizeMatchText(candidateArtist)
  let score = 0

  if (titleKey && candidateTitleKey) {
    if (candidateTitleKey === titleKey) score += 80
    else if (meaningfulSubstringOverlap(titleKey, candidateTitleKey)) score += 45
    else {
      score += fuzzyTitleMatchScoreFromKeys(titleKey, candidateTitleKey)
    }
  }

  if (artistKey && candidateArtistKey) {
    if (candidateArtistKey === artistKey) score += 60
    else if (meaningfulSubstringOverlap(artistKey, candidateArtistKey)) score += 30
  }

  return score
}

/**
 * True when both artist strings are non-empty and match exactly or by
 * meaningful substring (e.g. "Paul Simon" vs "Simon, Paul").
 */
export function artistsLooselyMatch(left, right) {
  const a = normalizeMatchText(left)
  const b = normalizeMatchText(right)
  if (!a || !b) return false
  if (a === b) return true
  return meaningfulSubstringOverlap(a, b)
}

/**
 * Prefer tuneMeta.name (clean The Session tune title) when scoring candidates.
 */
export function scoreNotationCandidate(candidate, title, artist) {
  const item = candidate && typeof candidate === 'object' ? candidate : {}
  const meta = item.tuneMeta && typeof item.tuneMeta === 'object' ? item.tuneMeta : null
  const matchTitle = (meta && meta.name) || item.title || ''
  const matchArtist = item.artist || (meta && meta.composer) || ''
  return scoreTitleArtistMatch(matchTitle, matchArtist, title, artist)
}

const TRADITIONAL_NOTATION_SOURCES = [
  'thesession.org',
  'folktunefinder.com',
  'folkinfo.org',
  'norbeck.net',
  'henrik.norbeck.org',
  'traditionalmusic.co.uk',
  'irishtune.info',
  'folkwiki.ibiblio.org',
  'contemplator.com',
  'folktunes.org',
]

function notationMatchFields(candidate) {
  const item = candidate && typeof candidate === 'object' ? candidate : {}
  const meta = item.tuneMeta && typeof item.tuneMeta === 'object' ? item.tuneMeta : null
  return {
    matchTitle: (meta && meta.name) || item.title || '',
    matchArtist: item.artist || (meta && meta.composer) || '',
  }
}

export function notationArtistMatchScore(candidate, artist) {
  const fields = notationMatchFields(candidate)
  return scoreTitleArtistMatch('', fields.matchArtist, '', artist)
}

export function isTraditionalNotationSource(source) {
  const key = String(source || '').toLowerCase()
  if (!key) return false
  return TRADITIONAL_NOTATION_SOURCES.some(function(host) {
    return key === host || key.endsWith('.' + host)
  })
}

function notationImportFormat(candidate) {
  const item = candidate && typeof candidate === 'object' ? candidate : {}
  if (item.importFormat) return String(item.importFormat)
  const meta = item.tuneMeta && typeof item.tuneMeta === 'object' ? item.tuneMeta : null
  const nested = meta && meta.meta && typeof meta.meta === 'object' ? meta.meta : null
  if (nested && nested.importFormat) return String(nested.importFormat)
  const source = String(item.source || '').toLowerCase()
  if (source === 'musescore.com') return 'musescore'
  if (item.musicXml && !String(item.abc || '').trim()) return 'musicxml'
  return 'abc'
}

export function notationCandidatesFromResult(result) {
  if (!result || typeof result !== 'object') return []
  if (Array.isArray(result.candidates)) return result.candidates.slice()
  if (result.empty) return []
  if (result.abc || result.musicXml || result.pdfAttachment) return [result]
  return []
}

export function notationTitleMatchScore(candidate, title) {
  const fields = notationMatchFields(candidate)
  return scoreTitleArtistMatch(
    fields.matchTitle,
    '',
    title,
    ''
  )
}

export function isVeryCloseNotationTitleMatch(candidate, title) {
  return notationTitleMatchScore(candidate, title) >= 80
}

export function notationCandidateImportFormat(candidate) {
  return notationImportFormat(candidate)
}

export function hasSolidAbcNotationMatch(result, title) {
  const candidates = notationCandidatesFromResult(result)
  return candidates.some(function(candidate) {
    return notationImportFormat(candidate) === 'abc'
      && String(candidate.abc || '').trim()
      && isVeryCloseNotationTitleMatch(candidate, title)
  })
}

export function pickRankedSolidAbcNotationCandidate(result, title) {
  const candidates = notationCandidatesFromResult(result)
  if (!candidates.length) return null
  const first = candidates[0]
  if (notationImportFormat(first) !== 'abc') return null
  if (!String(first.abc || '').trim()) return null
  if (!isVeryCloseNotationTitleMatch(first, title)) return null
  return first
}

export function pickAutoApplyNotationCandidate(result, title, artist, options) {
  const candidates = notationCandidatesFromResult(result)
  for (let i = 0; i < candidates.length; i++) {
    if (shouldAutoApplyNotationCandidate(candidates[i], title, artist, options)) {
      return candidates[i]
    }
  }
  return null
}

export function shouldAutoApplyNotationCandidate(candidate, title, artist, options) {
  const opts = options || {}
  const songType = opts.songType || 'instrumental'
  const item = candidate && typeof candidate === 'object' ? candidate : {}
  const source = String(item.source || '').toLowerCase()
  const artistKey = normalizeMatchText(artist)
  const baseScore = scoreNotationCandidate(item, title, artist)
  const artistScore = notationArtistMatchScore(item, artist)
  const importFormat = notationImportFormat(item)
  const isMidi = importFormat === 'midi'
  const isArchive = importFormat === 'musescore' || importFormat === 'musicxml' || importFormat === 'pdf'
  const preferMuseScoreImport = opts.preferMuseScoreImport === true
  const fallbackPool = opts.fallbackPool === true
  const closeTitle = isVeryCloseNotationTitleMatch(item, title)
  const isAbc = importFormat === 'abc' && !isArchive

  if (fallbackPool) {
    if (isMidi) return false
    if (!closeTitle) return false
    if (artistKey && isTraditionalNotationSource(source) && artistScore < 30) return false
    return true
  }

  if (isAbc && closeTitle) {
    if (artistKey && baseScore > 0 && baseScore < 60) return false
    if (baseScore === 0) return false
    return true
  }

  if (songType === 'song' && source === 'thesession.org') return false
  if (artistKey && isTraditionalNotationSource(source) && artistScore < 30) return false
  if (artistKey && source === 'thesession.org' && baseScore < 80) return false
  if (artistKey && baseScore > 0 && baseScore < 60) return false
  if (!artistKey && baseScore > 0 && baseScore < 45) return false
  if (preferMuseScoreImport || (songType === 'song' && artistKey)) {
    if (isAbc && !closeTitle) return false
    if (isMidi) return false
  }
  if (baseScore === 0 && item.abc && !source) {
    return !(songType === 'song' && artistKey)
  }
  if (baseScore === 0) return false
  if (isArchive && artistKey && baseScore >= 45) return true
  return true
}
