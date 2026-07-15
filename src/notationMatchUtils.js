export function normalizeMatchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
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
  const titleKey = normalizeMatchText(title)
  const artistKey = normalizeMatchText(artist)
  const candidateTitleKey = normalizeMatchText(candidateTitle)
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
