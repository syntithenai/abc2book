import localforage from 'localforage'
import { resolveActiveLinkForTune } from './mediaLinkResolve'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { isAbortError } from './abortUtils'
import { getStemSourceCacheKey, getCachedStemSet } from './audioStemCache'

const STORAGE_KEY = 'queue-state'
const store = localforage.createInstance({ name: 'stemcreatequeue' })

let jobCounter = 0
let running = false
let paused = false
let jobs = []
let currentJobId = null
let persistTimer = null
let restored = false
let processQueueRunning = false

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
  return 'stem-create-job-' + jobCounter
}

function findDuplicateJob(tuneId, linkIndex, src, demucsModel) {
  return jobs.find(function(job) {
    return job.tuneId === tuneId
      && job.linkIndex === linkIndex
      && job.src === src
      && job.demucsModel === demucsModel
      && (job.status === 'pending' || job.status === 'running')
  })
}

function publicJob(job) {
  return {
    id: job.id,
    tuneId: job.tuneId,
    linkIndex: job.linkIndex,
    src: job.src,
    srcType: job.srcType,
    tuneName: job.tuneName,
    linkTitle: job.linkTitle,
    demucsModel: job.demucsModel,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    skipReason: job.skipReason,
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

export function isStemCreateQueueActive() {
  return running && !paused
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
          linkIndex: job.linkIndex,
          src: job.src,
          srcType: job.srcType,
          tuneName: job.tuneName,
          linkTitle: job.linkTitle,
          demucsModel: job.demucsModel,
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

function mapSavedJob(item) {
  return {
    id: item.id,
    tuneId: item.tuneId,
    linkIndex: item.linkIndex,
    src: item.src || '',
    srcType: item.srcType || 'audio',
    tuneName: item.tuneName || '',
    linkTitle: item.linkTitle || '',
    demucsModel: item.demucsModel || 'htdemucs',
    status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
    progress: typeof item.progress === 'number' ? item.progress : 0,
    message: item.message || '',
    error: item.error || null,
    skipReason: item.skipReason || null,
    accessToken: item.accessToken || null,
    cancelled: !!item.cancelled,
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
    jobs = saved.jobs.map(mapSavedJob)

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

function resolveDemucsModel(tunebook) {
  if (tunebook && tunebook.demucsModel) return tunebook.demucsModel
  const health = getMediaResolverHealthState().status
  return (health && health.demucsModel) || 'htdemucs'
}

function resolveAccessToken(tunebook) {
  if (tunebook && tunebook.getGoogleAccessToken) {
    return tunebook.getGoogleAccessToken()
  }
  return tunebook && tunebook.accessToken ? tunebook.accessToken : null
}

export function enqueueStemCreateJob(options) {
  const tuneId = options.tuneId
  const linkIndex = options.linkIndex
  const src = options.src
  const demucsModel = options.demucsModel || 'htdemucs'
  if (!tuneId || linkIndex === null || linkIndex === undefined || !src) {
    return null
  }

  const duplicate = findDuplicateJob(tuneId, linkIndex, src, demucsModel)
  if (duplicate) return duplicate.id

  const job = {
    id: makeJobId(),
    tuneId: tuneId,
    linkIndex: linkIndex,
    src: src,
    srcType: options.srcType || 'audio',
    tuneName: options.tuneName || '',
    linkTitle: options.linkTitle || '',
    demucsModel: demucsModel,
    status: 'pending',
    progress: 0,
    message: '',
    error: null,
    skipReason: null,
    accessToken: options.accessToken || null,
    cancelled: false,
  }
  jobs.push(job)
  notify()
  schedulePersist()
  return job.id
}

export function enqueueTunesStemCreateJobs(tunes, tunebook, preferredLinkIndexByTuneId) {
  const ids = []
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  const accessToken = resolveAccessToken(tunebook)
  const demucsModel = resolveDemucsModel(tunebook)

  if (!Array.isArray(tunes)) return ids

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return

    const preferred = preferredLinkIndexByTuneId && preferredLinkIndexByTuneId[tune.id] !== undefined
      ? preferredLinkIndexByTuneId[tune.id]
      : null
    const resolved = resolveActiveLinkForTune(tune, preferred, isYoutubeLink)
    if (!resolved) {
      jobs.push({
        id: makeJobId(),
        tuneId: tune.id,
        linkIndex: null,
        src: '',
        srcType: '',
        tuneName: tune.name || '',
        linkTitle: '',
        demucsModel: demucsModel,
        status: 'skipped',
        progress: 0,
        message: '',
        error: null,
        skipReason: 'no-link',
        accessToken: accessToken,
        cancelled: false,
      })
      return
    }

    const jobId = enqueueStemCreateJob({
      tuneId: tune.id,
      linkIndex: resolved.linkIndex,
      src: resolved.src,
      srcType: resolved.srcType,
      tuneName: tune.name || '',
      linkTitle: resolved.linkTitle,
      accessToken: accessToken,
      demucsModel: demucsModel,
    })
    if (jobId) ids.push(jobId)
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
  job.message = 'Checking stem cache...'
  currentJobId = job.id
  notify()
  schedulePersist()

  const controller = new AbortController()
  job.abortController = controller

  try {
    const cacheKey = getStemSourceCacheKey(
      job.tuneId,
      job.linkIndex,
      job.src,
      job.demucsModel || ''
    )
    const cached = await getCachedStemSet(cacheKey)
    if (job.cancelled) {
      job.status = 'cancelled'
      return
    }
    if (cached && cached.stemBuffers) {
      job.status = 'done'
      job.progress = 100
      job.message = 'Already cached'
      job.error = null
      return
    }

    job.message = 'Separating stems...'
    notify()

    const { loadStemBuffersForSource } = await import('./nativeFilteredMedia')
    const loaded = await loadStemBuffersForSource({
      tuneId: job.tuneId,
      linkIndex: job.linkIndex,
      src: job.src,
      srcType: job.srcType,
      label: job.linkTitle || '',
      accessToken: job.accessToken,
      demucsModel: job.demucsModel,
    }, {
      allowNetworkSeparation: true,
      signal: controller.signal,
      onProgress: function(message, progress) {
        if (job.cancelled) return
        job.message = message || ''
        if (typeof progress === 'number' && Number.isFinite(progress)) {
          job.progress = Math.max(0, Math.min(100, Math.round(progress)))
        }
        notify()
      },
      onStatus: function(status) {
        if (job.cancelled || !status) return
        job.message = status.message || 'Separating stems...'
        if (typeof status.progress === 'number' && Number.isFinite(status.progress)) {
          job.progress = Math.max(0, Math.min(100, Math.round(status.progress)))
        }
        notify()
      },
    })

    if (job.cancelled) {
      job.status = 'cancelled'
      return
    }

    if (!loaded || !loaded.stemBuffers) {
      throw new Error('Stem separation produced no audio stems')
    }

    job.status = 'done'
    job.progress = 100
    job.message = loaded.fromCache ? 'Already cached' : 'Stems ready'
    job.error = null
  } catch (e) {
    if (job.cancelled || isAbortError(e)) {
      job.status = 'cancelled'
      job.error = null
    } else {
      job.status = 'error'
      job.error = e && e.message ? e.message : 'Stem creation failed'
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
  jobs = saved.jobs.map(mapSavedJob)
  notify()
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
  listeners.clear()
}
