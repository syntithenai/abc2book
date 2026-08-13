import localforage from 'localforage'
import { createChordMigrationConsole } from './chordMigrationConsole'
import { yieldToMain } from './tuneListFilter'
import {
  loadWorkSession,
  exportWorkSession,
  clearWorkSession,
} from './chordReadinessWorkSession'

const STORAGE_KEY = 'queue-state'
const store = localforage.createInstance({ name: 'chordreadinesscleanupqueue' })

let jobCounter = 0
let running = false
let jobs = []
let currentJobId = null
let persistTimer = null
let restored = false
let processQueueRunning = false

let queueContext = {
  getTunebook: null,
  getTunes: null,
  getAbcjsParser: null,
  forceRefresh: null,
}

const listeners = new Set()
let cachedSnapshot = {
  running: false,
  jobs: [],
  currentJobId: null,
  overallProgress: 0,
  finishedCount: 0,
  totalCount: 0,
  lastAuditReport: null,
  lastBatchResult: null,
  workSession: { sessions: {} },
}

function makeJobId() {
  jobCounter += 1
  return 'chord-cleanup-' + jobCounter
}

function publicJob(job) {
  return {
    id: job.id,
    action: job.action,
    book: job.book,
    limit: job.limit,
    dryRun: job.dryRun,
    includeMelody: job.includeMelody,
    alwaysTag: job.alwaysTag,
    status: job.status,
    progress: job.progress,
    progressDone: job.progressDone,
    progressTotal: job.progressTotal,
    message: job.message,
    error: job.error,
    cancelled: job.cancelled,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    auditReport: job.auditReport || null,
    batchResult: job.batchResult || null,
  }
}

function findLastDoneJob(action) {
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]
    if (job.status === 'done' && (!action || job.action === action)) {
      return job
    }
  }
  return null
}

function findLatestDoneBatchJob() {
  let latest = null
  jobs.forEach(function(job) {
    if (job.status !== 'done') return
    if (job.action !== 'tagOnly' && job.action !== 'apply') return
    if (!latest || (job.completedAt || 0) > (latest.completedAt || 0)) {
      latest = job
    }
  })
  return latest
}

function rebuildSnapshot() {
  const finished = jobs.filter(function(job) {
    return job.status === 'done' || job.status === 'error' || job.status === 'cancelled'
  }).length
  const total = jobs.length
  const lastAuditJob = findLastDoneJob('audit')
  const lastBatchJob = findLatestDoneBatchJob()
  cachedSnapshot = {
    running: running,
    jobs: jobs.map(publicJob),
    currentJobId: currentJobId,
    overallProgress: total > 0 ? Math.round((finished / total) * 100) : 0,
    finishedCount: finished,
    totalCount: total,
    lastAuditReport: lastAuditJob && lastAuditJob.auditReport ? lastAuditJob.auditReport : null,
    lastBatchResult: lastBatchJob && lastBatchJob.batchResult
      ? { action: lastBatchJob.action, result: lastBatchJob.batchResult }
      : null,
    workSession: exportWorkSession(),
  }
}

function notify() {
  rebuildSnapshot()
  listeners.forEach(function(listener) {
    try {
      listener(cachedSnapshot)
    } catch (e) {
      console.log(e)
    }
  })
}

export function getState() {
  return cachedSnapshot
}

export function subscribe(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function setChordReadinessCleanupQueueContext(context) {
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
      jobs: jobs.map(function(job) {
        return {
          id: job.id,
          action: job.action,
          book: job.book,
          limit: job.limit,
          dryRun: job.dryRun,
          includeMelody: job.includeMelody,
          alwaysTag: job.alwaysTag,
          status: job.status === 'running' ? 'pending' : job.status,
          progress: job.progress,
          progressDone: job.progressDone,
          progressTotal: job.progressTotal,
          message: job.message,
          error: job.error,
          cancelled: job.cancelled,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          auditReport: job.auditReport || null,
          batchResult: job.batchResult || null,
        }
      }),
      workSession: exportWorkSession(),
    })
  } catch (e) {
    console.log(e)
  }
}

function mapSavedJob(item) {
  return {
    id: item.id,
    action: item.action || 'audit',
    book: item.book || null,
    limit: typeof item.limit === 'number' ? item.limit : 25,
    dryRun: item.dryRun !== false,
    includeMelody: !!item.includeMelody,
    alwaysTag: !!item.alwaysTag,
    status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
    progress: typeof item.progress === 'number' ? item.progress : 0,
    progressDone: typeof item.progressDone === 'number' ? item.progressDone : 0,
    progressTotal: typeof item.progressTotal === 'number' ? item.progressTotal : 0,
    message: item.message || '',
    error: item.error || null,
    cancelled: !!item.cancelled,
    startedAt: item.startedAt || null,
    completedAt: item.completedAt || null,
    auditReport: item.auditReport || null,
    batchResult: item.batchResult || null,
  }
}

function resolveQueueTunebook() {
  if (typeof queueContext.getTunebook === 'function') {
    return queueContext.getTunebook()
  }
  return null
}

function resolveQueueTunes() {
  if (typeof queueContext.getTunes === 'function') {
    const tunes = queueContext.getTunes()
    if (tunes && typeof tunes === 'object') return tunes
  }
  return {}
}

function buildMigrationApi() {
  return createChordMigrationConsole({
    getTunebook: resolveQueueTunebook,
    getTunes: resolveQueueTunes,
    getAbcjsParser: typeof queueContext.getAbcjsParser === 'function'
      ? queueContext.getAbcjsParser
      : null,
  })
}

function assertQueueContextReady(action) {
  const tunebook = resolveQueueTunebook()
  if (action === 'tagOnly' || action === 'apply') {
    if (!tunebook || typeof tunebook.saveTune !== 'function') {
      throw new Error(
        'tunebook.saveTune is not available. Open Settings → Cleanup again after the tunebook has loaded, then retry.'
      )
    }
  }
  if (typeof queueContext.getTunes !== 'function') {
    throw new Error(
      'Cleanup queue has no tune list. Open Settings → Cleanup after the tunebook has loaded, then retry.'
    )
  }
}

function buildJobOptions(job) {
  return {
    book: job.book || null,
    limit: job.limit,
    dryRun: job.dryRun,
    includeMelody: job.includeMelody,
    alwaysTag: job.alwaysTag,
    yieldMs: 0,
    isCancelled: function() { return !!job.cancelled },
    onProgress: function(payload) {
      if (job.cancelled) return
      job.progressDone = payload.done
      job.progressTotal = payload.total
      job.progress = payload.total > 0 ? Math.round((payload.done / payload.total) * 100) : 0
      if (payload.phase === 'scan') {
        job.message = payload.tuneName
          ? ('Scanning ' + payload.done + '/' + payload.total + ' — ' + payload.tuneName)
          : ('Scanning ' + payload.done + '/' + payload.total)
      } else {
        job.message = payload.tuneName
          ? ('Processing ' + payload.done + '/' + payload.total + ' — ' + payload.tuneName)
          : ('Processing ' + payload.done + '/' + payload.total)
      }
      notify()
      schedulePersist()
    },
  }
}

async function runJob(job) {
  assertQueueContextReady(job.action)
  const api = buildMigrationApi()
  const options = buildJobOptions(job)

  if (job.action === 'audit') {
    job.message = 'Starting audit…'
    notify()
    const report = await api.auditAsync(options)
    if (job.cancelled) return
    job.auditReport = report
    const auditSummary = report.summary || {}
    const displayReady = auditSummary.displayReadyCount != null ? auditSummary.displayReadyCount : 0
    job.message = 'Audit complete (' + (auditSummary.totalTunes != null ? auditSummary.totalTunes : 0)
      + ' songs, ' + displayReady + ' display ready)'
    return
  }

  if (job.action === 'tagOnly') {
    const result = await api.tagOnly(options)
    if (job.cancelled) return
    job.batchResult = result
    job.message = (job.dryRun ? 'Dry run: would tag ' : 'Tagged ') + result.tagged + ' tune(s)'
    if (!job.dryRun && typeof queueContext.forceRefresh === 'function') {
      queueContext.forceRefresh()
    }
    return
  }

  if (job.action === 'apply') {
    const result = await api.apply(options)
    if (job.cancelled) return
    job.batchResult = result
    job.message = (job.dryRun ? 'Dry run: would save ' : 'Saved ') + result.saved + ' tune(s)'
    if (!job.dryRun && typeof queueContext.forceRefresh === 'function') {
      queueContext.forceRefresh()
    }
  }
}

async function processQueue() {
  if (processQueueRunning) return
  processQueueRunning = true
  running = true
  notify()

  try {
    while (true) {
      const next = jobs.find(function(job) {
        return job.status === 'pending' && !job.cancelled
      })
      if (!next) break

      currentJobId = next.id
      next.status = 'running'
      next.startedAt = next.startedAt || Date.now()
      next.message = 'Starting…'
      notify()
      schedulePersist()

      try {
        await runJob(next)
        if (next.cancelled) {
          next.status = 'cancelled'
          next.message = 'Cancelled'
        } else {
          next.status = 'done'
          next.progress = 100
        }
      } catch (e) {
        next.status = 'error'
        next.error = e && e.message ? e.message : 'Job failed'
        next.message = next.error
      }

      next.completedAt = Date.now()
      currentJobId = null
      notify()
      schedulePersist()
      await yieldToMain()
    }
  } finally {
    processQueueRunning = false
    running = false
    currentJobId = null
    notify()
    schedulePersist()
  }
}

export function enqueueChordReadinessJob(spec) {
  const options = spec || {}
  const job = {
    id: makeJobId(),
    action: options.action || 'audit',
    book: options.book || null,
    limit: options.limit != null ? Number(options.limit) : 25,
    dryRun: options.dryRun !== false,
    includeMelody: !!options.includeMelody,
    alwaysTag: !!options.alwaysTag,
    status: 'pending',
    progress: 0,
    progressDone: 0,
    progressTotal: 0,
    message: 'Queued',
    error: null,
    cancelled: false,
    startedAt: Date.now(),
    completedAt: null,
    auditReport: null,
    batchResult: null,
  }
  jobs.unshift(job)
  notify()
  schedulePersist()
  processQueue()
  return job.id
}

export function cancelJob(id) {
  const job = jobs.find(function(item) { return item.id === id })
  if (!job) return false
  if (job.status === 'done' || job.status === 'cancelled' || job.status === 'error') return false
  job.cancelled = true
  if (job.status === 'pending') {
    job.status = 'cancelled'
    job.message = 'Cancelled'
    job.completedAt = Date.now()
  }
  notify()
  schedulePersist()
  return true
}

export function cancelAllJobs() {
  let changed = false
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running') return
    job.cancelled = true
    if (job.status === 'pending') {
      job.status = 'cancelled'
      job.message = 'Cancelled'
      job.completedAt = Date.now()
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

export function countActiveChordReadinessJobs() {
  return jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length
}

export async function restoreAndResume() {
  if (restored) return
  try {
    const saved = await store.getItem(STORAGE_KEY)
    if (saved && Array.isArray(saved.jobs)) {
      jobCounter = typeof saved.jobCounter === 'number' ? saved.jobCounter : 0
      jobs = saved.jobs.map(mapSavedJob)
      loadWorkSession(saved.workSession)
      rebuildSnapshot()
      const wasRunning = !!saved.running
      if (wasRunning && jobs.some(function(job) { return job.status === 'pending' })) {
        processQueue()
      }
    }
  } catch (e) {
    console.log(e)
  } finally {
    restored = true
  }
}

export function __resetForTests() {
  jobs = []
  jobCounter = 0
  running = false
  currentJobId = null
  processQueueRunning = false
  restored = false
  clearWorkSession()
  queueContext = {
    getTunebook: null,
    getTunes: null,
    getAbcjsParser: null,
    forceRefresh: null,
  }
  cachedSnapshot = {
    running: false,
    jobs: [],
    currentJobId: null,
    overallProgress: 0,
    finishedCount: 0,
    totalCount: 0,
    lastAuditReport: null,
    lastBatchResult: null,
    workSession: { sessions: {} },
  }
  notify()
}
