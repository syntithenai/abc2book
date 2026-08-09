/**
 * Display-time enrichment vs import-time persistence boundaries.
 */
import { expandRepeatedSectionLyrics } from './chordSheetUtils'
import { getPlainLyricLines } from './wLinesUtils'

/** Fields written at import / edit save. */
export const PERSISTED_TUNE_LYRIC_FIELDS = [
  'words',
  'wLines',
  'chordSectionLabels',
]

export const PERSISTED_TUNE_META_FIELDS = [
  'chordProSource',
  'chordSheetAlignment',
]

/**
 * Read-only transforms applied when rendering lyrics/chords (not stored).
 */
export function enrichLyricLinesForDisplay(tune) {
  return expandRepeatedSectionLyrics(getPlainLyricLines(tune || {}))
}

/**
 * Whether a tune field should be updated on import commit.
 */
export function isPersistedImportField(fieldKey) {
  return PERSISTED_TUNE_LYRIC_FIELDS.indexOf(fieldKey) >= 0
    || PERSISTED_TUNE_META_FIELDS.indexOf(fieldKey) >= 0
}

/**
 * Whether display enrichment would change lyric text vs stored words.
 */
export function displayEnrichmentChangesLyrics(tune) {
  const stored = getPlainLyricLines(tune || {})
  const display = enrichLyricLinesForDisplay(tune || {})
  if (stored.length !== display.length) return true
  for (let i = 0; i < stored.length; i++) {
    if (String(stored[i] || '') !== String(display[i] || '')) return true
  }
  return false
}

/**
 * Policy helper: checks should use stored lyrics; views may use enriched lines.
 */
export function lyricLinesForChecks(tune) {
  return getPlainLyricLines(tune || {})
}

export function lyricLinesForViews(tune) {
  return enrichLyricLinesForDisplay(tune || {})
}
