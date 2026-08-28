/**
 * List filtering helpers for Import Book review UI.
 */

export function isOmrCandidate(candidate) {
  const s = String((candidate && candidate.source) || '').toLowerCase()
  return s === 'omr' || s.indexOf('omr') === 0
}

export function selectedCandidateForFilter(tune) {
  if (!tune) return null
  const list = Array.isArray(tune.candidates) ? tune.candidates : []
  if (tune.selectedCandidateId) {
    const hit = list.find(function(c) { return c && c.id === tune.selectedCandidateId })
    if (hit) return hit
  }
  if (tune.abc) {
    return {
      id: 'current',
      source: tune.abcSource || 'selected',
      abc: tune.abc,
    }
  }
  return list[0] || null
}

export function tuneMatchesStatusFilter(tune, statusFilter) {
  const mode = String(statusFilter || 'all')
  if (mode === 'all') return true
  if (mode === 'complete') return !!(tune && tune.complete)
  if (mode === 'incomplete') return !(tune && tune.complete)
  const cand = selectedCandidateForFilter(tune)
  if (mode === 'omr') return isOmrCandidate(cand)
  if (mode === 'abc') return !!(cand && String(cand.abc || '').trim()) && !isOmrCandidate(cand)
  return true
}

export function tuneMatchesNameQuery(tune, nameQuery) {
  const q = String(nameQuery || '').trim().toLowerCase()
  if (!q) return true
  if (!tune) return false
  const title = String(tune.title || '').toLowerCase()
  const id = String(tune.id || '').toLowerCase()
  return title.indexOf(q) >= 0 || id.indexOf(q) >= 0
}

export function filterReviewTunes(tunes, options) {
  const opts = options || {}
  const list = Array.isArray(tunes) ? tunes : []
  return list.filter(function(tune) {
    return tuneMatchesNameQuery(tune, opts.nameQuery)
      && tuneMatchesStatusFilter(tune, opts.statusFilter)
  })
}

export function reviewProgressTallies(tunes) {
  const list = Array.isArray(tunes) ? tunes : []
  let complete = 0
  let incomplete = 0
  let omr = 0
  let abc = 0
  list.forEach(function(tune) {
    if (tune && tune.complete) complete += 1
    else incomplete += 1
    const cand = selectedCandidateForFilter(tune)
    if (isOmrCandidate(cand)) omr += 1
    else if (cand && String(cand.abc || '').trim()) abc += 1
  })
  const total = list.length
  const percent = total ? Math.round((100 * complete) / total) : 0
  return {
    total: total,
    complete: complete,
    incomplete: incomplete,
    omr: omr,
    abc: abc,
    percent: percent,
  }
}
