import utilsFunctions from './utilsFunctions'
import { getScratchpadItem } from './scratchpadStore'
import { runScratchpadAudioTranscribe } from './scratchpadAnalyse'
import { toast } from 'react-toastify'

const utils = utilsFunctions()
const listeners = new Set()
const jobsById = {}

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

function isActiveStatus(status) {
  return status === 'pending' || status === 'running'
}

export function subscribeScratchpadBackgroundJobs(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}

export function getScratchpadBackgroundJobs() {
  return Object.keys(jobsById).map(function(id) {
    return jobsById[id]
  })
}

export function getScratchpadBackgroundJob(jobId) {
  return jobId ? jobsById[jobId] || null : null
}

export function countScratchpadBackgroundIncomplete() {
  return getScratchpadBackgroundJobs().filter(function(job) {
    return isActiveStatus(job.status)
  }).length
}

async function runTranscribeJob(jobId, options) {
  const job = jobsById[jobId]
  if (!job || job.status === 'cancelled') return

  const opts = options || {}
  const abortController = new AbortController()
  job.abortController = abortController
  job.status = 'running'
  job.message = 'Transcribing audio…'
  job.progress = 0
  job.error = null
  notify()

  try {
    const item = getScratchpadItem(job.sourceItemId)
    if (!item) throw new Error('Scratchpad item is no longer available')
    if (item.type !== 'audio') throw new Error('Only audio items can be transcribed')

    const created = await runScratchpadAudioTranscribe(item, {
      workspaceId: job.workspaceId,
      token: opts.token,
      signal: abortController.signal,
      onProgress: function(message) {
        if (!jobsById[jobId] || jobsById[jobId].status !== 'running') return
        job.message = message || job.message
        notify()
      },
      onOpenItem: opts.onOpenItem,
    })

    if (job.status === 'cancelled' || abortController.signal.aborted) {
      job.status = 'cancelled'
      job.message = 'Cancelled'
      return
    }

    if (!created) {
      job.status = 'cancelled'
      job.message = 'Cancelled'
      return
    }

    job.createdItemId = created.id
    job.status = 'done'
    job.progress = 100
    job.message = 'Transcription saved to scratchpad'
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
      if (!job.error || job.error.indexOf('Could not save analysis') === -1) {
        toast.error(job.error || 'Transcription failed')
      }
    }
  } finally {
    delete job.abortController
    notify()
  }
}

export function enqueueScratchpadTranscribeJob(options) {
  const opts = options || {}
  const item = opts.item
  if (!item || !item.id) throw new Error('Missing scratchpad item')
  if (!opts.workspaceId) throw new Error('Choose a scratchpad workspace')

  const existing = getScratchpadBackgroundJobs().find(function(job) {
    return job.type === 'transcribe'
      && job.sourceItemId === item.id
      && isActiveStatus(job.status)
  })
  if (existing) return existing

  const jobId = utils.generateObjectId()
  const job = {
    id: jobId,
    type: 'transcribe',
    sourceItemId: item.id,
    sourceTitle: String(item.title || 'Untitled').trim() || 'Untitled',
    workspaceId: opts.workspaceId,
    status: 'pending',
    createdAt: Date.now(),
    createdItemId: null,
    error: null,
    message: 'Queued',
    progress: 0,
  }
  jobsById[jobId] = job
  notify()

  Promise.resolve().then(function() {
    return runTranscribeJob(jobId, opts)
  })

  return job
}

export function cancelScratchpadBackgroundJob(jobId) {
  const job = jobId ? jobsById[jobId] : null
  if (!job || !isActiveStatus(job.status)) return
  if (job.abortController) {
    try { job.abortController.abort() } catch (e) { /* ignore */ }
  }
  job.status = 'cancelled'
  job.message = 'Cancelled'
  job.error = null
  delete job.abortController
  notify()
}

export function cancelAllActiveScratchpadBackgroundJobs() {
  getScratchpadBackgroundJobs().forEach(function(job) {
    if (job && isActiveStatus(job.status)) cancelScratchpadBackgroundJob(job.id)
  })
}

export function clearInactiveScratchpadBackgroundJobs() {
  Object.keys(jobsById).forEach(function(id) {
    const job = jobsById[id]
    if (!job || isActiveStatus(job.status)) return
    delete jobsById[id]
  })
  notify()
}

export function __resetScratchpadBackgroundJobsForTests() {
  Object.keys(jobsById).forEach(function(id) {
    delete jobsById[id]
  })
  notify()
}
