/**
 * Load oldtimefiddletunes enrich packages from the resolver review root
 * into bookImportReviewStore (MIDI/PDF via remote URLs or Documents media).
 */
import {
  createReviewSet,
  createBlankTuneRecord,
  updateReviewSet,
  listReviewSets,
  getReviewSet,
} from './bookImportReviewStore'
import { fetchReviewProjectsJson } from './reviewProjectsClient'
import { candidateId, chordCount } from './bookImportAbcLookup'

const OLDTIME_SESSION_PREFIX = 'Old Time Fiddle'
const OLDTIME_BOOK = 'old time'

function mediaRemotePath(localRel) {
  const rel = String(localRel || '').replace(/^\/+/, '').replace(/^media\//, '')
  if (!rel) return ''
  return 'oldtimefiddletunes/data/media/' + rel
}

function normalizeCandidates(rawList) {
  return (Array.isArray(rawList) ? rawList : []).map(function(c) {
    if (!c || !c.abc) return null
    const source = String(c.source || 'search')
    const abc = String(c.abc)
    return {
      id: c.id || candidateId(source, abc),
      source: source,
      abc: abc,
      score: Number(c.score) || 0,
      title: String(c.title || ''),
      url: String(c.url || ''),
      hasChords: c.hasChords != null ? !!c.hasChords : chordCount(abc) >= 3,
    }
  }).filter(Boolean)
}

/**
 * @param {object} project catalog entry from /review-projects
 * @param {string} accessToken
 * @param {{ preferProof?: boolean }} [options]
 */
export async function ensureOldtimeReviewSet(project, accessToken, options) {
  const opts = options || {}
  if (!project) throw new Error('Old Time project missing from catalog')

  const existing = await listReviewSets()
  const hit = existing.find(function(s) {
    return s && (
      String(s.book || '').toLowerCase() === OLDTIME_BOOK
      || String(s.documentsProjectId || '') === 'oldtimefiddletunes'
    )
  })
  if (hit) {
    const full = await getReviewSet(hit.id)
    if (full && Array.isArray(full.tunes) && full.tunes.length) {
      return full
    }
  }

  const packagePath = opts.preferProof !== false && project.proofPackagePath
    ? project.proofPackagePath
    : (project.fullPackagePath || project.dataPackagePath || project.proofPackagePath)
  if (!packagePath) {
    throw new Error('Old Time package path missing from catalog')
  }

  const raw = await fetchReviewProjectsJson(packagePath, accessToken)
  if (!raw || raw.kind !== 'oldtimefiddletunes-enrich' || !Array.isArray(raw.tunes)) {
    throw new Error('Not an oldtimefiddletunes enrich package')
  }

  const set = await createReviewSet({
    name: OLDTIME_SESSION_PREFIX + (raw.proof ? ' proof' : '') + ' (Documents)',
    book: OLDTIME_BOOK,
    bookLabel: 'Old Time',
  })

  const tunes = raw.tunes.map(function(t, index) {
    const candidates = normalizeCandidates(t.candidates)
    const selectedId = String(t.selectedCandidateId || '').trim()
    const selected = selectedId
      ? candidates.find(function(c) { return c.id === selectedId })
      : null
    const abc = String((selected && selected.abc) || t.abc || '').trim()
    const midiRemotePath = mediaRemotePath(t.localMidiPath)
    const pdfRemotePath = mediaRemotePath(t.localPdfPath)
    return createBlankTuneRecord({
      id: String(t.id || ('oldtime-' + (t.slug || index))),
      title: String(t.title || t.slug || 'Untitled').trim() || 'Untitled',
      page: Number(t.page) || 1,
      tuneIndex: Number(t.tuneIndex) || (index + 1),
      abc: abc,
      complete: !!(t.reviewed && abc),
      key: String(t.key || '').trim(),
      candidates: candidates,
      selectedCandidateId: selected ? selected.id : (abc ? 'current' : ''),
      abcSource: abc ? String(t.abcSource || (selected && selected.source) || 'import-package') : '',
      status: abc ? 'ready' : 'needs-review',
      slug: String(t.slug || ''),
      midiUrl: String(t.midiUrl || ''),
      pdfUrl: String(t.pdfUrl || ''),
      midiRemotePath: midiRemotePath,
      pdfRemotePath: pdfRemotePath,
      convertPrefer: String(t.convertPrefer || (t.midiUrl ? 'midi' : 'omr')),
      section: String(t.section || ''),
    })
  })

  return updateReviewSet(set.id, {
    tunes: tunes,
    status: 'review',
    documentsProjectId: 'oldtimefiddletunes',
    defaultStatusFilter: 'incomplete',
  })
}
