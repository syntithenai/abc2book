export function normalizeMatchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function scoreTitleArtistMatch(candidateTitle, candidateArtist, title, artist) {
  const titleKey = normalizeMatchText(title)
  const artistKey = normalizeMatchText(artist)
  const candidateTitleKey = normalizeMatchText(candidateTitle)
  const candidateArtistKey = normalizeMatchText(candidateArtist)
  let score = 0

  if (titleKey && candidateTitleKey) {
    if (candidateTitleKey === titleKey) score += 80
    else if (titleKey.indexOf(candidateTitleKey) !== -1 || candidateTitleKey.indexOf(titleKey) !== -1) {
      score += 45
    }
  }

  if (artistKey && candidateArtistKey) {
    if (candidateArtistKey === artistKey) score += 60
    else if (artistKey.indexOf(candidateArtistKey) !== -1 || candidateArtistKey.indexOf(artistKey) !== -1) {
      score += 30
    }
  }

  return score
}
