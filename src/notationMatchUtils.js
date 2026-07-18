export function normalizeMatchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
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
