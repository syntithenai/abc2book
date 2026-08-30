/**
 * Localforage store for oldtimefiddletunes.net enrich review packages.
 */
import localforage from 'localforage'
import {
  candidateId,
  chordCount,
  pickBestAbcCandidate,
} from './bookImportAbcLookup'

const INDEX_KEY = 'index'
const store = localforage.createInstance({ name: 'oldtimeenrichreview' })

function freshId() {
  return 'oldtime-review-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

async function readIndex() {
  const index = await store.getItem(INDEX_KEY)
  return Array.isArray(index) ? index.slice() : []
}

async function writeIndex(ids) {
  await store.setItem(INDEX_KEY, Array.isArray(ids) ? ids : [])
}

async function readSet(id) {
  if (!id) return null
  const set = await store.getItem('set:' + id)
  return set && typeof set === 'object' ? set : null
}

async function writeSet(set) {
  if (!set || !set.id) throw new Error('Invalid oldtime review set')
  await store.setItem('set:' + set.id, set)
  return set
}

export function computeTallies(tunes) {
  const list = Array.isArray(tunes) ? tunes : []
  let withCandidates = 0
  let needsNotation = 0
  let reviewed = 0
  let midiAvailable = 0
  let pdfAvailable = 0
  let hasSelection = 0
  list.forEach(function(t) {
    const cands = Array.isArray(t.candidates) ? t.candidates : []
    if (cands.length) withCandidates += 1
    if (!(t.selectedCandidateId || String(t.abc || '').trim())) needsNotation += 1
    if (t.reviewed) reviewed += 1
    if (t.midiUrl) midiAvailable += 1
    if (t.pdfUrl) pdfAvailable += 1
    if (t.selectedCandidateId || String(t.abc || '').trim()) hasSelection += 1
  })
  return {
    with_candidates: withCandidates,
    needs_notation: needsNotation,
    reviewed: reviewed,
    midi_available: midiAvailable,
    pdf_available: pdfAvailable,
    has_selection: hasSelection,
    total: list.length,
  }
}

export function normalizeEnrichPackage(pkg, options) {
  const opts = options || {}
  if (!pkg || pkg.kind !== 'oldtimefiddletunes-enrich' || !Array.isArray(pkg.tunes)) {
    throw new Error('Not an oldtimefiddletunes enrich package')
  }
  const tunes = pkg.tunes.map(function(raw, index) {
    const candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).map(function(c) {
      if (!c || !c.abc) return null
      const source = String(c.source || 'search')
      const abc = String(c.abc)
      return {
        id: c.id || candidateId(source, abc),
        source: source,
        abc: abc,
        score: Number(c.score) || 0,
        title: String(c.title || raw.title || ''),
        url: String(c.url || ''),
        hasChords: !!(c.hasChords || chordCount(abc) >= 3),
      }
    }).filter(Boolean)
    const best = pickBestAbcCandidate(candidates)
    const selectedId = raw.selectedCandidateId || (best && best.id) || ''
    const selected = candidates.find(function(c) { return c.id === selectedId }) || best
    const abc = selected ? selected.abc : String(raw.abc || '')
    const hasAbc = !!(selectedId || String(abc || '').trim())
    return {
      id: String(raw.id || ('oldtime-' + (raw.slug || index))),
      slug: String(raw.slug || ''),
      title: String(raw.title || 'Untitled'),
      key: String(raw.key || ''),
      notes: String(raw.notes || ''),
      section: String(raw.section || ''),
      sectionTag: String(raw.sectionTag || ''),
      book: String(raw.book || pkg.book || 'old time'),
      tags: Array.isArray(raw.tags) ? raw.tags.slice() : [pkg.siteTag || 'oldtimefiddletunes.net'],
      pdfUrl: String(raw.pdfUrl || ''),
      midiUrl: String(raw.midiUrl || ''),
      audioUrls: Array.isArray(raw.audioUrls) ? raw.audioUrls.slice() : [],
      youtubeUrls: Array.isArray(raw.youtubeUrls) ? raw.youtubeUrls.slice() : [],
      backingUrls: Array.isArray(raw.backingUrls) ? raw.backingUrls.slice() : [],
      candidates: candidates,
      selectedCandidateId: selected ? selected.id : '',
      abc: abc,
      abcSource: selected ? selected.source : String(raw.abcSource || ''),
      convertPrefer: String(raw.convertPrefer || (raw.midiUrl ? 'midi' : 'omr')),
      status: hasAbc ? 'has_candidates' : 'needs_notation',
      reviewed: !!raw.reviewed,
      tuneIndex: index + 1,
    }
  })
  return {
    id: opts.id || freshId(),
    name: opts.name || ('Old Time Fiddle Tunes (' + tunes.length + ')'),
    kind: 'oldtimefiddletunes-enrich',
    book: String(pkg.book || 'old time'),
    siteTag: String(pkg.siteTag || 'oldtimefiddletunes.net'),
    proof: !!pkg.proof,
    policy: pkg.policy && typeof pkg.policy === 'object' ? Object.assign({}, pkg.policy) : {
      source_only: true,
      no_search: true,
      allow_duplicate_titles: true,
      convert: 'midi_if_available_else_omr',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tunes: tunes,
    tallies: computeTallies(tunes),
  }
}

export async function listOldtimeEnrichSets() {
  const ids = await readIndex()
  const out = []
  for (let i = 0; i < ids.length; i += 1) {
    const set = await readSet(ids[i])
    if (!set) continue
    out.push({
      id: set.id,
      name: set.name,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
      tuneCount: Array.isArray(set.tunes) ? set.tunes.length : 0,
      tallies: set.tallies || {},
    })
  }
  out.sort(function(a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
  return out
}

export async function getOldtimeEnrichSet(id) {
  return readSet(id)
}

export async function updateOldtimeEnrichSet(set) {
  const next = Object.assign({}, set, { updatedAt: new Date().toISOString() })
  return writeSet(next)
}

export async function updateOldtimeTune(setId, tuneId, patch) {
  const set = await readSet(setId)
  if (!set) throw new Error('Review set not found')
  const tunes = (set.tunes || []).map(function(t) {
    if (!t || t.id !== tuneId) return t
    return Object.assign({}, t, patch || {})
  })
  return writeSet(Object.assign({}, set, {
    tunes: tunes,
    updatedAt: new Date().toISOString(),
    tallies: computeTallies(tunes),
  }))
}

export async function importEnrichPackage(pkg, options) {
  const set = normalizeEnrichPackage(pkg, options)
  const ids = await readIndex()
  if (ids.indexOf(set.id) < 0) {
    ids.unshift(set.id)
    await writeIndex(ids)
  }
  await writeSet(set)
  return set
}

export async function deleteOldtimeEnrichSet(id) {
  const ids = (await readIndex()).filter(function(x) { return x !== id })
  await writeIndex(ids)
  await store.removeItem('set:' + id)
}

export function buildEnrichExportPackage(set) {
  if (!set || !Array.isArray(set.tunes)) throw new Error('No review set')
  return {
    kind: 'oldtimefiddletunes-enrich',
    version: 1,
    book: set.book || 'old time',
    siteTag: set.siteTag || 'oldtimefiddletunes.net',
    built_at: new Date().toISOString(),
    tune_count: set.tunes.length,
    tallies: computeTallies(set.tunes),
    tunes: set.tunes,
  }
}

export function downloadEnrichPackage(set, fileName) {
  const pkg = buildEnrichExportPackage(set)
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'oldtimefiddletunes-enrich_package.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return pkg
}

export function filterOldtimeTunes(tunes, options) {
  const opts = options || {}
  const q = String(opts.nameQuery || '').trim().toLowerCase()
  const status = String(opts.statusFilter || 'all')
  return (Array.isArray(tunes) ? tunes : []).filter(function(t) {
    if (!t) return false
    if (q) {
      const hay = (t.title + ' ' + (t.notes || '') + ' ' + (t.section || '')).toLowerCase()
      if (hay.indexOf(q) < 0) return false
    }
    const cands = Array.isArray(t.candidates) ? t.candidates : []
    const hasAbc = !!(t.selectedCandidateId || String(t.abc || '').trim())
    if (status === 'needs_notation') return !hasAbc
    if (status === 'has_candidates') return cands.length > 0
    if (status === 'reviewed') return !!t.reviewed
    if (status === 'unreviewed') return !t.reviewed
    if (status === 'midi_available') return !!t.midiUrl && !hasAbc
    if (status === 'pdf_available') return !!t.pdfUrl && !hasAbc
    return true
  })
}
