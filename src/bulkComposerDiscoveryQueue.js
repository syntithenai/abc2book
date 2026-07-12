import localforage from 'localforage'
import { toast } from 'react-toastify'
import { discoverComposers } from './composerSearchClient'
import { isAbortError } from './abortUtils'
import { needsComposerDiscovery, parseTitleComposerHints, buildComposerPickerCandidates } from './composerDiscoveryUtils'

const STORAGE_KEY = 'queue-state'
const store = localforage.createInstance({ name: 'bulkcomposerdiscoveryqueue' })

let jobCounter = 0
let running = false
let paused = false
let jobs = []
let currentJobId = null
let persistTimer = null
let restored = false

let queueContext = {
  getTune: null,
  saveTune: null,
  forceRefresh: null,
}

const listeners = new Set()

function notify() {
  const snapshot = getState()
  listeners.forEach(function(listener) {
    try {
      listener(snapshot)
    } catch (e) {
      console.log(e)
    }
  })
}

function makeJobId() {
  jobCounter += 1
  return 'composer-discovery-job-' + jobCounter
}

function findDuplicateJob(tuneId) {
  return jobs.find(function(job) {
    return job.tuneId === tuneId
      && (job.status === 'pending' || job.status === 'running' || job.status === 'awaiting')
  })
}

function publicJob(job) {
  return {
    id: job.id,
    tuneId: job.tuneId,
    tuneName: job.tuneName,
    title: job.title,
    artist: job.artist,
    titleHint: job.titleHint,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    skipReason: job.skipReason,
    discoveredComposer: job.discoveredComposer || '',
    composerCandidates: Array.isArray(job.composerCandidates)
      ? job.composerCandidates.map(function(candidate) {
        return {
          artist: candidate.artist,
          role: candidate.role || '',
          source: candidate.source || '',
          preview: candidate.preview || candidate.artist,
        }
      })
      : [],
  }
}

export function getState() {
  const finished = jobs.filter(function(job) {
    return job.status === 'done' || job.status === 'skipped' || job.status === 'error' || job.status === 'cancelled'
  }).length
  const total = jobs.length
  const overallProgress = total > 0 ? Math.round((finished / total) * 100) : 0
  return {
    running: running,
    paused: paused,
    jobs: jobs.map(publicJob),
    currentJobId: currentJobId,
    overallProgress: overallProgress,
    finishedCount: finished,
    totalCount: total,
  }
}

export function subscribe(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function isBulkComposerDiscoveryQueueActive() {
  return running && !paused
}

export function setBulkComposerDiscoveryQueueContext(context) {
  queueContext = Object.assign({}, queueContext, context || {})
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(function() {
    persistTimer = null
    persistState()
  }, 200)
}

async function persistState() {
  try {
    await store.setItem(STORAGE_KEY, {
      jobCounter: jobCounter,
      running: running,
      paused: paused,
      jobs: jobs.map(function(job) {
        return {
          id: job.id,
          tuneId: job.tuneId,
          tuneName: job.tuneName,
          title: job.title,
          artist: job.artist,
          titleHint: job.titleHint,
          status: job.status,
          progress: job.progress,
          message: job.message,
          error: job.error,
          skipReason: job.skipReason,
          discoveredComposer: job.discoveredComposer || '',
          composerCandidates: job.composerCandidates || [],
          accessToken: job.accessToken,
          cancelled: !!job.cancelled,
        }
      }),
    })
  } catch (e) {
    console.log(e)
  }
}

export async function restoreAndResume() {
  if (restored) return
  try {
    const saved = await store.getItem(STORAGE_KEY)
    if (!saved || !Array.isArray(saved.jobs)) {
      restored = true
      return
    }
    jobCounter = typeof saved.jobCounter === 'number' ? saved.jobCounter : 0
    paused = !!saved.paused
    jobs = saved.jobs.map(function(item) {
      return {
        id: item.id,
        tuneId: item.tuneId,
        tuneName: item.tuneName || '',
        title: item.title || '',
        artist: item.artist || '',
        titleHint: item.titleHint || '',
        status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
        progress: typeof item.progress === 'number' ? item.progress : 0,
        message: item.message || '',
        error: item.error || null,
        skipReason: item.skipReason || null,
        discoveredComposer: item.discoveredComposer || '',
        composerCandidates: Array.isArray(item.composerCandidates) ? item.composerCandidates : [],
        accessToken: item.accessToken || null,
        cancelled: !!item.cancelled,
      }
    })
    notify()
    if (saved.running && !paused && jobs.some(function(job) { return job.status === 'pending' })) {
      start()
    }
  } catch (e) {
    console.log(e)
  } finally {
    restored = true
  }
}

export function previewEnqueueTunes(tunes) {
  let willDiscover = 0
  let willSkip = 0
  const reasons = { 'has-composer': 0, 'no-title': 0 }

  if (!Array.isArray(tunes)) {
    return { willDiscover: 0, willSkip: 0, reasons: reasons, total: 0 }
  }

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    if (!tune.name || !String(tune.name).trim()) {
      willSkip += 1
      reasons['no-title'] += 1
      return
    }
    if (!needsComposerDiscovery(tune.composer)) {
      willSkip += 1
      reasons['has-composer'] += 1
      return
    }
    willDiscover += 1
  })

  return {
    willDiscover: willDiscover,
    willSkip: willSkip,
    reasons: reasons,
    total: tunes.length,
  }
}

export function enqueueTunes(tunes, options) {
  const accessToken = options && options.accessToken ? options.accessToken : null
  const ids = []
  if (!Array.isArray(tunes)) return ids

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    const title = tune.name ? String(tune.name).trim() : ''
    const hints = parseTitleComposerHints(title, tune.composer || '', title)

    if (!title) {
      jobs.push({
        id: makeJobId(),
        tuneId: tune.id,
        tuneName: tune.name || '',
        title: '',
        artist: tune.composer || '',
        titleHint: '',
        status: 'skipped',
        progress: 0,
        message: '',
        error: null,
        skipReason: 'no-title',
        discoveredComposer: '',
        accessToken: accessToken,
        cancelled: false,
      })
      return
    }

    if (!needsComposerDiscovery(tune.composer)) {
      jobs.push({
        id: makeJobId(),
        tuneId: tune.id,
        tuneName: tune.name || '',
        title: hints.title,
        artist: tune.composer || '',
        titleHint: hints.titleHint,
        status: 'skipped',
        progress: 0,
        message: '',
        error: null,
        skipReason: 'has-composer',
        discoveredComposer: '',
        accessToken: accessToken,
        cancelled: false,
      })
      return
    }

    const duplicate = findDuplicateJob(tune.id)
    if (duplicate) {
      ids.push(duplicate.id)
      return
    }

    const job = {
      id: makeJobId(),
      tuneId: tune.id,
      tuneName: tune.name || '',
      title: hints.title,
      artist: tune.composer || '',
      titleHint: hints.titleHint,
      status: 'pending',
      progress: 0,
      message: '',
      error: null,
        skipReason: null,
        discoveredComposer: '',
        composerCandidates: [],
        accessToken: accessToken,
      cancelled: false,
    }
    jobs.push(job)
    ids.push(job.id)
  })

  notify()
  schedulePersist()
  return ids
}

function abortRunningJob(job) {
  if (!job) return
  job.cancelled = true
  if (job.abortController) {
    job.abortController.abort()
  }
}

export function cancelJob(id) {
  const job = jobs.find(function(item) { return item.id === id })
  if (!job) return false
  if (job.status === 'done' || job.status === 'cancelled' || job.status === 'skipped') return false
  abortRunningJob(job)
  if (job.status === 'pending') job.status = 'cancelled'
  notify()
  schedulePersist()
  return true
}

export function cancelAllJobs() {
  let changed = false
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running') return
    abortRunningJob(job)
    if (job.status === 'pending') job.status = 'cancelled'
    changed = true
  })
  if (changed) {
    notify()
    schedulePersist()
  }
}

export function clearFinishedJobs() {
  jobs = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  })
  notify()
  schedulePersist()
}

export function start() {
  paused = false
  if (!running) running = true
  processQueue()
  notify()
  schedulePersist()
}

export function stop() {
  paused = true
  if (currentJobId) {
    const job = jobs.find(function(item) { return item.id === currentJobId })
    abortRunningJob(job)
  }
  notify()
  schedulePersist()
}

function saveComposerForJob(job, composer) {
  const getTune = queueContext.getTune
  const saveTune = queueContext.saveTune
  if (typeof getTune !== 'function' || typeof saveTune !== 'function') {
    throw new Error('Tunebook context not registered for artist discovery queue')
  }
  const tune = getTune(job.tuneId)
  if (!tune) {
    throw new Error('Tune not found: ' + job.tuneId)
  }
  tune.composer = composer
  saveTune(tune, false, { historyLabel: 'Artist discovery' })
  if (typeof queueContext.forceRefresh === 'function') {
    queueContext.forceRefresh()
  }
  toast.info('Updated artist: ' + (tune.name || job.title), {
    hideProgressBar: true,
    autoClose: 1000,
  })
}

export function applyComposerDiscoveryChoice(jobId, composer) {
  const job = jobs.find(function(item) { return item.id === jobId })
  if (!job || job.status !== 'awaiting') return false
  const chosen = String(composer || '').trim()
  if (!chosen) return false
  try {
    saveComposerForJob(job, chosen)
    job.discoveredComposer = chosen
    job.status = 'done'
    job.progress = 100
    job.message = ''
    job.error = null
    job.composerCandidates = []
    notify()
    schedulePersist()
    return true
  } catch (e) {
    job.status = 'error'
    job.error = e && e.message ? e.message : 'Could not save artist'
    notify()
    schedulePersist()
    return false
  }
}

let processQueueRunning = false

async function runJob(job) {
  if (job.cancelled || job.status === 'skipped') return

  job.status = 'running'
  job.progress = 0
  job.message = 'Discovering artist...'
  currentJobId = job.id
  notify()
  schedulePersist()

  const controller = new AbortController()
  job.abortController = controller

  try {
    const result = await discoverComposers({
      title: job.title,
      artist: job.artist || '',
      titleHint: job.titleHint || '',
      accessToken: job.accessToken,
      signal: controller.signal,
      onProgress: function(message, progress) {
        if (job.cancelled) return
        job.message = message || ''
        if (typeof progress === 'number' && Number.isFinite(progress)) {
          job.progress = Math.max(0, Math.min(100, Math.round(progress * 100)))
        }
        notify()
      },
    })

    if (job.cancelled) {
      job.status = 'cancelled'
      return
    }

    const candidates = buildComposerPickerCandidates(result, job.artist || '')
    if (!candidates.length) {
      throw new Error('Artist discovery returned no artist')
    }

    job.composerCandidates = candidates
    job.status = 'awaiting'
    job.progress = 100
    job.message = 'Choose an artist to save'
    job.error = null
  } catch (e) {
    if (job.cancelled || isAbortError(e)) {
      job.status = 'cancelled'
      job.error = null
    } else {
      job.status = 'error'
      job.error = e && e.message ? e.message : 'Artist discovery failed'
    }
  } finally {
    if (job.abortController === controller) {
      job.abortController = null
    }
    if (currentJobId === job.id) {
      currentJobId = null
    }
  }
}

async function processQueue() {
  if (processQueueRunning) return
  processQueueRunning = true
  try {
    while (running && !paused) {
      const next = jobs.find(function(job) { return job.status === 'pending' })
      if (!next) {
        running = false
        notify()
        schedulePersist()
        return
      }
      await runJob(next)
      notify()
      schedulePersist()
    }
  } finally {
    processQueueRunning = false
  }
}

export function __resetForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  jobCounter = 0
  running = false
  paused = false
  processQueueRunning = false
  jobs = []
  currentJobId = null
  restored = false
  queueContext = {
    getTune: null,
    saveTune: null,
    forceRefresh: null,
  }
  listeners.clear()
}
