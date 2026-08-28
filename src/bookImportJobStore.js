/**
 * Background jobs for Import scans or PDF (book import review sets).
 *
 * Soft navigation: jobs stay in memory and continue; open the review set from the toast.
 * Hard reload: File/Blob inputs and in-flight job status cannot survive. Review *sets*,
 * page/crop blobs, and source PDF blobs persist in IndexedDB via bookImportReviewStore —
 * reopen Import → Review to continue editing; crops missing after eviction rehydrate from
 * sourcePdfBlobKey + bbox when present.
 */
import { processFilesIntoReviewSet } from './bookImportPipeline'
import { getReviewSet, listReviewSets } from './bookImportReviewStore'
import {
  showBookImportJobStartedToast,
  showBookImportJobCompleteToast,
  showBookImportJobErrorToast,
  showBookImportJobContinuingToast,
} from './bookImportJobToast'

export { requestOpenBookImportReview } from './bookImportJobToast'

/**
 * After a hard reload, in-flight jobs are gone but review sets/blobs remain in IndexedDB.
 * UI can call this to offer "Resume review" for sets still in review/processing status.
 */
export async function listRecoverableBookImportReviewSets() {
  const sets = await listReviewSets()
  return (Array.isArray(sets) ? sets : []).filter(function(set) {
    const status = String((set && set.status) || '')
    return status === 'review' || status === 'processing'
  })
}

const listeners = new Set()
const jobsById = {}

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

function freshId() {
  return 'book-import-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

export function subscribeBookImportJobs(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}

export function getBookImportJobs() {
  return Object.keys(jobsById).map(function(id) {
    return jobsById[id]
  }).sort(function(a, b) {
    return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
  })
}

export function getBookImportJob(jobId) {
  return jobId ? jobsById[jobId] || null : null
}

export function findActiveBookImportJobForSet(setId) {
  const list = getBookImportJobs()
  for (let i = 0; i < list.length; i += 1) {
    const job = list[i]
    if (job && String(job.setId) === String(setId)
      && (job.status === 'pending' || job.status === 'running')) {
      return job
    }
  }
  return null
}

export function countBookImportJobsIncomplete() {
  return getBookImportJobs().filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length
}

function patchJob(jobId, patch) {
  const job = jobsById[jobId]
  if (!job) return null
  Object.assign(job, patch || {}, { updatedAt: Date.now() })
  notify()
  return job
}

async function runBookImportJob(jobId) {
  const job = jobsById[jobId]
  if (!job || job.status === 'cancelled') return
  const abortController = new AbortController()
  job.abortController = abortController
  patchJob(jobId, {
    status: 'running',
    message: 'Starting…',
    phase: 'start',
    current: 0,
    total: Math.max(1, (job.files && job.files.length) || 1),
    error: '',
  })

  try {
    await processFilesIntoReviewSet({
      setId: job.setId,
      files: job.files,
      accessToken: job.accessToken,
      resolverAvailable: job.resolverAvailable,
      abcTools: job.abcTools,
      signal: abortController.signal,
      onProgress: function(payload) {
        const p = payload || {}
        patchJob(jobId, {
          phase: p.phase || job.phase,
          message: p.message || job.message,
          current: p.current != null ? p.current : job.current,
          total: p.total != null ? p.total : job.total,
        })
      },
    })
    if (jobsById[jobId] && jobsById[jobId].status === 'cancelled') return
    patchJob(jobId, {
      status: 'ready',
      phase: 'done',
      message: 'Ready for review',
      current: job.total,
      files: null,
    })
    showBookImportJobCompleteToast({
      setId: job.setId,
      setName: job.setName,
      book: job.book,
    })
  } catch (e) {
    if (e && e.name === 'AbortError') {
      patchJob(jobId, {
        status: 'cancelled',
        message: 'Cancelled',
        files: null,
      })
      return
    }
    const message = e && e.message ? e.message : String(e)
    patchJob(jobId, {
      status: 'failed',
      message: message,
      error: message,
      files: null,
    })
    showBookImportJobErrorToast({
      setName: job.setName,
      message: message,
    })
  } finally {
    if (jobsById[jobId]) {
      jobsById[jobId].abortController = null
      // Drop file handles after run so memory can be reclaimed
      if (jobsById[jobId].status !== 'pending' && jobsById[jobId].status !== 'running') {
        jobsById[jobId].files = null
        jobsById[jobId].abcTools = null
      }
      notify()
    }
  }
}

/**
 * Start processing files into a review set in the background.
 * @returns {string} job id
 */
export function enqueueBookImportJob(options) {
  const opts = options || {}
  const setId = opts.setId
  if (!setId) throw new Error('Review set id is required')
  const files = Array.isArray(opts.files) ? opts.files.slice() : []
  if (!files.length) throw new Error('Select at least one image or PDF')

  const existing = findActiveBookImportJobForSet(setId)
  if (existing) {
    throw new Error('This review set is already being processed')
  }

  const jobId = freshId()
  const now = Date.now()
  jobsById[jobId] = {
    id: jobId,
    setId: setId,
    setName: opts.setName || 'Review set',
    book: opts.book || '',
    files: files,
    fileCount: files.length,
    accessToken: opts.accessToken || null,
    resolverAvailable: opts.resolverAvailable !== false,
    abcTools: opts.abcTools || null,
    status: 'pending',
    phase: 'start',
    message: 'Queued…',
    current: 0,
    total: files.length,
    error: '',
    createdAt: now,
    updatedAt: now,
    abortController: null,
  }
  notify()

  if (opts.showStartedToast !== false) {
    showBookImportJobStartedToast({
      setName: jobsById[jobId].setName,
      fileCount: files.length,
    })
  }

  Promise.resolve().then(function() {
    return runBookImportJob(jobId)
  })

  return jobId
}

export async function enqueueBookImportJobForSet(setId, files, options) {
  const opts = options || {}
  const set = await getReviewSet(setId)
  if (!set) throw new Error('Review set not found')
  return enqueueBookImportJob({
    setId: setId,
    setName: set.name || 'Review set',
    book: set.book || '',
    files: files,
    accessToken: opts.accessToken,
    resolverAvailable: opts.resolverAvailable,
    abcTools: opts.abcTools,
    showStartedToast: opts.showStartedToast,
  })
}

export function cancelBookImportJob(jobId) {
  const job = jobsById[jobId]
  if (!job) return false
  if (job.status !== 'pending' && job.status !== 'running') return false
  job.status = 'cancelled'
  job.message = 'Cancelled'
  job.updatedAt = Date.now()
  if (job.abortController) {
    try { job.abortController.abort() } catch (e) { /* ignore */ }
  }
  job.files = null
  job.abcTools = null
  notify()
  return true
}

export function cancelAllActiveBookImportJobs() {
  getBookImportJobs().forEach(function(job) {
    if (job.status === 'pending' || job.status === 'running') {
      cancelBookImportJob(job.id)
    }
  })
}

export function clearInactiveBookImportJobs() {
  Object.keys(jobsById).forEach(function(id) {
    const job = jobsById[id]
    if (!job) return
    if (job.status === 'pending' || job.status === 'running') return
    delete jobsById[id]
  })
  notify()
}

export function noticeBookImportJobContinuing(jobId) {
  const job = getBookImportJob(jobId)
  if (!job) return
  showBookImportJobContinuingToast({
    setName: job.setName,
  })
}

export function __resetBookImportJobStoreForTests() {
  Object.keys(jobsById).forEach(function(id) {
    delete jobsById[id]
  })
  notify()
}
