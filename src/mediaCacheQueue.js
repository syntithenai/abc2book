import {
  downloadAndCacheExternalMedia,
  getExternalMediaCacheKey,
  isExternalMediaCached,
} from './externalMediaAudioCache'
import { resolveActiveLinkForTune } from './mediaLinkResolve'
import { getMediaPlaybackSettings } from './pitchTempoUtils'
import { sanitizeDownloadFilename } from './tuneDownloadActions'

let jobCounter = 0
let running = false
let paused = false
let jobs = []
const listeners = new Set()
let currentJobId = null

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
  return audioFormat === 'wav' ? 'wav' : 'mp3'
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
    youtubeGetId: options.youtubeGetId,
    accessToken: options.accessToken,
  }
  jobs.push(job)
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
  const extension = format === 'wav' ? 'wav' : 'mp3'
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
  jobs = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  })
  notify()
}

export function start() {
  paused = false
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

async function runJob(job) {
  if (job.cancelled) {
    job.status = 'cancelled'
    return
  }

  job.status = 'running'
  currentJobId = job.id
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
      return
    }

    if (job.type === 'download') {
      if (!job.tune) {
        throw new Error('Tune data missing for download job')
      }
      const { downloadTuneMediaExport } = await import('./mediaExportUtils')
      await downloadTuneMediaExport({
        tune: job.tune,
        linkIndex: job.linkIndex,
        srcType: job.srcType,
        filename: job.filename,
        audioFormat: job.audioFormat,
        youtubeGetId: job.youtubeGetId,
        accessToken: job.accessToken,
        demucsModel: job.demucsModel,
        settings: getMediaPlaybackSettings(job.tune),
        trim: true,
      })
      if (job.cancelled) {
        job.status = 'cancelled'
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
    } else {
      job.status = 'error'
      job.error = e && e.message ? e.message : 'Job failed'
    }
  } finally {
    if (currentJobId === job.id) {
      currentJobId = null
    }
  }
}

async function processQueue() {
  while (running && !paused) {
    const next = jobs.find(function(job) { return job.status === 'pending' })
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

export function getExternalMediaCacheKeyForJob(job) {
  return getExternalMediaCacheKey(job.tuneId, job.linkIndex, job.src)
}
