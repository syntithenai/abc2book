import {
  downloadAndCacheExternalMedia,
  getExternalMediaCacheKey,
  isExternalMediaCached,
} from './externalMediaAudioCache'
import { resolveActiveLinkForTune } from './mediaLinkResolve'
import { getMediaPlaybackSettings } from './pitchTempoUtils'
import { sanitizeDownloadFilename } from './tuneDownloadActions'
import {
  getActiveResolverAccessToken,
  getMediaResolverHealthState,
  subscribeMediaResolverHealth,
} from './mediaResolverHealthStore'
import {
  getResolverLoginWarning,
  getResolverProxiedPlaybackBlock,
  requiresResolverProxiedPlayback,
} from './mediaProxyClient'
import { isNavigatorOffline } from './offlinePlayback'
import {
  getAudioCompressExtension,
  getAudioCompressFormat,
  normalizeAudioCompressFormat,
} from './audioCompressSettings'
import { createReadyDownload, revokeReadyDownload } from './offerBlobDownload'

/** Failed cache attempts before the job is dropped from the queue. */
export const MAX_CACHE_ATTEMPTS = 3
let cacheRetryBaseDelayMs = 5000

export function __setCacheRetryDelayForTests(ms) {
  cacheRetryBaseDelayMs = typeof ms === 'number' ? ms : 5000
}

let jobCounter = 0
let running = false
let paused = false
let jobs = []
const listeners = new Set()
let currentJobId = null
let resumeListenersAttached = false
let retryWakeTimer = null

function revokeJobReadyDownload(job) {
  if (!job || !job.readyDownload) return
  revokeReadyDownload(job.readyDownload)
  job.readyDownload = null
}

export function claimJobReadyDownload(jobId) {
  const job = jobs.find(function(item) { return item.id === jobId })
  if (!job || !job.readyDownload) return null
  const ready = job.readyDownload
  job.readyDownload = null
  return ready
}

export function getSnapshotRevision() {
  return jobs.map(function(job) {
    return [
      job.id,
      job.type,
      job.status,
      job.attempts || 0,
      job.readyDownload ? '1' : '0',
      job.error || '',
      job.message || '',
    ].join(':')
  }).join('|')
}

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
  return 'media-job-' + jobCounter
}

function normalizeAudioFormat(audioFormat) {
  if (audioFormat === null || audioFormat === undefined || audioFormat === '') {
    return getAudioCompressFormat()
  }
  return normalizeAudioCompressFormat(audioFormat)
}

function isExportJobType(type) {
  return type === 'download' || type === 'processed-download'
}

function findDuplicateJob(type, tuneId, linkIndex, src, audioFormat) {
  return jobs.find(function(job) {
    return job.type === type
      && job.tuneId === tuneId
      && job.linkIndex === linkIndex
      && job.src === src
      && (type !== 'download' || normalizeAudioFormat(job.audioFormat) === normalizeAudioFormat(audioFormat))
      && (job.status === 'pending' || job.status === 'running')
  })
}

function getResolverDemucsModel(tunebook) {
  if (tunebook && tunebook.demucsModel) return tunebook.demucsModel
  const health = getMediaResolverHealthState()
  return (health.status && health.status.demucsModel) ? health.status.demucsModel : 'htdemucs'
}

function publicJob(job) {
  return {
    id: job.id,
    type: job.type,
    tuneId: job.tuneId,
    linkIndex: job.linkIndex,
    src: job.src,
    srcType: job.srcType,
    tuneName: job.tuneName,
    linkTitle: job.linkTitle,
    status: job.status,
    error: job.error,
    filename: job.filename,
    awaitingSave: !!(job.readyDownload),
    message: job.message || '',
    attempts: job.attempts || 0,
    maxAttempts: job.type === 'cache' ? MAX_CACHE_ATTEMPTS : 0,
  }
}

export function getState() {
  return {
    running: running,
    paused: paused,
    jobs: jobs.map(publicJob),
    currentJobId: currentJobId,
  }
}

export function subscribe(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function enqueueCacheJob(options) {
  const tuneId = options.tuneId
  const linkIndex = options.linkIndex
  const src = options.src
  if (!tuneId || linkIndex === null || linkIndex === undefined || !src) {
    return null
  }

  const duplicate = findDuplicateJob('cache', tuneId, linkIndex, src)
  if (duplicate) return duplicate.id

  const job = {
    id: makeJobId(),
    type: 'cache',
    tuneId: tuneId,
    linkIndex: linkIndex,
    src: src,
    srcType: options.srcType || 'audio',
    tuneName: options.tuneName || '',
    linkTitle: options.linkTitle || '',
    status: 'pending',
    error: null,
    filename: null,
    cancelled: false,
    attempts: 0,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.accessToken,
  }
  jobs.push(job)
  ensureCacheQueueResumeListeners()
  notify()
  return job.id
}

export function enqueueDownloadJob(options) {
  const tuneId = options.tuneId
  const linkIndex = options.linkIndex
  const src = options.src
  if (!tuneId || linkIndex === null || linkIndex === undefined || !src) {
    return null
  }

  const audioFormat = normalizeAudioFormat(options.audioFormat)
  const duplicate = findDuplicateJob('download', tuneId, linkIndex, src, audioFormat)
  if (duplicate) return duplicate.id

  const job = {
    id: makeJobId(),
    type: 'download',
    tuneId: tuneId,
    linkIndex: linkIndex,
    src: src,
    srcType: options.srcType || 'audio',
    tuneName: options.tuneName || '',
    linkTitle: options.linkTitle || '',
    status: 'pending',
    error: null,
    filename: options.filename || '',
    audioFormat: audioFormat,
    cancelled: false,
    tune: options.tune,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.accessToken,
    demucsModel: options.demucsModel || '',
  }
  jobs.push(job)
  notify()
  return job.id
}

export function enqueueProcessedDownloadJob(options) {
  const tuneId = options.tuneId
  const linkIndex = options.linkIndex
  const src = options.src
  if (!tuneId || linkIndex === null || linkIndex === undefined || !src || !options.tune) {
    return null
  }

  const duplicate = findDuplicateJob('processed-download', tuneId, linkIndex, src)
  if (duplicate) return duplicate.id

  const job = {
    id: makeJobId(),
    type: 'processed-download',
    tuneId: tuneId,
    linkIndex: linkIndex,
    src: src,
    srcType: options.srcType || 'audio',
    tuneName: options.tuneName || '',
    linkTitle: options.linkTitle || '',
    status: 'pending',
    error: null,
    filename: options.filename || '',
    cancelled: false,
    tune: options.tune,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.accessToken,
    demucsModel: options.demucsModel || getResolverDemucsModel(options.tunebook),
  }
  jobs.push(job)
  notify()
  return job.id
}

export function hasActiveExportJobForTune(tuneId) {
  return jobs.some(function(job) {
    return job.tuneId === tuneId
      && isExportJobType(job.type)
      && (job.status === 'pending' || job.status === 'running')
  })
}

export function whenJobSettles(id) {
  return new Promise(function(resolve, reject) {
    function inspect() {
      const job = jobs.find(function(item) { return item.id === id })
      if (!job) {
        reject(new Error('Job not found'))
        return true
      }
      if (job.status === 'done') {
        resolve(publicJob(job))
        return true
      }
      if (job.status === 'error') {
        reject(new Error(job.error || 'Job failed'))
        return true
      }
      if (job.status === 'cancelled') {
        reject(new Error('Cancelled'))
        return true
      }
      return false
    }
    if (inspect()) return undefined
    const unsub = subscribe(function() {
      if (inspect()) unsub()
    })
    return undefined
  })
}

export function enqueueTunesCacheJobs(tunes, tunebook, preferredLinkIndexByTuneId) {
  const ids = []
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  const youtubeGetId = tunebook && tunebook.utils ? tunebook.utils.YouTubeGetID : null
  const accessToken = tunebook && tunebook.getGoogleAccessToken
    ? tunebook.getGoogleAccessToken()
    : (tunebook && tunebook.accessToken ? tunebook.accessToken : null)

  if (!Array.isArray(tunes)) return ids

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    const preferred = preferredLinkIndexByTuneId && preferredLinkIndexByTuneId[tune.id] !== undefined
      ? preferredLinkIndexByTuneId[tune.id]
      : null
    const resolved = resolveActiveLinkForTune(tune, preferred, isYoutubeLink)
    if (!resolved) return
    const jobId = enqueueCacheJob({
      tuneId: tune.id,
      linkIndex: resolved.linkIndex,
      src: resolved.src,
      srcType: resolved.srcType,
      tuneName: tune.name || '',
      linkTitle: resolved.linkTitle,
      youtubeGetId: youtubeGetId,
      accessToken: accessToken,
    })
    if (jobId) ids.push(jobId)
  })

  return ids
}

export function enqueueTunesDownloadJobs(tunes, tunebook, preferredLinkIndexByTuneId, audioFormat) {
  const ids = []
  const format = normalizeAudioFormat(audioFormat)
  const extension = getAudioCompressExtension(format)
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  const youtubeGetId = tunebook && tunebook.utils ? tunebook.utils.YouTubeGetID : null
  const accessToken = tunebook && tunebook.getGoogleAccessToken
    ? tunebook.getGoogleAccessToken()
    : (tunebook && tunebook.accessToken ? tunebook.accessToken : null)
  const demucsModel = getResolverDemucsModel(tunebook)

  if (!Array.isArray(tunes)) return ids

  tunes.forEach(function(tune) {
    if (!tune || !tune.id) return
    const preferred = preferredLinkIndexByTuneId && preferredLinkIndexByTuneId[tune.id] !== undefined
      ? preferredLinkIndexByTuneId[tune.id]
      : null
    const resolved = resolveActiveLinkForTune(tune, preferred, isYoutubeLink)
    if (!resolved) return
    const safeName = sanitizeDownloadFilename(tune.name, 'tune')
    const jobId = enqueueDownloadJob({
      tuneId: tune.id,
      linkIndex: resolved.linkIndex,
      src: resolved.src,
      srcType: resolved.srcType,
      tuneName: tune.name || '',
      linkTitle: resolved.linkTitle,
      tune: tune,
      filename: safeName + '-link-' + (parseInt(resolved.linkIndex, 10) + 1) + '.' + extension,
      audioFormat: format,
      youtubeGetId: youtubeGetId,
      accessToken: accessToken,
      demucsModel: demucsModel,
    })
    if (jobId) ids.push(jobId)
  })

  return ids
}

export function cancelJob(id) {
  const job = jobs.find(function(item) { return item.id === id })
  if (!job) return false
  if (job.status === 'done' || job.status === 'cancelled') return false
  job.cancelled = true
  if (job.status === 'pending') {
    job.status = 'cancelled'
    revokeJobReadyDownload(job)
  }
  notify()
  return true
}

export function cancelAllJobs() {
  let changed = false
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running') return
    job.cancelled = true
    if (job.status === 'pending') {
      job.status = 'cancelled'
    }
    changed = true
  })
  if (changed) notify()
}

export function clearFinishedJobs() {
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running') {
      revokeJobReadyDownload(job)
    }
  })
  jobs = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  })
  notify()
}

export function start() {
  paused = false
  ensureCacheQueueResumeListeners()
  if (!running) {
    running = true
    processQueue()
  }
  notify()
}

export function stop() {
  paused = true
  notify()
}

function resolveCacheJobAccessToken(job) {
  return getActiveResolverAccessToken() || (job && job.accessToken) || null
}

/**
 * Cache jobs that need the resolver should wait (without burning attempts) until
 * we are online and logged in / resolver is reachable.
 */
export function canAttemptCacheJob(job, options) {
  if (!job || job.type !== 'cache') return true
  const opts = options || {}
  const now = opts.now !== undefined ? opts.now : Date.now()
  if (job.nextRetryAt && now < job.nextRetryAt) return false
  if (opts.offline !== undefined ? opts.offline : isNavigatorOffline()) {
    return false
  }
  const src = job.src
  if (!src || !requiresResolverProxiedPlayback(src)) return true

  const health = opts.resolverHealth || getMediaResolverHealthState()
  const status = opts.resolverStatus !== undefined
    ? opts.resolverStatus
    : (health && health.status)
  const accessToken = opts.accessToken !== undefined
    ? opts.accessToken
    : resolveCacheJobAccessToken(job)

  // First probe still running — allow the attempt; failure will retry later.
  if (opts.resolverStatus === undefined && health && !health.checked) return true

  if (getResolverLoginWarning(status, accessToken)) return false
  if (getResolverProxiedPlaybackBlock(status, accessToken)) return false
  if (status && !status.available) return false
  if (health && health.checked && !health.available) return false
  return true
}

function cacheJobBlockedMessage(job) {
  if (job && job.nextRetryAt && Date.now() < job.nextRetryAt) {
    return job.message || ('Retry ' + (job.attempts || 0) + '/' + MAX_CACHE_ATTEMPTS + ' scheduled…')
  }
  if (isNavigatorOffline()) return 'Waiting for connection…'
  if (!job || !requiresResolverProxiedPlayback(job.src)) return 'Waiting…'
  const health = getMediaResolverHealthState()
  const status = health && health.status
  const accessToken = resolveCacheJobAccessToken(job)
  if (getResolverLoginWarning(status, accessToken)) {
    return 'Waiting for login…'
  }
  if (getResolverProxiedPlaybackBlock(status, accessToken)) {
    return 'Waiting for resolver credit…'
  }
  return 'Waiting for media resolver…'
}

function removeJobById(jobId) {
  jobs = jobs.filter(function(item) { return item.id !== jobId })
}

function scheduleRetryWakeup(delayMs) {
  if (typeof setTimeout !== 'function') return
  const delay = Math.max(0, delayMs || 0)
  if (retryWakeTimer) clearTimeout(retryWakeTimer)
  retryWakeTimer = setTimeout(function() {
    retryWakeTimer = null
    if (jobs.some(function(job) { return job.status === 'pending' })) {
      start()
    }
  }, delay)
}

function handleCacheJobFailure(job, error) {
  const message = error && error.message ? error.message : 'Job failed'
  job.attempts = (job.attempts || 0) + 1
  job.error = message
  if (job.attempts >= MAX_CACHE_ATTEMPTS) {
    removeJobById(job.id)
    return
  }
  const delay = cacheRetryBaseDelayMs * job.attempts
  job.status = 'pending'
  job.nextRetryAt = Date.now() + delay
  job.message = 'Retry ' + job.attempts + '/' + MAX_CACHE_ATTEMPTS
    + ' after reconnect/login if needed'
  scheduleRetryWakeup(delay)
}

function findNextRunnableJob() {
  let blockedCache = false
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    if (job.status !== 'pending') continue
    if (job.type === 'cache' && !canAttemptCacheJob(job)) {
      job.message = cacheJobBlockedMessage(job)
      blockedCache = true
      continue
    }
    return job
  }
  if (blockedCache) notify()
  return null
}

function ensureCacheQueueResumeListeners() {
  if (resumeListenersAttached || typeof window === 'undefined') return
  resumeListenersAttached = true
  window.addEventListener('online', function() {
    if (jobs.some(function(job) { return job.status === 'pending' && job.type === 'cache' })) {
      start()
    }
  })
  subscribeMediaResolverHealth(function() {
    if (jobs.some(function(job) {
      return job.status === 'pending' && job.type === 'cache' && canAttemptCacheJob(job)
    })) {
      start()
    }
  })
}

async function runExportDownloadJob(job) {
  if (!job.tune) {
    throw new Error('Tune data missing for download job')
  }
  const isProcessed = job.type === 'processed-download'
  job.message = isProcessed ? 'Loading analysed stems...' : 'Preparing audio export...'
  notify()

  const { buildTuneMediaExportBlob, buildTuneMediaExportFilename } = await import('./mediaExportUtils')
  const { getAudioCompressExtension } = await import('./audioCompressSettings')
  const { loadCachedStemSetForMedia } = await import('./audioStemCache')

  if (isProcessed) {
    const cached = await loadCachedStemSetForMedia({
      tuneId: job.tuneId,
      linkIndex: job.linkIndex,
      src: job.src,
      srcType: job.srcType,
      demucsModel: job.demucsModel,
      accessToken: job.accessToken,
    })
    if (!cached || !cached.stemBuffers) {
      throw new Error('Analyse stems before downloading processed audio')
    }
  }

  let filename = job.filename
  const buildOptions = {
    tune: job.tune,
    linkIndex: job.linkIndex,
    srcType: job.srcType,
    youtubeGetId: job.youtubeGetId,
    accessToken: job.accessToken,
    demucsModel: job.demucsModel,
    settings: getMediaPlaybackSettings(job.tune),
    trim: true,
    onProgress: function(message) {
      if (job.cancelled) return
      job.message = message || job.message
      notify()
    },
  }

  if (isProcessed) {
    filename = buildTuneMediaExportFilename(job.tune, job.linkIndex, { processed: true, audioFormat: 'mp3' })
    buildOptions.preferStemMix = true
    buildOptions.allowNetworkSeparation = false
    buildOptions.audioFormat = 'mp3'
    buildOptions.preferFastOfflineEncode = true
    job.message = 'Mixing stems with current filter settings...'
    notify()
  } else {
    buildOptions.audioFormat = job.audioFormat
    buildOptions.preferFastOfflineEncode = true
    job.message = 'Encoding audio...'
    notify()
  }

  const result = await buildTuneMediaExportBlob(buildOptions)
  if (!result || !result.blob || result.blob.size <= 0) {
    throw new Error('Export produced an empty file')
  }

  const extension = getAudioCompressExtension(result.audioFormat)
  const resolvedFilename = String(filename).replace(/\.[^.]+$/, '') + '.' + extension
  const ready = createReadyDownload(result.blob, resolvedFilename)
  job.filename = resolvedFilename
  job.readyDownload = ready
}

async function runJob(job) {
  if (job.cancelled) {
    job.status = 'cancelled'
    return
  }

  job.status = 'running'
  currentJobId = job.id
  if (job.type === 'cache') {
    job.accessToken = resolveCacheJobAccessToken(job)
    job.nextRetryAt = 0
    job.message = job.attempts
      ? ('Caching (attempt ' + (job.attempts + 1) + '/' + MAX_CACHE_ATTEMPTS + ')…')
      : 'Caching…'
  }
  notify()

  try {
    if (job.type === 'cache') {
      const alreadyCached = await isExternalMediaCached(job.tuneId, job.linkIndex, job.src)
      if (job.cancelled) {
        job.status = 'cancelled'
        return
      }
      if (!alreadyCached) {
        await downloadAndCacheExternalMedia({
          tuneId: job.tuneId,
          linkIndex: job.linkIndex,
          src: job.src,
          srcType: job.srcType,
          youtubeGetId: job.youtubeGetId,
          accessToken: job.accessToken,
        })
      }
      if (job.cancelled) {
        job.status = 'cancelled'
        return
      }
      job.status = 'done'
      job.error = null
      job.message = ''
      return
    }

    if (job.type === 'download' || job.type === 'processed-download') {
      await runExportDownloadJob(job)
      if (job.cancelled) {
        job.status = 'cancelled'
        revokeJobReadyDownload(job)
        return
      }
      job.status = 'done'
      job.error = null
      return
    }

    throw new Error('Unknown job type')
  } catch (e) {
    if (job.cancelled) {
      job.status = 'cancelled'
      revokeJobReadyDownload(job)
    } else if (job.type === 'cache') {
      handleCacheJobFailure(job, e)
    } else {
      job.status = 'error'
      job.error = e && e.message ? e.message : 'Job failed'
      revokeJobReadyDownload(job)
    }
  } finally {
    if (currentJobId === job.id) {
      currentJobId = null
    }
  }
}

async function processQueue() {
  while (running && !paused) {
    const next = findNextRunnableJob()
    if (!next) {
      running = false
      notify()
      return
    }
    await runJob(next)
    notify()
  }
}

export function removeJobsForCacheKey(tuneId, linkIndex, src) {
  jobs = jobs.filter(function(job) {
    if (job.tuneId === tuneId && job.linkIndex === linkIndex && job.src === src) {
      return job.status !== 'pending' && job.status !== 'running'
    }
    return true
  })
  notify()
}

/** Cancel active cache/download jobs for deleted tunes so they do not re-write cache. */
export function removeJobsForTuneIds(tuneIds) {
  const idSet = {}
  ;(tuneIds || []).forEach(function(id) {
    if (id == null || id === '') return
    idSet[String(id)] = true
  })
  if (!Object.keys(idSet).length) return 0

  let cancelled = 0
  jobs.forEach(function(job) {
    if (!idSet[String(job.tuneId)]) return
    if (job.status !== 'pending' && job.status !== 'running') return
    job.cancelled = true
    if (job.status === 'pending') {
      job.status = 'cancelled'
      revokeJobReadyDownload(job)
    }
    cancelled += 1
  })
  if (cancelled) notify()
  return cancelled
}

export function removeJobsForTuneIdAndSrcs(tuneId, srcs) {
  const id = tuneId == null ? '' : String(tuneId)
  const srcSet = {}
  ;(srcs || []).forEach(function(src) {
    if (src) srcSet[String(src)] = true
  })
  if (!id || !Object.keys(srcSet).length) return 0

  let cancelled = 0
  jobs.forEach(function(job) {
    if (String(job.tuneId) !== id) return
    if (!srcSet[String(job.src || '')]) return
    if (job.status !== 'pending' && job.status !== 'running') return
    job.cancelled = true
    if (job.status === 'pending') {
      job.status = 'cancelled'
      revokeJobReadyDownload(job)
    }
    cancelled += 1
  })
  if (cancelled) notify()
  return cancelled
}

export function getExternalMediaCacheKeyForJob(job) {
  return getExternalMediaCacheKey(job.tuneId, job.linkIndex, job.src)
}

export function __resetMediaCacheQueueForTests() {
  running = false
  paused = false
  currentJobId = null
  jobs = []
  resumeListenersAttached = false
  cacheRetryBaseDelayMs = 5000
  if (retryWakeTimer) {
    clearTimeout(retryWakeTimer)
    retryWakeTimer = null
  }
}
