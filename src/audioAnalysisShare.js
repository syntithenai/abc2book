/**
 * Upload and share Audio Analysis comparison reports on Google Drive.
 */
import { syncAudioAnalysisWithDrive } from './audioAnalysisCloudSync'
import { getSet } from './soundpostSetStore'
import { buildAudioAnalysisComparePdfBlob } from './generateAudioAnalysisComparePdf'
import { isAnyoneReadable } from './shareOwnedMediaUtils'
import {
  AUDIO_ANALYSIS_SHARE_CONFIRM_KEY,
  buildAudioAnalysisShareLink,
  collectCompareDriveFileIds,
  stripLocalOnlyCompareSet
} from './audioAnalysisShareUtils'

export const AUDIO_ANALYSIS_REPORTS_FOLDER = 'reports'

async function findChildByName(driveApi, parentId, name) {
  if (!driveApi || !parentId || !name) return null
  if (typeof driveApi.findFileInFolder === 'function') {
    return driveApi.findFileInFolder(parentId, name)
  }
  return null
}

async function ensureReportsFolder(driveApi, analysisFolderId) {
  let id = await findChildByName(driveApi, analysisFolderId, AUDIO_ANALYSIS_REPORTS_FOLDER)
  if (id) return id
  const created = await driveApi.createDocument(
    AUDIO_ANALYSIS_REPORTS_FOLDER,
    null,
    'application/vnd.google-apps.folder',
    'Audio Analysis comparison reports',
    analysisFolderId
  )
  return created && !created.error ? created : null
}

async function shareDriveFileAnyone(driveApi, fileId) {
  if (!fileId || !driveApi || typeof driveApi.addPermission !== 'function') {
    return { ok: false, error: 'Drive API unavailable' }
  }
  const perm = await driveApi.addPermission(fileId, { type: 'anyone', role: 'reader' })
  if (perm && perm.error) return { ok: false, error: perm.error }
  return { ok: true }
}

async function ensureAnyoneReadable(driveApi, fileId, confirmFn, label) {
  if (!fileId) return { ok: false, skipped: true }
  if (typeof driveApi.listPermissions === 'function') {
    const listed = await driveApi.listPermissions(fileId)
    if (isAnyoneReadable(listed)) return { ok: true, alreadyPublic: true }
  }
  const ok = confirmFn(
    (label || 'This comparison file') +
      ' and its note audio will be readable by anyone with the link. Continue?'
  )
  if (!ok) return { ok: false, cancelled: true }
  return shareDriveFileAnyone(driveApi, fileId)
}

export async function ensureCompareDrivePermissions(driveApi, baseline, candidate, options) {
  const opts = options || {}
  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : function() { return true }
  const skipConfirm = !!opts.skipConfirm
  const fileIds = collectCompareDriveFileIds(baseline, candidate, opts.extraFileIds)
  const summary = { shared: 0, alreadyPublic: 0, failed: [], cancelled: 0 }

  let confirmed = skipConfirm || !!localStorage.getItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY)
  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i]
    if (typeof driveApi.listPermissions === 'function') {
      const listed = await driveApi.listPermissions(fileId)
      if (isAnyoneReadable(listed)) {
        summary.alreadyPublic += 1
        continue
      }
    }
    if (!confirmed) {
      const ok = confirmFn(
        'Note audio in this comparison will be readable by anyone with the report link. Continue?'
      )
      if (!ok) {
        summary.cancelled += 1
        return summary
      }
      confirmed = true
      localStorage.setItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY, 'true')
    }
    const result = await shareDriveFileAnyone(driveApi, fileId)
    if (result.ok) summary.shared += 1
    else summary.failed.push(fileId)
  }
  return summary
}

export async function prepareAudioAnalysisCompareShare(driveApi, options) {
  const opts = options || {}
  const baselineId = opts.baselineId
  const candidateId = opts.candidateId
  if (!driveApi) return { ok: false, error: 'Not signed in' }
  if (!baselineId || !candidateId) return { ok: false, error: 'Missing comparison sets' }

  const sync = await syncAudioAnalysisWithDrive(driveApi)
  if (!sync.ok) return sync

  const baseline = await getSet(baselineId)
  const candidate = await getSet(candidateId)
  if (!baseline || !candidate) {
    return { ok: false, error: 'Could not load comparison sets after sync' }
  }

  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) return { ok: false, error: 'TuneBook folder not found' }
  const analysisFolderId = await driveApi.findOrCreateAudioAnalysisFolderInDrive(parentId)
  if (!analysisFolderId) return { ok: false, error: 'Could not open AudioAnalysis folder' }
  const reportsFolderId = await ensureReportsFolder(driveApi, analysisFolderId)
  if (!reportsFolderId) return { ok: false, error: 'Could not create reports folder' }

  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : window.confirm.bind(window)
  const permSummary = await ensureCompareDrivePermissions(driveApi, baseline, candidate, {
    confirm: confirmFn,
    skipConfirm: !!localStorage.getItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY)
  })
  if (permSummary.cancelled) {
    return { ok: false, cancelled: true, error: 'Share cancelled' }
  }

  const manifestFileId = await createAudioAnalysisCompareManifest(driveApi, reportsFolderId, baseline, candidate)
  if (!manifestFileId || manifestFileId.error) {
    return { ok: false, error: 'Could not upload comparison manifest' }
  }

  const shareLink = buildAudioAnalysisShareLink(manifestFileId)
  const pdf = await buildAudioAnalysisComparePdfBlob({
    baseline: baseline,
    candidate: candidate
  })
  const pdfFileId = await driveApi.createDocument(
    pdf.filename,
    pdf.blob,
    'application/pdf',
    'Audio Analysis comparison report',
    reportsFolderId
  )
  if (!pdfFileId || pdfFileId.error) {
    return { ok: false, error: 'Could not upload comparison PDF' }
  }

  await ensureCompareDrivePermissions(driveApi, baseline, candidate, {
    extraFileIds: [manifestFileId, pdfFileId],
    skipConfirm: true
  })
  await shareDriveFileAnyone(driveApi, manifestFileId)
  await shareDriveFileAnyone(driveApi, pdfFileId)

  return {
    ok: true,
    link: shareLink,
    manifestFileId: manifestFileId,
    pdfFileId: pdfFileId,
    pdfFilename: pdf.filename,
    permissions: permSummary
  }
}

export async function createAudioAnalysisCompareManifest(driveApi, reportsFolderId, baseline, candidate) {
  const manifestBody = {
    version: 1,
    createdAt: new Date().toISOString(),
    baseline: stripLocalOnlyCompareSet(baseline),
    candidate: stripLocalOnlyCompareSet(candidate)
  }
  const manifestName = 'compare-' + baseline.id + '-' + candidate.id + '.json'
  const manifestBlob = new Blob([JSON.stringify(manifestBody, null, 2)], { type: 'application/json' })
  return driveApi.createDocument(
    manifestName,
    manifestBlob,
    'application/json',
    'Audio Analysis comparison manifest',
    reportsFolderId
  )
}

