import localforage from 'localforage'
import { researchTuneBackground } from './tuneBackgroundResearchClient'
import { applyGeneratedBackgroundInfo } from './viewModeUtils'
import { isAbortError } from './abortUtils'

const STORAGE_KEY = 'queue-state'
const store = localforage.createInstance({ name: 'bulkbackgroundqueue' })

let jobCounter = 0
let running = false
let paused = false
let jobs = []
let currentJobId = null
let persistTimer = null
let restored = false

let queueContext = {
  getTune: null,
  saveBackgroundInfo: null,
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
  return 'bg-research-job-' + jobCounter
}

function hasExistingBackgroundInfo(tune) {
  return tune
    && typeof tune.backgroundInfo === 'string'
    && tune.backgroundInfo.trim().length > 0
}

function findDuplicateJob(tuneId) {
  return jobs.find(function(job) {
    return job.tuneId === tuneId
      && (job.status === 'pending' || job.status === 'running')
  })
}

function publicJob(job) {
  return {
    id: job.id,
    tuneId: job.tuneId,
    tuneName: job.tuneName,
    title: job.title,
    artist: job.artist,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    skipReason: job.skipReason,
    resultText: job.resultText || null,
    resultMeta: job.resultMeta || null,
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

export function isBulkBackgroundResearchQueueActive() {
  return running && !paused
}

export function setBulkBackgroundResearchQueueContext(context) {
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
          lyrics: job.lyrics,
          backgroundInfo: job.backgroundInfo || '',
          status: job.status === 'running' ? 'pending' : job.status,
          progress: job.progress,
          message: job.message,
          error: job.error,
          skipReason: job.skipReason,
          accessToken: job.accessToken,
          cancelled: job.cancelled,
        }
      }),
    })
  } catch (e) {
    console.log(e)
  }
}

export async function flushPersistForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  await persistState()
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
        lyrics: item.lyrics || '',
        backgroundInfo: item.backgroundInfo || '',
        status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
        progress: typeof item.progress === 'number' ? item.progress : 0,
        message: item.message || '',
        error: item.error || null,
        skipReason: item.skipReason || null,
        accessToken: item.accessToken || null,
        cancelled: !!item.cancelled,
      }
    })

    const wasRunning = !!saved.running
    notify()

    if (wasRunning && !paused && jobs.some(function(job) { return job.status === 'pending' })) {
      start()
    }
  } catch (e) {
    console.log(e)
  } finally {
    restored = true
  }
}

export function previewEnqueueTunes(tunes) {
  let willResearch = 0
  let willSkip = 0
  const reasons = { 'has-background': 0, 'no-title': 0 }

  if (!Array.isArray(tunes)) {
    return { willResearch: 0, willSkip: 0, reasons: reasons, total: 0 }
  }

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    if (!tune.name || !String(tune.name).trim()) {
      willSkip += 1
      reasons['no-title'] += 1
      return
    }
    if (hasExistingBackgroundInfo(tune)) {
      willSkip += 1
      reasons['has-background'] += 1
      return
    }
    willResearch += 1
  })

  return {
    willResearch: willResearch,
    willSkip: willSkip,
    reasons: reasons,
    total: tunes.length,
  }
}

export function enqueueTunes(tunes, options) {
  const accessToken = options && options.accessToken ? options.accessToken : null
  const force = !!(options && options.force)
  const lyricsForTune = options && typeof options.lyricsForTune === 'function'
    ? options.lyricsForTune
    : function() { return '' }

  const ids = []
  if (!Array.isArray(tunes)) return ids

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return

    const title = tune.name ? String(tune.name).trim() : ''
    if (!title) {
      jobs.push({
        id: makeJobId(),
        tuneId: tune.id,
        tuneName: tune.name || '',
        title: '',
        artist: tune.composer || '',
        lyrics: '',
        backgroundInfo: typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : '',
        status: 'skipped',
        progress: 0,
        message: '',
        error: null,
        skipReason: 'no-title',
        accessToken: accessToken,
        cancelled: false,
      })
      return
    }

    if (!force && hasExistingBackgroundInfo(tune)) {
      jobs.push({
        id: makeJobId(),
        tuneId: tune.id,
        tuneName: tune.name || '',
        title: title,
        artist: tune.composer || '',
        lyrics: lyricsForTune(tune),
        backgroundInfo: typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : '',
        status: 'skipped',
        progress: 0,
        message: '',
        error: null,
        skipReason: 'has-background',
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
      title: title,
      artist: tune.composer || '',
      lyrics: lyricsForTune(tune),
      backgroundInfo: typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : '',
      status: 'pending',
      progress: 0,
      message: '',
      error: null,
      skipReason: null,
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

export function cancelJob(id) {
  const job = jobs.find(function(item) { return item.id === id })
  if (!job) return false
  if (job.status === 'done' || job.status === 'cancelled' || job.status === 'skipped') return false
  abortRunningJob(job)
  if (job.status === 'pending') {
    job.status = 'cancelled'
  }
  notify()
  schedulePersist()
  return true
}

export function cancelAllJobs() {
  let changed = false
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running') return
    abortRunningJob(job)
    if (job.status === 'pending') {
      job.status = 'cancelled'
    }
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

let processQueueRunning = false

function resetOrphanedRunningJobs() {
  let changed = false
  jobs.forEach(function(job) {
    if (job.status !== 'running') return
    if (processQueueRunning && job.id === currentJobId) return
    if (job.abortController) {
      job.abortController.abort()
      job.abortController = null
    }
    job.status = 'pending'
    job.progress = 0
    changed = true
  })
  if (currentJobId && !processQueueRunning) {
    currentJobId = null
    changed = true
  }
  if (changed) notify()
}

function abortRunningJob(job) {
  if (!job) return
  job.cancelled = true
  if (job.abortController) {
    job.abortController.abort()
  }
}

export function start() {
  paused = false
  if (!processQueueRunning) {
    resetOrphanedRunningJobs()
  }
  if (!running) {
    running = true
  }
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

function saveBackgroundForJob(job, text) {
  const getTune = queueContext.getTune
  const saveTune = queueContext.saveTune
  if (typeof getTune === 'function' && typeof saveTune === 'function') {
    const tune = getTune(job.tuneId)
    if (!tune) {
      throw new Error('Tune not found: ' + job.tuneId)
    }

    applyGeneratedBackgroundInfo(tune, text)
    saveTune(tune, false, { historyLabel: 'Bulk background research' })
    if (typeof queueContext.forceRefresh === 'function') {
      queueContext.forceRefresh()
    }
    return
  }

  if (typeof queueContext.saveBackgroundInfo === 'function') {
    queueContext.saveBackgroundInfo(job.tuneId, text)
    return
  }

  throw new Error('Tunebook context not registered for bulk background research')
}

async function runJob(job) {
  if (job.cancelled) {
    job.status = 'cancelled'
    return
  }

  if (job.status === 'skipped') {
    return
  }

  job.status = 'running'
  job.progress = 0
  job.message = 'Starting research...'
  currentJobId = job.id
  notify()
  schedulePersist()

  const controller = new AbortController()
  job.abortController = controller

  try {
    const result = await researchTuneBackground({
      title: job.title,
      artist: job.artist || '',
      lyrics: job.lyrics || '',
      backgroundInfo: job.backgroundInfo || '',
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

    if (!result || typeof result.text !== 'string' || !result.text.trim()) {
      throw new Error('Tune background research returned no text')
    }

    saveBackgroundForJob(job, result.text)
    job.resultText = result.text
    const timing = result.timing || {}
    job.resultMeta = {
      searchBackend: result.searchBackend || '',
      model: result.model || '',
      sourceCount: result.sources && result.sources.length ? result.sources.length : 0,
      wordCount: timing.wordCount || 0,
      totalMs: timing.totalMs || 0,
    }
    job.status = 'done'
    job.progress = 100
    job.message = ''
    job.error = null
  } catch (e) {
    if (job.cancelled || isAbortError(e)) {
      job.status = 'cancelled'
      job.error = null
    } else {
      job.status = 'error'
      job.error = e && e.message ? e.message : 'Background research failed'
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

export function __loadSavedStateForTests(saved) {
  if (!saved || !Array.isArray(saved.jobs)) return
  jobCounter = typeof saved.jobCounter === 'number' ? saved.jobCounter : jobCounter
  paused = !!saved.paused
  running = !!saved.running
  jobs = saved.jobs.map(function(item) {
    return {
      id: item.id,
      tuneId: item.tuneId,
      tuneName: item.tuneName || '',
      title: item.title || '',
      artist: item.artist || '',
      lyrics: item.lyrics || '',
      backgroundInfo: item.backgroundInfo || '',
      status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
      progress: typeof item.progress === 'number' ? item.progress : 0,
      message: item.message || '',
      error: item.error || null,
      skipReason: item.skipReason || null,
      accessToken: item.accessToken || null,
      cancelled: !!item.cancelled,
    }
  })
  notify()
}

export function __setJobStatusForTests(index, status) {
  if (jobs[index]) {
    jobs[index].status = status
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
    saveBackgroundInfo: null,
    forceRefresh: null,
  }
  listeners.clear()
}
