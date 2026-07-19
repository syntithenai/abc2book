import utilsFunctions from './utilsFunctions'
import { resolveTuneFileBlob } from './tuneFiles'
import { transcribeSheetImageFile } from './sheetImageTranscriptionClient'

const utils = utilsFunctions()
const listeners = new Set()
const jobsById = {}

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function subscribeFileOcrJobs(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}

export function getFileOcrJobs() {
  return Object.keys(jobsById).map(function(id) {
    return jobsById[id]
  })
}

export function getFileOcrJob(jobId) {
  return jobId ? jobsById[jobId] || null : null
}

export function findFileOcrJobForFile(tuneId, fileId) {
  const list = getFileOcrJobs()
  for (let i = 0; i < list.length; i += 1) {
    const job = list[i]
    if (job && job.tuneId === tuneId && job.fileId === fileId
      && (job.status === 'pending' || job.status === 'running' || job.status === 'ready')) {
      return job
    }
  }
  return null
}

export function getFileOcrReviewSummary() {
  const jobs = getFileOcrJobs()
  const ready = []
  const processing = []
  const failed = []
  jobs.forEach(function(job) {
    if (!job) return
    if (job.status === 'ready') ready.push(job.id)
    if (job.status === 'pending' || job.status === 'running') processing.push(job.id)
    if (job.status === 'failed') failed.push(job.id)
  })
  return {
    ready: ready,
    processing: processing,
    failed: failed,
    total: ready.length + processing.length,
  }
}

function isActiveFileOcrStatus(status) {
  return status === 'pending' || status === 'running'
}

function proposedPatchesFromTranscription(body, tune) {
  const patches = []
  if (!body) return patches
  const chordText = body.chordSheet && typeof body.chordSheet.text === 'string'
    ? body.chordSheet.text.trim()
    : ''
  const melodyAbc = body.melody && typeof body.melody.abc === 'string'
    ? body.melody.abc.trim()
    : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const artist = typeof body.artist === 'string' ? body.artist.trim() : ''

  if (chordText) {
    patches.push({
      field: 'words',
      label: 'Lyrics / chord sheet',
      oldValue: Array.isArray(tune && tune.words) ? tune.words.join('\n') : '',
      newValue: chordText,
    })
  }
  if (melodyAbc) {
    patches.push({
      field: 'notes',
      label: 'Melody (ABC)',
      oldValue: '',
      newValue: melodyAbc,
    })
  }
  if (title && (!tune || !tune.name || String(tune.name).trim() !== title)) {
    patches.push({
      field: 'name',
      label: 'Title',
      oldValue: (tune && tune.name) || '',
      newValue: title,
    })
  }
  if (artist) {
    patches.push({
      field: 'composer',
      label: 'Artist / composer',
      oldValue: (tune && tune.composer) || '',
      newValue: artist,
    })
  }
  return patches
}

async function runFileOcrJob(jobId, options) {
  const job = jobsById[jobId]
  if (!job) return
  if (job.status === 'cancelled') return
  const abortController = new AbortController()
  job.abortController = abortController
  job.status = 'running'
  job.error = null
  job.message = 'Loading file…'
  job.progress = 0
  notify()

  try {
    const resolved = await resolveTuneFileBlob(job.meta, job.tuneId, {
      token: options.token,
      accessToken: options.accessToken || options.token,
      driveApi: options.driveApi,
    })
    if (job.status === 'cancelled' || abortController.signal.aborted) {
      job.status = 'cancelled'
      job.message = 'Cancelled'
      return
    }
    const blob = resolved && resolved.blob
    if (!blob) throw new Error('Could not load file for OCR')
    const file = new File(
      [blob],
      (job.meta && job.meta.name) || 'file.png',
      { type: (job.meta && job.meta.type) || blob.type || 'image/png' }
    )
    const accessToken = options.accessToken
      || (options.token && options.token.access_token)
      || options.token
      || ''
    const titleHint = options.tune && options.tune.name ? String(options.tune.name).trim() : ''
    const body = await transcribeSheetImageFile({
      file: file,
      accessToken: accessToken,
      signal: abortController.signal,
      titleHints: titleHint ? [titleHint] : [],
      onProgress: function(progressState) {
        if (!jobsById[jobId] || jobsById[jobId].status !== 'running') return
        job.message = (progressState && progressState.message) || job.message
        job.progress = progressState && progressState.progress
          ? Math.round(Number(progressState.progress) * 100)
          : job.progress
        notify()
      },
    })
    if (job.status === 'cancelled' || abortController.signal.aborted) {
      job.status = 'cancelled'
      job.message = 'Cancelled'
      return
    }
    const patches = proposedPatchesFromTranscription(body, options.tune)
    job.result = {
      transcription: body,
      patches: patches,
    }
    job.progress = 100
    job.status = patches.length > 0 ? 'ready' : 'failed'
    if (patches.length === 0) {
      job.error = 'OCR found no editable fields'
      job.message = job.error
    } else {
      job.message = 'Ready for review'
    }
  } catch (err) {
    if (job.status === 'cancelled'
      || abortController.signal.aborted
      || (err && (err.name === 'AbortError' || /abort/i.test(String(err.message || ''))))) {
      job.status = 'cancelled'
      job.message = 'Cancelled'
      job.error = null
    } else {
      job.status = 'failed'
      job.error = err && err.message ? err.message : String(err)
      job.message = job.error
    }
  } finally {
    delete job.abortController
    notify()
  }
}

export function enqueueFileOcrJob(options) {
  const opts = options || {}
  const tune = opts.tune
  const meta = opts.meta
  if (!tune || !tune.id || !meta || !meta.id) {
    throw new Error('Missing tune or file for OCR')
  }
  const existing = findFileOcrJobForFile(tune.id, meta.id)
  if (existing && (existing.status === 'pending' || existing.status === 'running')) {
    return existing
  }

  const jobId = utils.generateObjectId()
  const job = {
    id: jobId,
    tuneId: tune.id,
    tuneName: tune.name || '',
    fileId: meta.id,
    fileName: meta.name || 'File',
    meta: meta,
    status: 'pending',
    createdAt: Date.now(),
    error: null,
    result: null,
    message: 'Queued',
    progress: 0,
  }
  jobsById[jobId] = job
  notify()

  Promise.resolve().then(function() {
    return runFileOcrJob(jobId, opts)
  })

  return job
}

export function dismissFileOcrJob(jobId) {
  if (!jobId || !jobsById[jobId]) return
  jobsById[jobId].status = 'dismissed'
  notify()
}

export function cancelFileOcrJob(jobId) {
  const job = jobId ? jobsById[jobId] : null
  if (!job || !isActiveFileOcrStatus(job.status)) return
  if (job.abortController) {
    try { job.abortController.abort() } catch (e) { /* ignore */ }
  }
  job.status = 'cancelled'
  job.message = 'Cancelled'
  job.error = null
  delete job.abortController
  notify()
}

export function cancelAllActiveFileOcrJobs() {
  getFileOcrJobs().forEach(function(job) {
    if (job && isActiveFileOcrStatus(job.status)) cancelFileOcrJob(job.id)
  })
}

export function clearInactiveFileOcrJobs() {
  Object.keys(jobsById).forEach(function(id) {
    const job = jobsById[id]
    if (!job || isActiveFileOcrStatus(job.status)) return
    delete jobsById[id]
  })
  notify()
}

export function applyFileOcrPatch(tune, patch) {
  if (!tune || !patch) return tune
  const next = Object.assign({}, tune)
  if (patch.field === 'words') {
    next.words = String(patch.newValue || '').split(/\r?\n/)
  } else if (patch.field === 'name') {
    next.name = patch.newValue
  } else if (patch.field === 'composer') {
    next.composer = patch.newValue
  } else if (patch.field === 'notes') {
    // Store suggested ABC in backgroundInfo note for user confirmation path;
    // primary apply path uses ImportReview-style field merge when available.
    if (!next.voices) next.voices = { '1': { meta: '', notes: [] } }
    const key = Object.keys(next.voices)[0] || '1'
    if (!next.voices[key]) next.voices[key] = { meta: '', notes: [] }
    next.voices[key] = Object.assign({}, next.voices[key], {
      notes: String(patch.newValue || '').split(/\r?\n/),
    })
  }
  return next
}

export function __resetFileOcrJobsForTests() {
  Object.keys(jobsById).forEach(function(id) {
    delete jobsById[id]
  })
  notify()
}
