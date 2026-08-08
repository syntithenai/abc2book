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

function meaningfulSubstringOverlap(a, b) {
  if (!a || !b) return false
  if (a.indexOf(b) === -1 && b.indexOf(a) === -1) return false
  const shorter = Math.min(a.length, b.length)
  const longer = Math.max(a.length, b.length)
  // Avoid "clare" ranking as a close match for "claredelune".
  return shorter >= 5 && (shorter / longer) >= 0.65
}

export function scoreTitleArtistMatch(candidateTitle, candidateArtist, title, artist) {
  const titleKey = normalizeMatchText(stripNotationMatchDecorations(title))
  const artistKey = normalizeMatchText(artist)
  const candidateTitleKey = normalizeMatchText(stripNotationMatchDecorations(candidateTitle))
  const candidateArtistKey = normalizeMatchText(candidateArtist)
  let score = 0

  if (titleKey && candidateTitleKey) {
    if (candidateTitleKey === titleKey) score += 80
    else if (meaningfulSubstringOverlap(titleKey, candidateTitleKey)) score += 45
  }

  if (artistKey && candidateArtistKey) {
    if (candidateArtistKey === artistKey) score += 60
    else if (meaningfulSubstringOverlap(artistKey, candidateArtistKey)) score += 30
  }

  return score
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
