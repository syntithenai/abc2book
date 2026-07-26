import { normalizeMatchText } from './notationMatchUtils'

function normalizeTitleKey(text) {
  return normalizeMatchText(text)
}

export const BIBLIO_CONFIDENCE_HIGH = 'high'
export const BIBLIO_CONFIDENCE_MEDIUM = 'medium'
export const BIBLIO_CONFIDENCE_LOW = 'low'

export const ALBUM_CONFIDENCE_HIGH = BIBLIO_CONFIDENCE_HIGH
export const ALBUM_CONFIDENCE_MEDIUM = BIBLIO_CONFIDENCE_MEDIUM
export const ALBUM_CONFIDENCE_LOW = BIBLIO_CONFIDENCE_LOW

const CONFIDENCE_RANK = {
  high: 3,
  medium: 2,
  low: 1,
}

export function confidenceRank(confidence) {
  return CONFIDENCE_RANK[confidence] || 0
}

export function stripLeadingArticle(text) {
  return String(text || '').trim().replace(/^the\s+/i, '')
}

export function escapeMusicBrainzQueryTerm(text) {
  return String(text || '').replace(/["\\]/g, '\\$&')
}

/**
 * Score how well a candidate album title matches the search query (0–100).
 */
export function scoreAlbumTitleMatch(candidateTitle, searchTitle) {
  const wanted = normalizeMatchText(stripLeadingArticle(searchTitle))
  const got = normalizeMatchText(stripLeadingArticle(candidateTitle))
  if (!wanted || !got) return 0
  if (got === wanted) return 100
  if (got.indexOf(wanted) >= 0 || wanted.indexOf(got) >= 0) return 70
  return 0
}

export function scoreRecordingTitleMatch(recording, title) {
  if (!recording) return 0
  const wanted = normalizeTitleKey(title)
  const got = normalizeTitleKey(recording.title)
  if (!wanted || !got) return 0
  if (got === wanted) return 100
  if (got.indexOf(wanted) >= 0 || wanted.indexOf(got) >= 0) return 70
  return 0
}

export function isAmbiguousTitle(title) {
  const key = normalizeTitleKey(title)
  if (!key) return true
  if (key.length < 5) return true
  const tokens = String(title || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 1 && key.length < 8) return true
  return false
}

export function downgradeConfidence(confidence, ambiguousTitle) {
  if (!ambiguousTitle) return confidence || BIBLIO_CONFIDENCE_MEDIUM
  if (confidence === BIBLIO_CONFIDENCE_HIGH) return BIBLIO_CONFIDENCE_MEDIUM
  if (confidence === BIBLIO_CONFIDENCE_MEDIUM) return BIBLIO_CONFIDENCE_LOW
  return confidence || BIBLIO_CONFIDENCE_LOW
}

export function formatAlbumLabel(title, date) {
  const name = String(title || '').trim()
  if (!name) return ''
  const yearMatch = String(date || '').match(/^(\d{4})/)
  if (yearMatch) return name + ' (' + yearMatch[1] + ')'
  return name
}

export function albumYearFromDate(date) {
  const match = String(date || '').match(/^(\d{4})/)
  return match ? match[1] : ''
}

export function splitCandidatesByConfidence(candidates) {
  const autoApply = []
  const suggestions = []
  ;(candidates || []).forEach(function(candidate) {
    if (candidate && candidate.confidence === BIBLIO_CONFIDENCE_HIGH) {
      autoApply.push(candidate)
    } else {
      suggestions.push(candidate)
    }
  })
  return { autoApply: autoApply, suggestions: suggestions }
}

export function mergeCandidateByConfidence(store, seen, candidate, keyFor) {
  const key = keyFor(candidate)
  if (!key || !candidate) return
  if (!Object.prototype.hasOwnProperty.call(seen, key)) {
    seen[key] = store.length
    store.push(candidate)
    return
  }
  const idx = seen[key]
  const existing = store[idx]
  const nextRank = confidenceRank(candidate.confidence)
  const existingRank = confidenceRank(existing.confidence)
  if (nextRank > existingRank) {
    store[idx] = candidate
    return
  }
  if (nextRank === existingRank && candidate.matchType && !existing.matchType) {
    store[idx] = candidate
  }
}

export function pickProminentWriter(writers) {
  const list = Array.isArray(writers) ? writers.slice() : []
  if (!list.length) return null
  list.sort(function(a, b) {
    const rc = (b.recording_count || 0) - (a.recording_count || 0)
    if (rc !== 0) return rc
    return (b.score || 0) - (a.score || 0)
  })
  const best = list[0]
  const second = list[1]
  if (!best) return null
  const bestRc = Number(best.recording_count) || 0
  const secondRc = second ? (Number(second.recording_count) || 0) : 0
  if (list.length === 1) return best
  if (bestRc > secondRc) return best
  if (bestRc === secondRc && (best.score || 0) > (second.score || 0)) return best
  return null
}

export function sortCandidatesByConfidence(candidates) {
  return (Array.isArray(candidates) ? candidates.slice() : []).sort(function(a, b) {
    const rankDiff = confidenceRank(b && b.confidence) - confidenceRank(a && a.confidence)
    if (rankDiff !== 0) return rankDiff
    return String(a && a.artist || a && a.genre || '').localeCompare(
      String(b && b.artist || b && b.genre || ''),
      undefined,
      { sensitivity: 'base' }
    )
  })
}
