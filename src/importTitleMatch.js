/**
 * Title similarity gate for import content-hash / library merge proposals.
 * Unrelated titles must not be treated as the same tune.
 */

import { foldEuropeanLetters, toSearchText } from './searchTextUtils'
import { normalizeArtistKey } from './recordingArtistsClient'

/** Arrangement / format noise stripped before compare (not part of the song identity). */
const VERSION_DESCRIPTOR_RE = /\b(ukulele|ukelele|uke|guitar|piano|banjo|mandolin|bass|tab|tabs|chords?|lyrics?|instrumental|karaoke|backing\s*track|play[\s-]?along|easy|simplified|beginner|advanced|arrangement|arr\.?|version|ver\.?|cover|remix|live|acoustic|electric|solo|duet|trio|quartet|sheet\s*music|lead\s*sheet|fake\s*book)\b/gi

/** Trailing parenthetical aliases like (Traditional) — allowance for containment after strip. */
const TRAILING_PAREN_RE = /\s*\([^)]*\)\s*$/g

export function normalizeImportTitle(value) {
  return foldEuropeanLetters(String(value == null ? '' : value))
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strip arrangement descriptors and trailing parentheticals, then normalize.
 * "Help ukulele version" → "help"; "Amazing Grace (Traditional)" → "amazing grace"
 */
export function cleanImportTitleForMatching(value) {
  let text = String(value == null ? '' : value)
  text = text.replace(TRAILING_PAREN_RE, ' ')
  text = text.replace(VERSION_DESCRIPTOR_RE, ' ')
  return normalizeImportTitle(text)
}

/** Canonical artist+title key for media dedupe and tune lookup. */
export function mediaArtistTitleIdentityKey(title, artist) {
  const normalizedTitle = toSearchText(cleanImportTitleForMatching(title))
  const normalizedArtist = normalizeArtistKey(artist)
  if (!normalizedTitle && !normalizedArtist) return ''
  return normalizedTitle + '\0' + normalizedArtist
}

/**
 * Prefer the shortest cleaned display title when clustering variants.
 * Falls back to the first non-empty original.
 */
export function preferCleanImportTitle(titleA, titleB) {
  const a = String(titleA == null ? '' : titleA).trim()
  const b = String(titleB == null ? '' : titleB).trim()
  if (!a) return b
  if (!b) return a
  const cleanA = cleanImportTitleForMatching(a)
  const cleanB = cleanImportTitleForMatching(b)
  if (cleanA && cleanB && cleanA === cleanB) {
    // Same song identity: prefer the shorter raw title (less version noise).
    if (a.length !== b.length) return a.length <= b.length ? a : b
  }
  // Prefer title that equals its cleaned form (already "clean").
  const aIsClean = normalizeImportTitle(a) === cleanA
  const bIsClean = normalizeImportTitle(b) === cleanB
  if (aIsClean && !bIsClean) return a
  if (bIsClean && !aIsClean) return b
  return a.length <= b.length ? a : b
}

function titleTokens(normalized) {
  return normalized.split(/\s+/).filter(function(token) {
    return token.length > 2
  })
}

function stripLeadingArticle(clean) {
  return String(clean || '').replace(/^(the|a|an)\s+/, '')
}

function titlesMatchByTokenOverlap(cleanA, cleanB) {
  if (!cleanA || !cleanB) return false
  if (cleanA === cleanB) return true

  const ta = titleTokens(cleanA)
  const tb = titleTokens(cleanB)
  if (ta.length === 0 || tb.length === 0) return false
  if (ta.length !== tb.length) return false

  let inter = 0
  const setB = {}
  tb.forEach(function(t) { setB[t] = true })
  ta.forEach(function(t) {
    if (setB[t]) inter += 1
  })
  const union = ta.length + tb.length - inter
  if (union <= 0) return false
  return inter >= 2 && (inter / union) >= 0.7
}

/**
 * True when titles are similar enough to suggest a duplicate (settings merge UI).
 * Stricter than voice-search scoring; handles leading "the" variants.
 */
export function importTitlesMatchForSimilarDuplicate(titleA, titleB) {
  if (importTitlesMatchForDeduping(titleA, titleB)) return true

  const a = stripLeadingArticle(cleanImportTitleForMatching(titleA))
  const b = stripLeadingArticle(cleanImportTitleForMatching(titleB))
  return titlesMatchByTokenOverlap(a, b)
}

/**
 * True when titles are the same or clearly the same song (cleaned equality /
 * high token overlap). Extra substantive words (Aussie Jingle Bells vs Jingle
 * Bells) do not match. Version descriptors are ignored for comparison.
 */
export function importTitlesMatchForDeduping(titleA, titleB) {
  const rawA = normalizeImportTitle(titleA)
  const rawB = normalizeImportTitle(titleB)
  if (!rawA || !rawB) return false
  if (rawA === rawB) return true

  const a = cleanImportTitleForMatching(titleA)
  const b = cleanImportTitleForMatching(titleB)
  if (!a || !b) return false
  if (a === b) return true

  return titlesMatchByTokenOverlap(a, b)
}

export function tuneImportTitle(tune) {
  if (!tune) return ''
  return tune.name || tune.title || ''
}
