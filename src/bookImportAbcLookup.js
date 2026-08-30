/**
 * ABC candidate ranking helpers for Import Book (EuroSession-style).
 */

const CHORD_LIKE_RE = /"\s*[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?\s*"/gi

export function normalizeLookupTitle(text) {
  return String(text || '')
    .replace(/\s*\(([A-G][#b]?(?:m|maj|min|dim|aug)?(?:\d)?(?:\/[A-G][#b]?)?|Harmony)\)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleSimilarity(a, b) {
  const na = normalizeLookupTitle(a)
  const nb = normalizeLookupTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return 0.85
  const wa = na.split(' ').filter(Boolean)
  const wb = new Set(nb.split(' ').filter(Boolean))
  if (!wa.length) return 0
  const overlap = wa.filter(function(w) { return wb.has(w) }).length
  return overlap / Math.max(wa.length, wb.size || 1)
}

export function chordCount(abc) {
  const matches = String(abc || '').match(CHORD_LIKE_RE)
  return matches ? matches.length : 0
}

export function looksWeakAbc(abc) {
  const text = String(abc || '')
  if (!text || text.length < 20) return true
  const notes = (text.match(/[A-Ga-g]/g) || []).length
  if (notes < 8) return true
  if (/"{2,}|""[A-G]/.test(text)) return true
  if (/(?:^|[^"A-Ga-g])(?:Am|Em|Dm|Bm|F#m|C#m){2,}/.test(text)) return true
  if (/[A-Ga-g](?:,*)(?:')*\d+\.\d+/.test(text)) return true
  return false
}

export function candidateId(source, abc) {
  let hash = 0
  const seed = String(source || '') + '\n' + String(abc || '').slice(0, 800)
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  const digest = Math.abs(hash).toString(16).slice(0, 10)
  const safe = String(source || 'src').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 40)
  return safe + '-' + digest
}

export function isOmrSource(candidate) {
  const s = String((candidate && candidate.source) || '').toLowerCase()
  return s === 'omr' || s.indexOf('omr') === 0
}

export function nonOmrCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter(function(c) {
    return c && !isOmrSource(c)
  })
}

/**
 * Sort display order: non-OMR first, then by score; OMR last.
 */
export function sortCandidatesForDisplay(candidates) {
  const list = (Array.isArray(candidates) ? candidates.slice() : []).filter(Boolean)
  list.sort(function(a, b) {
    const aOmr = isOmrSource(a) ? 1 : 0
    const bOmr = isOmrSource(b) ? 1 : 0
    if (aOmr !== bOmr) return aOmr - bOmr
    return (Number(b.score) || 0) - (Number(a.score) || 0)
  })
  return list
}

/**
 * Prefer a chorded non-OMR candidate when available (never auto-pick OMR).
 * @returns {object|null}
 */
export function pickPreferChordedCandidate(candidates) {
  const chorded = nonOmrCandidates(candidates).filter(function(c) {
    return c && (c.hasChords || chordCount(c.abc) >= 3)
  })
  if (!chorded.length) return null
  chorded.sort(function(a, b) {
    return (Number(b.score) || 0) - (Number(a.score) || 0)
  })
  return chorded[0]
}

/**
 * @param {object[]} candidates
 * @param {{ preferChords?: boolean }} [options]
 * @returns {object|null}
 */
export function pickBestAbcCandidate(candidates, options) {
  const opts = options || {}
  const list = Array.isArray(candidates) ? candidates.filter(function(c) {
    return c && String(c.abc || '').trim()
  }) : []
  if (!list.length) return null
  if (opts.preferChords !== false) {
    const chorded = pickPreferChordedCandidate(list)
    if (chorded) return chorded
  }
  // Never auto-prefer OMR when a non-OMR alternative exists
  const nonOmr = nonOmrCandidates(list)
  const pool = nonOmr.length ? nonOmr : list
  const scored = pool.map(function(c) {
    const abc = String(c.abc || '')
    let score = Number(c.score) || 0
    const chords = chordCount(abc)
    if (chords >= 3) score += 0.12
    if (looksWeakAbc(abc)) score -= 0.25
    if (isOmrSource(c)) score -= 0.05
    return Object.assign({}, c, { rankScore: score })
  })
  scored.sort(function(a, b) {
    return (b.rankScore || 0) - (a.rankScore || 0)
  })
  return scored[0]
}

export function autoSelectThreshold() {
  return 0.72
}

/**
 * Build candidate list from OMR + notation search + optional session hit.
 */
export function buildCandidateList(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const out = []
  const omrAbc = String(opts.omrAbc || '').trim()
  if (omrAbc) {
    out.push({
      id: candidateId('omr', omrAbc),
      source: 'omr',
      abc: omrAbc,
      score: looksWeakAbc(omrAbc) ? 0.35 : 0.55,
      title: title,
      hasChords: chordCount(omrAbc) >= 3,
    })
  }
  const omrChordsAbc = String(opts.omrChordsAbc || '').trim()
  if (omrChordsAbc) {
    const placed = Number(opts.omrChordsStatus && opts.omrChordsStatus.placed) || 0
    out.push({
      id: candidateId('omr-chords', omrChordsAbc),
      source: 'omr-chords',
      abc: omrChordsAbc,
      score: Math.min(0.75, 0.55 + 0.01 * Math.min(20, placed)),
      title: title,
      hasChords: true,
    })
  }
  const session = opts.sessionHit
  if (session && session.abc) {
    out.push({
      id: candidateId(session.source || 'thesession', session.abc),
      source: session.source || 'thesession',
      abc: String(session.abc),
      score: Number(session.score) || titleSimilarity(title, session.title || session.matchedTitle),
      title: session.title || session.matchedTitle || title,
      url: session.url || '',
      hasChords: chordCount(session.abc) >= 3,
    })
  }
  const notation = opts.notationResult
  const notationCandidates = notation && Array.isArray(notation.candidates)
    ? notation.candidates
    : []
  notationCandidates.forEach(function(item, index) {
    const abc = String(item && (item.abc || item.notation || item.text) || '').trim()
    if (!abc) return
    const matchedTitle = String(item.title || item.name || '').trim()
    const source = 'search-notation:' + String(item.source || item.provider || ('hit-' + index))
    out.push({
      id: candidateId(source, abc),
      source: source,
      abc: abc,
      score: Math.max(
        Number(item.score) || 0,
        titleSimilarity(title, matchedTitle)
      ),
      title: matchedTitle || title,
      url: item.url || item.sourceUrl || '',
      hasChords: chordCount(abc) >= 3,
    })
  })
  // Dedupe by id
  const seen = {}
  return out.filter(function(c) {
    if (seen[c.id]) return false
    seen[c.id] = true
    return true
  })
}
