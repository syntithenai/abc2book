/**
 * Upload and share Audio Analysis comparison reports on Google Drive.
 */
import { syncAudioAnalysisWithDrive, resolveAudioAnalysisDriveFolders, uploadNoteAudioToDrive, noteNeedsDriveUpload } from './audioAnalysisCloudSync'
import { getSet, listGroups, listSets, saveSet, findOrCreateGroupByLabel, saveNoteAudioBlob } from './soundpostSetStore'
import { buildAudioAnalysisComparePdfBlob } from './generateAudioAnalysisComparePdf'
import { isAnyoneReadable } from './shareOwnedMediaUtils'
import {
  AUDIO_ANALYSIS_SHARE_CONFIRM_KEY,
  buildAudioAnalysisShareLink,
  collectCompareDriveFileIds,
  collectDriveFileIdsFromSets,
  stripLocalOnlyCompareSet
} from './audioAnalysisShareUtils'

export const AUDIO_ANALYSIS_REPORTS_FOLDER = 'reports'

function emitProgress(onProgress, info) {
  if (typeof onProgress !== 'function') return
  try {
    onProgress(info || {})
  } catch (e) { /* ignore */ }
}

async function yieldToUi() {
  await new Promise(function(resolve) { setTimeout(resolve, 0) })
}

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
  return ensureSetsDrivePermissions(driveApi, [baseline, candidate], options)
}

export async function ensureSetsDrivePermissions(driveApi, sets, options) {
  const opts = options || {}
  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : function() { return true }
  const skipConfirm = !!opts.skipConfirm
  const onProgress = opts.onProgress
  const fileIds = collectDriveFileIdsFromSets(sets, opts.extraFileIds)
  const summary = { shared: 0, alreadyPublic: 0, failed: [], cancelled: 0 }

  let confirmed = skipConfirm || !!localStorage.getItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY)
  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i]
    emitProgress(onProgress, {
      phase: 'permissions',
      message: 'Checking Drive permissions ' + (i + 1) + '/' + fileIds.length,
      current: i + 1,
      total: fileIds.length
    })
    await yieldToUi()
    if (typeof driveApi.listPermissions === 'function') {
      const listed = await driveApi.listPermissions(fileId)
      if (isAnyoneReadable(listed)) {
        summary.alreadyPublic += 1
        continue
      }
    }
    if (!confirmed) {
      const ok = confirmFn(
        'Note audio in this share will be readable by anyone with the link. Continue?'
      )
      if (!ok) {
        summary.cancelled += 1
        return summary
      }
      confirmed = true
      localStorage.setItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY, 'true')
    }
    emitProgress(onProgress, {
      phase: 'permissions',
      message: 'Sharing note audio file ' + (i + 1) + '/' + fileIds.length,
      current: i + 1,
      total: fileIds.length
    })
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
  const onProgress = opts.onProgress
  if (!driveApi) return { ok: false, error: 'Not signed in' }
  if (!baselineId || !candidateId) return { ok: false, error: 'Missing comparison sets' }

  emitProgress(onProgress, { phase: 'sync', message: 'Syncing Audio Analysis with Google Drive…' })
  const sync = await syncAudioAnalysisWithDrive(driveApi, { onProgress: onProgress })
  if (!sync.ok) return sync

  emitProgress(onProgress, { phase: 'prepare', message: 'Loading comparison sets…' })
  const baseline = await getSet(baselineId)
  const candidate = await getSet(candidateId)
  if (!baseline || !candidate) {
    return { ok: false, error: 'Could not load comparison sets after sync' }
  }

  emitProgress(onProgress, { phase: 'prepare', message: 'Preparing Drive reports folder…' })
  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) return { ok: false, error: 'TuneBook folder not found' }
  const analysisFolderId = await driveApi.findOrCreateAudioAnalysisFolderInDrive(parentId)
  if (!analysisFolderId) return { ok: false, error: 'Could not open AudioAnalysis folder' }
  const reportsFolderId = await ensureReportsFolder(driveApi, analysisFolderId)
  if (!reportsFolderId) return { ok: false, error: 'Could not create reports folder' }

  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : window.confirm.bind(window)
  const permSummary = await ensureCompareDrivePermissions(driveApi, baseline, candidate, {
    confirm: confirmFn,
    skipConfirm: !!localStorage.getItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY),
    onProgress: onProgress
  })
  if (permSummary.cancelled) {
    return { ok: false, cancelled: true, error: 'Share cancelled' }
  }

  emitProgress(onProgress, { phase: 'upload', message: 'Uploading comparison manifest…' })
  await yieldToUi()
  const manifestFileId = await createAudioAnalysisCompareManifest(driveApi, reportsFolderId, baseline, candidate)
  if (!manifestFileId || manifestFileId.error) {
    return { ok: false, error: 'Could not upload comparison manifest' }
  }

  const shareLink = buildAudioAnalysisShareLink(manifestFileId)
  emitProgress(onProgress, { phase: 'upload', message: 'Building and uploading PDF report…' })
  await yieldToUi()
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
    skipConfirm: true,
    onProgress: onProgress
  })
  emitProgress(onProgress, { phase: 'permissions', message: 'Making report link public…' })
  await shareDriveFileAnyone(driveApi, manifestFileId)
  await shareDriveFileAnyone(driveApi, pdfFileId)

  emitProgress(onProgress, { phase: 'done', message: 'Share ready' })
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
    kind: 'compare',
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

export async function createAudioAnalysisSetManifest(driveApi, reportsFolderId, recordingSet, options) {
  const opts = options || {}
  const manifestBody = {
    version: 1,
    kind: 'set',
    createdAt: new Date().toISOString(),
    groupLabel: opts.groupLabel || null,
    set: stripLocalOnlyCompareSet(recordingSet)
  }
  const manifestName = 'set-' + recordingSet.id + '.json'
  const manifestBlob = new Blob([JSON.stringify(manifestBody, null, 2)], { type: 'application/json' })
  return driveApi.createDocument(
    manifestName,
    manifestBlob,
    'application/json',
    'Audio Analysis set manifest',
    reportsFolderId
  )
}

async function fetchSharedNoteBlob(driveApi, driveFileId) {
  if (!driveApi || !driveFileId) return null
  let blob = null
  if (typeof driveApi.getPublicDocumentBlob === 'function') {
    blob = await driveApi.getPublicDocumentBlob(driveFileId)
  }
  if ((!blob || blob.error) && typeof driveApi.getDocumentBlob === 'function') {
    blob = await driveApi.getDocumentBlob(driveFileId)
  }
  if (!blob || blob.error) return null
  return blob
}

/**
 * Import a shared set manifest into the recipient's local Audio Analysis store.
 * Matches/creates a group by groupLabel. Skips if this manifest was already imported.
 * When copyToDrive/blobsFolderId are set, note audio is uploaded into the recipient's
 * AudioAnalysis/blobs folder (independent of the sharer's Drive files).
 */
export async function importSharedAudioAnalysisSet(driveApi, options) {
  const opts = options || {}
  const sharedSet = opts.set
  const manifestFileId = opts.manifestFileId || null
  const onProgress = opts.onProgress
  const noteOffset = opts.noteOffset || 0
  const noteTotalOverall = opts.noteTotalOverall
  const setIndex = opts.setIndex
  const setTotal = opts.setTotal
  const blobsFolderIdOpt = opts.blobsFolderId || null
  let copyToDrive = !!opts.copyToDrive
  let blobsFolderId = blobsFolderIdOpt
  let driveCopyError = null
  const groupLabel = opts.groupLabel != null
    ? opts.groupLabel
    : (sharedSet && sharedSet.groupLabel)

  if (!sharedSet) return { ok: false, error: 'Missing shared set' }

  if (copyToDrive && !blobsFolderId) {
    emitProgress(onProgress, {
      phase: 'import-drive-prepare',
      message: 'Preparing your Google Drive for independent copies…'
    })
    await yieldToUi()
    const folders = await resolveAudioAnalysisDriveFolders(driveApi)
    if (folders.ok) {
      blobsFolderId = folders.blobsFolderId
    } else {
      copyToDrive = false
      driveCopyError = folders.error || 'Could not open your Google Drive'
    }
  }
  copyToDrive = copyToDrive && !!blobsFolderId

  const setLabel = sharedSet.label || 'Shared set'
  if (manifestFileId) {
    const existingSets = await listSets()
    const already = existingSets.find(function(s) {
      if (!s || s.sourceManifestId !== manifestFileId) return false
      if (sharedSet && sharedSet.id) return s.sourceSetId === sharedSet.id
      return true
    })
    if (already) {
      emitProgress(onProgress, {
        phase: 'import-skip',
        message: 'Already imported “' + setLabel + '”',
        setIndex: setIndex,
        setTotal: setTotal,
        current: noteOffset,
        total: noteTotalOverall
      })
      return { ok: true, alreadyImported: true, set: already, groupId: already.groupId || null }
    }
  }

  let groupId = null
  let group = null
  if (groupLabel) {
    group = await findOrCreateGroupByLabel(groupLabel)
    groupId = group ? group.id : null
  }

  const importedNotes = []
  const sourceNotes = sharedSet.notes || []
  const noteTotal = sourceNotes.length
  let notesCopiedToDrive = 0
  for (let i = 0; i < sourceNotes.length; i++) {
    const note = sourceNotes[i]
    if (!note) continue
    const overallCurrent = noteOffset + i + 1
    emitProgress(onProgress, {
      phase: 'import-note',
      message: 'Downloading audio for “' + setLabel + '” (' + (i + 1) + '/' + noteTotal + ')' +
        (note.targetNote ? ' · ' + note.targetNote : ''),
      setIndex: setIndex,
      setTotal: setTotal,
      setLabel: setLabel,
      noteIndex: i + 1,
      noteTotal: noteTotal,
      current: overallCurrent,
      total: noteTotalOverall != null ? noteTotalOverall : noteTotal
    })
    await yieldToUi()
    let audioBlobKey = null
    let driveFileId = null
    if (note.driveFileId) {
      const blob = await fetchSharedNoteBlob(driveApi, note.driveFileId)
      if (blob) audioBlobKey = await saveNoteAudioBlob(blob)
    }
    if (copyToDrive && audioBlobKey) {
      emitProgress(onProgress, {
        phase: 'import-drive-copy',
        message: 'Copying audio to your Google Drive (‘' + setLabel + '’, ' +
          (i + 1) + '/' + noteTotal + ')',
        setIndex: setIndex,
        setTotal: setTotal,
        setLabel: setLabel,
        noteIndex: i + 1,
        noteTotal: noteTotal,
        current: overallCurrent,
        total: noteTotalOverall != null ? noteTotalOverall : noteTotal
      })
      await yieldToUi()
      const uploaded = await uploadNoteAudioToDrive(driveApi, blobsFolderId, {
        audioBlobKey: audioBlobKey,
        driveFileId: null
      })
      if (uploaded && uploaded.driveFileId) {
        driveFileId = uploaded.driveFileId
        notesCopiedToDrive += 1
      }
    }
    const nextNote = {
      id: note.id || null,
      targetNote: note.targetNote,
      stringIndex: note.stringIndex,
      durationMs: note.durationMs,
      features: note.features || {},
      channelCount: note.channelCount || 1,
      audioBlobKey: audioBlobKey,
      // Prefer recipient-owned Drive copy; never keep the sharer's file id.
      driveFileId: driveFileId
    }
    if (note.featuresR) nextNote.featuresR = note.featuresR
    importedNotes.push(nextNote)
  }

  emitProgress(onProgress, {
    phase: 'import-save',
    message: 'Saving “' + setLabel + '” locally…',
    setIndex: setIndex,
    setTotal: setTotal,
    setLabel: setLabel,
    current: noteOffset + noteTotal,
    total: noteTotalOverall != null ? noteTotalOverall : noteTotal
  })
  await yieldToUi()

  const saved = await saveSet({
    label: setLabel,
    groupId: groupId,
    instrument: sharedSet.instrument || null,
    tuningPresetId: sharedSet.tuningPresetId || null,
    measurementMode: sharedSet.measurementMode || 'bowed',
    sequencePresetId: sharedSet.sequencePresetId || null,
    notes: importedNotes,
    tapPeaks: sharedSet.tapPeaks || null,
    tapPeaksR: sharedSet.tapPeaksR || null,
    channelCount: sharedSet.channelCount || null,
    stereoTap: sharedSet.stereoTap != null ? !!sharedSet.stereoTap : null,
    inputDeviceId: sharedSet.inputDeviceId || null,
    inputDeviceLabel: sharedSet.inputDeviceLabel || null,
    a4: sharedSet.a4 || null,
    sourceManifestId: manifestFileId,
    sourceSetId: sharedSet.id || null,
    needsSync: true
  })

  let indexSynced = false
  if (notesCopiedToDrive > 0 && opts.syncIndex !== false) {
    emitProgress(onProgress, {
      phase: 'import-drive-index',
      message: 'Updating your Audio Analysis Drive index…',
      setIndex: setIndex,
      setTotal: setTotal,
      current: noteOffset + noteTotal,
      total: noteTotalOverall != null ? noteTotalOverall : noteTotal
    })
    await yieldToUi()
    const sync = await syncAudioAnalysisWithDrive(driveApi, { onProgress: onProgress })
    indexSynced = !!(sync && sync.ok)
    if (!sync.ok && !driveCopyError) {
      driveCopyError = sync.error || 'Drive index sync failed'
    }
  }

  return {
    ok: true,
    alreadyImported: false,
    set: saved,
    group: group,
    groupId: groupId,
    notesImported: importedNotes.length,
    notesWithAudio: importedNotes.filter(function(n) { return !!n.audioBlobKey }).length,
    notesCopiedToDrive: notesCopiedToDrive,
    driveCopyReady: notesCopiedToDrive > 0 && !driveCopyError,
    driveCopyError: driveCopyError,
    indexSynced: indexSynced,
    needsLoginForDriveCopy: !!opts.copyToDrive && !blobsFolderId
  }
}

export async function prepareAudioAnalysisSetShare(driveApi, options) {
  const opts = options || {}
  const setId = opts.setId
  const onProgress = opts.onProgress
  if (!driveApi) return { ok: false, error: 'Not signed in' }
  if (!setId) return { ok: false, error: 'Missing recording set' }

  emitProgress(onProgress, { phase: 'sync', message: 'Syncing Audio Analysis with Google Drive…' })
  const sync = await syncAudioAnalysisWithDrive(driveApi, { onProgress: onProgress })
  if (!sync.ok) return sync

  emitProgress(onProgress, { phase: 'prepare', message: 'Loading recording set…' })
  const recordingSet = await getSet(setId)
  if (!recordingSet) {
    return { ok: false, error: 'Could not load recording set after sync' }
  }

  let groupLabel = null
  if (recordingSet.groupId) {
    const groups = await listGroups()
    const group = groups.find(function(g) { return g.id === recordingSet.groupId })
    if (group && group.label) groupLabel = group.label
  }

  emitProgress(onProgress, { phase: 'prepare', message: 'Preparing Drive reports folder…' })
  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) return { ok: false, error: 'TuneBook folder not found' }
  const analysisFolderId = await driveApi.findOrCreateAudioAnalysisFolderInDrive(parentId)
  if (!analysisFolderId) return { ok: false, error: 'Could not open AudioAnalysis folder' }
  const reportsFolderId = await ensureReportsFolder(driveApi, analysisFolderId)
  if (!reportsFolderId) return { ok: false, error: 'Could not create reports folder' }

  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : window.confirm.bind(window)
  const permSummary = await ensureCompareDrivePermissions(driveApi, recordingSet, null, {
    confirm: confirmFn,
    skipConfirm: !!localStorage.getItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY),
    onProgress: onProgress
  })
  if (permSummary.cancelled) {
    return { ok: false, cancelled: true, error: 'Share cancelled' }
  }

  emitProgress(onProgress, { phase: 'upload', message: 'Uploading set manifest…' })
  await yieldToUi()
  const manifestFileId = await createAudioAnalysisSetManifest(driveApi, reportsFolderId, recordingSet, {
    groupLabel: groupLabel
  })
  if (!manifestFileId || manifestFileId.error) {
    return { ok: false, error: 'Could not upload set manifest' }
  }

  const shareLink = buildAudioAnalysisShareLink(manifestFileId)
  await ensureCompareDrivePermissions(driveApi, recordingSet, null, {
    extraFileIds: [manifestFileId],
    skipConfirm: true,
    onProgress: onProgress
  })
  emitProgress(onProgress, { phase: 'permissions', message: 'Making set share link public…' })
  await shareDriveFileAnyone(driveApi, manifestFileId)

  emitProgress(onProgress, { phase: 'done', message: 'Share ready' })
  return {
    ok: true,
    link: shareLink,
    manifestFileId: manifestFileId,
    permissions: permSummary,
    groupLabel: groupLabel
  }
}

export async function createAudioAnalysisGroupManifest(driveApi, reportsFolderId, sets, options) {
  const opts = options || {}
  const groupLabel = opts.groupLabel || null
  const safeName = String(groupLabel || 'ungrouped').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40)
  const manifestBody = {
    version: 1,
    kind: 'group',
    createdAt: new Date().toISOString(),
    groupLabel: groupLabel,
    sets: (sets || []).map(function(s) { return stripLocalOnlyCompareSet(s) }).filter(Boolean)
  }
  const manifestName = 'group-' + safeName + '-' + Date.now().toString(36) + '.json'
  const manifestBlob = new Blob([JSON.stringify(manifestBody, null, 2)], { type: 'application/json' })
  return driveApi.createDocument(
    manifestName,
    manifestBlob,
    'application/json',
    'Audio Analysis group manifest',
    reportsFolderId
  )
}

export async function prepareAudioAnalysisGroupShare(driveApi, options) {
  const opts = options || {}
  const groupId = opts.groupId != null ? opts.groupId : null
  const groupLabel = opts.groupLabel != null ? opts.groupLabel : null
  const onProgress = opts.onProgress
  if (!driveApi) return { ok: false, error: 'Not signed in' }

  emitProgress(onProgress, { phase: 'sync', message: 'Syncing Audio Analysis with Google Drive…' })
  const sync = await syncAudioAnalysisWithDrive(driveApi, { onProgress: onProgress })
  if (!sync.ok) return sync

  emitProgress(onProgress, { phase: 'prepare', message: 'Collecting sets in this group…' })
  const allSets = await listSets()
  const sets = allSets.filter(function(s) {
    if (!s) return false
    if (groupId == null || groupId === '') return !s.groupId
    return s.groupId === groupId
  })
  if (!sets.length) return { ok: false, error: 'No sets in this group to share' }

  emitProgress(onProgress, { phase: 'prepare', message: 'Preparing Drive reports folder…' })
  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) return { ok: false, error: 'TuneBook folder not found' }
  const analysisFolderId = await driveApi.findOrCreateAudioAnalysisFolderInDrive(parentId)
  if (!analysisFolderId) return { ok: false, error: 'Could not open AudioAnalysis folder' }
  const reportsFolderId = await ensureReportsFolder(driveApi, analysisFolderId)
  if (!reportsFolderId) return { ok: false, error: 'Could not create reports folder' }

  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : window.confirm.bind(window)
  const permSummary = await ensureSetsDrivePermissions(driveApi, sets, {
    confirm: confirmFn,
    skipConfirm: !!localStorage.getItem(AUDIO_ANALYSIS_SHARE_CONFIRM_KEY),
    onProgress: onProgress
  })
  if (permSummary.cancelled) {
    return { ok: false, cancelled: true, error: 'Share cancelled' }
  }

  emitProgress(onProgress, {
    phase: 'upload',
    message: 'Uploading group manifest (' + sets.length + ' set' + (sets.length === 1 ? '' : 's') + ')…'
  })
  await yieldToUi()
  const manifestFileId = await createAudioAnalysisGroupManifest(driveApi, reportsFolderId, sets, {
    groupLabel: groupLabel
  })
  if (!manifestFileId || manifestFileId.error) {
    return { ok: false, error: 'Could not upload group manifest' }
  }

  const shareLink = buildAudioAnalysisShareLink(manifestFileId)
  await ensureSetsDrivePermissions(driveApi, sets, {
    extraFileIds: [manifestFileId],
    skipConfirm: true,
    onProgress: onProgress
  })
  emitProgress(onProgress, { phase: 'permissions', message: 'Making group share link public…' })
  await shareDriveFileAnyone(driveApi, manifestFileId)

  emitProgress(onProgress, { phase: 'done', message: 'Share ready' })
  return {
    ok: true,
    link: shareLink,
    manifestFileId: manifestFileId,
    permissions: permSummary,
    groupLabel: groupLabel,
    setCount: sets.length
  }
}

export async function importSharedAudioAnalysisGroup(driveApi, options) {
  const opts = options || {}
  const sharedSets = opts.sets || []
  const manifestFileId = opts.manifestFileId || null
  const groupLabel = opts.groupLabel || null
  const onProgress = opts.onProgress
  const copyToDrive = opts.copyToDrive !== false
  if (!sharedSets.length) return { ok: false, error: 'Missing shared sets' }

  let noteTotalOverall = 0
  sharedSets.forEach(function(s) {
    noteTotalOverall += ((s && s.notes) || []).length
  })

  let blobsFolderId = opts.blobsFolderId || null
  let driveCopyReady = false
  let driveCopyError = null
  if (copyToDrive) {
    emitProgress(onProgress, {
      phase: 'import-drive-prepare',
      message: 'Preparing your Google Drive for independent copies…',
      current: 0,
      total: noteTotalOverall
    })
    await yieldToUi()
    const folders = await resolveAudioAnalysisDriveFolders(driveApi)
    if (folders.ok) {
      blobsFolderId = folders.blobsFolderId
      driveCopyReady = true
    } else {
      driveCopyError = folders.error || 'Could not open your Google Drive'
      emitProgress(onProgress, {
        phase: 'import-drive-prepare',
        message: driveCopyError + ' — importing locally for now.',
        current: 0,
        total: noteTotalOverall
      })
    }
  }

  emitProgress(onProgress, {
    phase: 'import-start',
    message: 'Importing ' + sharedSets.length + ' set' + (sharedSets.length === 1 ? '' : 's') + '…',
    setIndex: 0,
    setTotal: sharedSets.length,
    current: 0,
    total: noteTotalOverall
  })
  await yieldToUi()

  const imported = []
  let already = 0
  let notesWithAudio = 0
  let notesImported = 0
  let notesCopiedToDrive = 0
  let group = null
  let groupId = null
  let noteOffset = 0

  for (let i = 0; i < sharedSets.length; i++) {
    const sharedSet = sharedSets[i]
    emitProgress(onProgress, {
      phase: 'import-set',
      message: 'Importing set ' + (i + 1) + '/' + sharedSets.length +
        (sharedSet && sharedSet.label ? (' · ' + sharedSet.label) : ''),
      setIndex: i + 1,
      setTotal: sharedSets.length,
      setLabel: sharedSet && sharedSet.label,
      current: noteOffset,
      total: noteTotalOverall
    })
    await yieldToUi()
    const result = await importSharedAudioAnalysisSet(driveApi, {
      set: sharedSet,
      groupLabel: groupLabel,
      manifestFileId: manifestFileId,
      onProgress: onProgress,
      noteOffset: noteOffset,
      noteTotalOverall: noteTotalOverall,
      setIndex: i + 1,
      setTotal: sharedSets.length,
      copyToDrive: driveCopyReady,
      blobsFolderId: blobsFolderId,
      syncIndex: false
    })
    if (!result.ok) return result
    if (result.alreadyImported) already += 1
    else imported.push(result.set)
    if (result.group) group = result.group
    if (result.groupId) groupId = result.groupId
    notesWithAudio += result.notesWithAudio || 0
    notesImported += result.notesImported || 0
    notesCopiedToDrive += result.notesCopiedToDrive || 0
    noteOffset += ((sharedSet && sharedSet.notes) || []).length
  }

  let indexSynced = false
  if (driveCopyReady && (notesCopiedToDrive > 0 || imported.length > 0)) {
    emitProgress(onProgress, {
      phase: 'import-drive-index',
      message: 'Updating your Audio Analysis Drive index…',
      current: noteTotalOverall,
      total: noteTotalOverall
    })
    await yieldToUi()
    const sync = await syncAudioAnalysisWithDrive(driveApi, { onProgress: onProgress })
    indexSynced = !!(sync && sync.ok)
    if (!sync.ok && !driveCopyError) {
      driveCopyError = sync.error || 'Drive index sync failed'
    }
  }

  emitProgress(onProgress, {
    phase: 'import-done',
    message: already > 0 && imported.length === 0
      ? 'Already imported'
      : ('Imported ' + imported.length + ' set' + (imported.length === 1 ? '' : 's')),
    setIndex: sharedSets.length,
    setTotal: sharedSets.length,
    current: noteTotalOverall,
    total: noteTotalOverall
  })

  return {
    ok: true,
    alreadyImported: already > 0 && imported.length === 0,
    importedCount: imported.length,
    alreadyCount: already,
    set: imported[0] || null,
    group: group,
    groupId: groupId,
    notesImported: notesImported,
    notesWithAudio: notesWithAudio,
    notesCopiedToDrive: notesCopiedToDrive,
    driveCopyReady: driveCopyReady,
    driveCopyError: driveCopyError,
    indexSynced: indexSynced,
    needsLoginForDriveCopy: !driveCopyReady && !!copyToDrive
  }
}

/** True when imported sets for this manifest still need recipient Drive uploads. */
export async function importedSetsNeedDriveCopy(manifestFileId) {
  if (!manifestFileId) return false
  const sets = await listSets()
  return sets.some(function(s) {
    if (!s || s.sourceManifestId !== manifestFileId) return false
    return (s.notes || []).some(function(n) { return noteNeedsDriveUpload(n) })
  })
}

/**
 * Copy local imported note audio into the recipient's Google Drive and refresh the index.
 * Used when import ran without login, or to finish a partial Drive copy.
 */
export async function copyImportedAudioAnalysisToDrive(driveApi, options) {
  const opts = options || {}
  const onProgress = opts.onProgress
  const manifestFileId = opts.manifestFileId || null

  const folders = await resolveAudioAnalysisDriveFolders(driveApi)
  if (!folders.ok) return folders

  const sets = await listSets()
  const targets = sets.filter(function(s) {
    if (!s) return false
    if (manifestFileId && s.sourceManifestId !== manifestFileId) return false
    return (s.notes || []).some(function(n) { return noteNeedsDriveUpload(n) })
  })
  if (!targets.length) {
    emitProgress(onProgress, { phase: 'drive-copy-done', message: 'Audio already on your Google Drive' })
    return { ok: true, uploaded: 0, sets: 0 }
  }

  let uploaded = 0
  let noteCursor = 0
  let noteTotal = 0
  targets.forEach(function(s) {
    ;(s.notes || []).forEach(function(n) {
      if (noteNeedsDriveUpload(n)) noteTotal += 1
    })
  })

  for (let i = 0; i < targets.length; i++) {
    const set = targets[i]
    const nextNotes = []
    for (let j = 0; j < (set.notes || []).length; j++) {
      let note = set.notes[j]
      if (noteNeedsDriveUpload(note)) {
        noteCursor += 1
        emitProgress(onProgress, {
          phase: 'import-drive-copy',
          message: 'Copying audio to your Google Drive (' + noteCursor + '/' + noteTotal + ')' +
            (set.label ? (' · ' + set.label) : ''),
          current: noteCursor,
          total: noteTotal
        })
        await yieldToUi()
        const updated = await uploadNoteAudioToDrive(driveApi, folders.blobsFolderId, note)
        if (updated && updated.driveFileId && !note.driveFileId) uploaded += 1
        note = updated
      }
      nextNotes.push(note)
    }
    await saveSet(Object.assign({}, set, { notes: nextNotes, needsSync: true }))
  }

  emitProgress(onProgress, {
    phase: 'import-drive-index',
    message: 'Updating your Audio Analysis Drive index…',
    current: noteTotal,
    total: noteTotal
  })
  const sync = await syncAudioAnalysisWithDrive(driveApi, { onProgress: onProgress })
  if (!sync.ok) return sync

  return {
    ok: true,
    uploaded: uploaded,
    sets: targets.length,
    indexSynced: true
  }
}

