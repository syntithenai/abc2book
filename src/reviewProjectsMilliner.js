/**
 * Load Milliner–Koken / book-import packages from the resolver review root
 * into bookImportReviewStore (crops fetched lazily via cropRemotePath).
 */
import {
  createReviewSet,
  createBlankTuneRecord,
  updateReviewSet,
  listReviewSets,
  getReviewSet,
} from './bookImportReviewStore'
import { parseEurosessionImportPackage } from './eurosessionTunebookImport'
import { fetchReviewProjectsJson } from './reviewProjectsClient'

const MILLINER_SESSION_PREFIX = 'Milliner–Koken'

export async function ensureMillinerReviewSet(project, accessToken) {
  if (!project || !project.packagePath) {
    throw new Error('Milliner–Koken package path missing from catalog')
  }
  const existing = await listReviewSets()
  const hit = existing.find(function(s) {
    return s && String(s.book || '').toLowerCase() === 'milliner koken'
  })
  if (hit) {
    const full = await getReviewSet(hit.id)
    if (full && Array.isArray(full.tunes) && full.tunes.length) {
      return full
    }
  }

  const raw = await fetchReviewProjectsJson(project.packagePath, accessToken)
  const pkg = parseEurosessionImportPackage(raw)
  const cropsDir = String(project.cropsDir || '').replace(/\/+$/, '')
  const set = await createReviewSet({
    name: MILLINER_SESSION_PREFIX + ' (Documents)',
    book: pkg.book,
    bookLabel: pkg.bookLabel || 'Milliner Koken',
  })
  const tunes = pkg.tunes.map(function(t) {
    const cropName = String(t.crop || '').trim()
    const cropRemotePath = cropName && cropsDir
      ? (cropsDir + '/' + cropName)
      : ''
    return createBlankTuneRecord({
      id: t.id,
      title: t.title,
      page: t.page,
      tuneIndex: t.tuneIndex,
      cropName: cropName,
      cropRemotePath: cropRemotePath,
      abc: t.abc,
      complete: t.complete,
      key: t.key,
      notationOnly: t.notationOnly,
      joinTier: t.joinTier,
      status: t.complete ? 'ready' : 'needs-review',
      abcSource: t.abc ? 'import-package' : '',
    })
  })
  return updateReviewSet(set.id, {
    tunes: tunes,
    status: 'review',
    documentsProjectId: 'milliner-koken',
    defaultStatusFilter: 'incomplete',
  })
}
