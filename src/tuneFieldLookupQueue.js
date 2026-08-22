import localforage from 'localforage'
import { searchLyrics } from './lyricsSearchClient'
import { searchChords } from './chordsSearchClient'
import { discoverComposers } from './composerSearchClient'
import { searchNotation } from './notationSearchClient'
import { filterNotationSearchCandidates } from './notationSearchNormalize'
import { checkYouTubeLinkOembed } from './youtubeSearchClient'
import { searchMediaLinks } from './mediaLinkSearchClient'
import { searchAliases } from './aliasesSearchClient'
import { searchArtists } from './artistsSearchClient'
import { searchGenre } from './genreSearchClient'
import { searchAlbumsForSong } from './albumsSearchClient'
import {
  checkAudioLinkPlayback,
  getEmptyLinkReason,
  getLinkSrcType,
  tuneHasLinkContent,
} from './checkTuneLinkPlayback'
import { buildComposerPickerCandidates } from './composerDiscoveryUtils'
import { sortCandidatesByConfidence } from './bibliographicSearchUtils'
import { isAbortError } from './abortUtils'
import { isNavigatorOffline, registerOnlineResume } from './offlineNetwork'
import {
  buildCurrentValueSuggestion,
  collateUniqueSuggestions,
  nonCurrentCandidates,
} from './fieldSuggestionsUtils'
import { shouldOfferTitleSuggestion } from './composerDiscoveryUtils'
import { shouldOfferGenreSuggestion } from './genreInference'
import { toast } from 'react-toastify'
import {
  applyCandidateToTune,
  applyCandidateToTuneAsync,
  candidateDisplayValue,
  historyLabelForKind,
  isTuneFieldEmptyForKind,
  toastAppliedFieldLookup,
  toastFieldSearchFinished,
} from './fieldLookupApplyUtils'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import { isNotationPdfCandidate } from './notationPdfApply'
import { getImportReviewSession } from './importReviewSessionStore'
import { getPlainLyricLines } from './wLinesUtils'
import { allGenres, primaryArtist } from './tuneBibliographicUtils'
import {
  setFieldSearchResults,
  targetKeyForFieldSearch,
} from './fieldSearchResultCache'

export const FIELD_LOOKUP_KINDS = [
  'lyrics',
  'chords',
  'composer',
  'notation',
  'links',
  'genre',
  'albums',
  'artists',
  'aliases',
  'title',
  'tempo',
  'meter',
  'key',
]

export const SIDE_FIELD_SUGGESTION_ORIGIN = 'side-inference'

const MAX_CONCURRENT_JOBS = 3

/** Called when a field-lookup job is applied or dismissed while linked to Import Review. */
let fieldLookupResolvedHandler = null

export function setFieldLookupResolvedHandler(handler) {
  fieldLookupResolvedHandler = typeof handler === 'function' ? handler : null
}

function notifyFieldLookupResolved(job) {
  if (!job || !job.reviewCandidateId) return
  if (typeof fieldLookupResolvedHandler !== 'function') return
  try {
    fieldLookupResolvedHandler(publicJob(job))
  } catch (e) {
    console.log(e)
  }
}

export function buildSearchModeOptions(mode, extra) {
  const opts = Object.assign({}, extra || {})
  if (mode === 'review') {
    opts.searchMode = 'review'
    opts.alwaysPick = true
  } else if (mode === 'auto') {
    opts.searchMode = 'auto'
    opts.alwaysPick = false
  }
  return opts
}

const STORAGE_KEY = 'queue-state'
const store = localforage.createInstance({ name: 'tunefieldlookupqueue' })

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
  abcTools: null,
  getTunebook: null,
  getAbcjsParser: null,
}

/** Live UI handlers: targetKey:kind → { onAwaiting(job), onError(job), onProgress(job) } */
const liveHandlers = new Map()

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

export function setTuneFieldLookupQueueContext(context) {
  queueContext = Object.assign({}, queueContext, context || {})
}

function makeJobId() {
  jobCounter += 1
  return 'field-lookup-job-' + jobCounter
}

export function targetKeyForJob(job) {
  if (!job) return ''
  if (job.tuneId) return 'tune:' + String(job.tuneId)
  if (job.candidateId) return 'candidate:' + String(job.candidateId)
  return ''
}

function liveHandlerKey(targetKey, kind) {
  return String(targetKey || '') + ':' + String(kind || '')
}

function findDuplicateJob(targetKey, kind) {
  return jobs.find(function(job) {
    return targetKeyForJob(job) === targetKey
      && job.kind === kind
      && (job.status === 'pending' || job.status === 'running' || job.status === 'awaiting')
  })
}

function kindLabel(kind) {
  if (kind === 'lyrics') return 'Lyrics search'
  if (kind === 'chords') return 'Chord search'
  if (kind === 'composer') return 'Artist search'
  if (kind === 'notation') return 'Notation search'
  if (kind === 'links') return 'Link search'
  if (kind === 'genre') return 'Genre search'
  if (kind === 'albums') return 'Album search'
  if (kind === 'artists') return 'Artists search'
  if (kind === 'aliases') return 'Alias search'
  if (kind === 'title') return 'Title suggestion'
  if (kind === 'tempo') return 'Tempo suggestion'
  if (kind === 'meter') return 'Time signature suggestion'
  if (kind === 'key') return 'Key suggestion'
  return 'Field search'
}

function publicJob(job) {
  return {
    id: job.id,
    tuneId: job.tuneId || null,
    candidateId: job.candidateId || null,
    reviewCandidateId: job.reviewCandidateId || null,
    targetKey: targetKeyForJob(job),
    kind: job.kind,
    label: job.label || kindLabel(job.kind),
    title: job.title || '',
    artist: job.artist || '',
    tuneName: job.tuneName || job.title || '',
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    candidates: Array.isArray(job.candidates) ? job.candidates.slice() : [],
    manualCandidates: Array.isArray(job.manualCandidates) ? job.manualCandidates.slice() : [],
    musescorePaywalled: !!job.musescorePaywalled,
    options: job.options ? Object.assign({}, job.options) : {},
    appliedCandidate: job.appliedCandidate || null,
    suggestedTitle: job.suggestedTitle || '',
    origin: job.origin || null,
  }
}

export function getState() {
  const active = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
  })
  const finished = jobs.filter(function(job) {
    return job.status === 'done' || job.status === 'error' || job.status === 'cancelled'
  }).length
  const total = jobs.length
  return {
    running: running,
    paused: paused,
    jobs: jobs.map(publicJob),
    currentJobId: currentJobId,
    overallProgress: total > 0 ? Math.round((finished / total) * 100) : 0,
    finishedCount: finished,
    totalCount: total,
    activeCount: active.length,
    awaitingCount: jobs.filter(function(job) { return job.status === 'awaiting' }).length,
  }
}

export function subscribe(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

/**
 * Register a live UI handler for a target+kind. When a job becomes awaiting/error,
 * the handler is invoked so the open form can open a picker immediately.
 * Returns unregister function.
 */
export function registerLiveHandler(targetKey, kind, handler) {
  const key = liveHandlerKey(targetKey, kind)
  liveHandlers.set(key, handler || null)
  return function unregister() {
    if (liveHandlers.get(key) === handler) {
      liveHandlers.delete(key)
    }
  }
}

export function getAwaitingJob(targetKey, kind) {
  return getState().jobs.find(function(job) {
    return job.targetKey === targetKey
      && job.kind === kind
      && job.status === 'awaiting'
  }) || null
}

export function getActiveJob(targetKey, kind) {
  return getState().jobs.find(function(job) {
    return job.targetKey === targetKey
      && job.kind === kind
      && (job.status === 'pending' || job.status === 'running' || job.status === 'awaiting')
  }) || null
}

export function findJobById(id) {
  return getState().jobs.find(function(job) { return job.id === id }) || null
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
          tuneId: job.tuneId || null,
          candidateId: job.candidateId || null,
          reviewCandidateId: job.reviewCandidateId || null,
          kind: job.kind,
          label: job.label || kindLabel(job.kind),
          title: job.title || '',
          artist: job.artist || '',
          tuneName: job.tuneName || '',
          titleHint: job.titleHint || '',
          status: job.status === 'running' ? 'pending' : job.status,
          progress: job.progress,
          message: job.message,
          error: job.error,
          candidates: job.candidates || [],
          manualCandidates: job.manualCandidates || [],
          options: job.options || {},
          accessToken: job.accessToken,
          cancelled: !!job.cancelled,
          origin: job.origin || null,
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
        tuneId: item.tuneId || null,
        candidateId: item.candidateId || null,
        reviewCandidateId: item.reviewCandidateId || null,
        kind: item.kind,
        label: item.label || kindLabel(item.kind),
        title: item.title || '',
        artist: item.artist || '',
        tuneName: item.tuneName || '',
        titleHint: item.titleHint || '',
        status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
        progress: typeof item.progress === 'number' ? item.progress : 0,
        message: item.message || '',
        error: item.error || null,
        candidates: Array.isArray(item.candidates) ? item.candidates : [],
        manualCandidates: Array.isArray(item.manualCandidates) ? item.manualCandidates : [],
        options: item.options && typeof item.options === 'object' ? item.options : {},
        accessToken: item.accessToken || null,
        cancelled: !!item.cancelled,
        origin: item.origin || null,
      }
    })
    notify()
    if (saved.running && !paused && jobs.some(function(job) { return job.status === 'pending' })) {
      start()
    }
    // Session may have been dropped on reload; unlink stale review ids so jobs
    // can be re-promoted into a fresh import-review session.
    clearOrphanFieldLookupReviewLinks(getImportReviewSession())
  } catch (e) {
    console.log(e)
  } finally {
    restored = true
  }
}

/**
 * Enqueue a field lookup search.
 * options: {
 *   tuneId?, candidateId?, kind, title, artist?, titleHint?, tuneName?,
 *   accessToken?, options?: { updateLyrics?, preferChords?, alwaysPick?, songType?, ... },
 *   searchOptions?: passthrough for clients (resolverAvailable, abcTools, renderChords)
 * }
 */
export function enqueueLookup(spec) {
  if (!spec || !spec.kind || FIELD_LOOKUP_KINDS.indexOf(spec.kind) < 0) return null
  const tuneId = spec.tuneId || null
  const candidateId = spec.candidateId || null
  if (!tuneId && !candidateId) return null

  const title = String(spec.title || '').trim()
  if (!title) return null

  const targetKey = tuneId ? ('tune:' + String(tuneId)) : ('candidate:' + String(candidateId))
  const duplicate = findDuplicateJob(targetKey, spec.kind)
  if (duplicate) {
    // Already searching — reuse the in-flight job.
    if (duplicate.status === 'pending' || duplicate.status === 'running') {
      return duplicate.id
    }
    // New Search clears prior suggestions for this kind, then re-enqueues.
    if (duplicate.status === 'awaiting') {
      dismissFieldLookup(duplicate.id)
    }
  }

  const job = {
    id: makeJobId(),
    tuneId: tuneId,
    candidateId: candidateId,
    kind: spec.kind,
    label: spec.label || kindLabel(spec.kind),
    title: title,
    artist: spec.artist || '',
    tuneName: spec.tuneName || title,
    titleHint: spec.titleHint || '',
    status: 'pending',
    progress: 0,
    message: '',
    error: null,
    candidates: [],
    manualCandidates: [],
    options: spec.options && typeof spec.options === 'object' ? Object.assign({}, spec.options) : {},
    searchOptions: spec.searchOptions && typeof spec.searchOptions === 'object'
      ? Object.assign({}, spec.searchOptions)
      : {},
    accessToken: spec.accessToken || null,
    cancelled: false,
  }
  jobs.push(job)
  notify()
  schedulePersist()
  return job.id
}

/**
 * Seed an awaiting job with precomputed candidates (e.g. import-review enrichment).
 */
export function seedAwaitingLookup(spec) {
  if (!spec || !spec.kind || FIELD_LOOKUP_KINDS.indexOf(spec.kind) < 0) return null
  const tuneId = spec.tuneId || null
  const candidateId = spec.candidateId || null
  if (!tuneId && !candidateId) return null
  const candidates = Array.isArray(spec.candidates) ? spec.candidates : []
  if (candidates.length === 0) return null

  const targetKey = tuneId ? ('tune:' + String(tuneId)) : ('candidate:' + String(candidateId))
  const existing = findDuplicateJob(targetKey, spec.kind)
  if (existing) {
    if (existing.status === 'awaiting' || existing.status === 'pending' || existing.status === 'running') {
      existing.candidates = candidates
      existing.status = 'awaiting'
      existing.progress = 100
      existing.message = ''
      existing.error = null
      if (spec.origin) existing.origin = spec.origin
      if (spec.label) existing.label = spec.label
      if (spec.originalValue !== undefined) existing.originalValue = spec.originalValue
      notifyLive(existing)
      notify()
      schedulePersist()
      return existing.id
    }
  }

  const job = {
    id: makeJobId(),
    tuneId: tuneId,
    candidateId: candidateId,
    kind: spec.kind,
    label: spec.label || kindLabel(spec.kind),
    title: String(spec.title || '').trim(),
    artist: spec.artist || '',
    tuneName: spec.tuneName || spec.title || '',
    titleHint: spec.titleHint || '',
    status: 'awaiting',
    progress: 100,
    message: '',
    error: null,
    candidates: candidates,
    manualCandidates: [],
    options: spec.options && typeof spec.options === 'object' ? Object.assign({}, spec.options) : {},
    searchOptions: {},
    accessToken: null,
    cancelled: false,
    origin: spec.origin || null,
    originalValue: spec.originalValue !== undefined ? spec.originalValue : undefined,
  }
  jobs.push(job)
  notifyLive(job)
  notify()
  schedulePersist()
  return job.id
}

/**
 * Offer a genre/title (etc.) suggestion from another search.
 * Empty fields are applied without attaching suggestions; matching values are skipped;
 * otherwise seeds the normal Suggestions strip.
 */
export function offerSideFieldSuggestion(spec) {
  const opts = spec || {}
  const kind = opts.kind
  const tuneId = opts.tuneId || null
  const candidateId = opts.candidateId || null
  const candidate = opts.candidate
  if (!kind || FIELD_LOOKUP_KINDS.indexOf(kind) < 0) return null
  if (!tuneId && !candidateId) return null
  if (!candidate) return null

  const tune = (typeof queueContext.getTune === 'function' && tuneId)
    ? queueContext.getTune(tuneId)
    : (opts.tune || null)

  let currentValue = opts.currentValue
  if (currentValue === undefined && tuneId) {
    currentValue = currentFieldValueForJob({ tuneId: tuneId, kind: kind })
  }
  if (currentValue === undefined || currentValue === null) {
    currentValue = kind === 'artists' || kind === 'aliases' || kind === 'links' ? [] : ''
  }

  const display = candidateDisplayValue(kind, candidate)
  if (kind === 'genre') {
    if (!shouldOfferGenreSuggestion(display, currentValue)) return null
  } else if (kind === 'title') {
    if (!shouldOfferTitleSuggestion(String(currentValue || ''), display)) return null
  } else if (!display) {
    return null
  }

  function valueLooksEmpty(value) {
    return !(Array.isArray(value)
      ? value.some(function(item) { return String(item || '').trim() })
      : String(value || '').trim())
  }

  // Prefer the caller's live field value (form draft) when provided so we do not
  // overwrite non-empty UI state just because the saved tune field is empty.
  const empty = Object.prototype.hasOwnProperty.call(opts, 'currentValue')
    ? valueLooksEmpty(opts.currentValue)
    : (tune ? isTuneFieldEmptyForKind(tune, kind) : valueLooksEmpty(currentValue))

  if (empty) {
    let applied = false
    if (tune) {
      applied = applyCandidateToTune(tune, kind, candidate, queueContext.abcTools)
      if (applied && typeof queueContext.saveTune === 'function') {
        try {
          queueContext.saveTune(tune, false, { historyLabel: historyLabelForKind(kind) })
          if (typeof queueContext.forceRefresh === 'function') {
            queueContext.forceRefresh()
          }
        } catch (e) {
          // keep going so onApplied can still sync draft forms
        }
      }
    }
    if (typeof opts.onApplied === 'function') {
      opts.onApplied(candidate)
      applied = true
    }
    const cacheKey = targetKeyForFieldSearch(tuneId, candidateId)
    if (cacheKey) setFieldSearchResults(cacheKey, kind, [candidate])
    return applied ? { applied: true } : null
  }

  const targetKey = tuneId ? ('tune:' + String(tuneId)) : ('candidate:' + String(candidateId))
  const existing = getAwaitingJob(targetKey, kind)
  if (existing) dismissFieldLookup(existing.id)

  let candidates = [candidate]
  const current = buildCurrentValueSuggestion(kind, currentValue)
  if (current) candidates = [current].concat(candidates)
  candidates = collateUniqueSuggestions(kind, candidates)
  const searchable = nonCurrentCandidates(candidates, {
    kind: kind,
    originalValue: currentValue,
  })
  if (!searchable.length) return null

  // Non-empty: cache for caret / one-shot picker — do not seed a global awaiting inbox.
  setFieldSearchResults(targetKey, kind, searchable)
  if (typeof opts.onOfferDialog === 'function') {
    opts.onOfferDialog(searchable)
  }
  return { cached: true, candidates: searchable }
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
  if (job.status === 'done' || job.status === 'cancelled') return false
  abortRunningJob(job)
  if (job.status === 'pending' || job.status === 'awaiting') {
    job.status = 'cancelled'
  }
  notify()
  schedulePersist()
  return true
}

export function cancelAllJobs() {
  let changed = false
  jobs.forEach(function(job) {
    if (job.status !== 'pending' && job.status !== 'running' && job.status !== 'awaiting') return
    abortRunningJob(job)
    if (job.status === 'pending' || job.status === 'awaiting') {
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
  const kept = []
  jobs.forEach(function(job) {
    if (job.status === 'pending' || job.status === 'running') {
      kept.push(job)
      return
    }
    if (job.status === 'awaiting') {
      job.status = 'done'
      job.progress = 100
      job.message = ''
      job.candidates = []
      job.manualCandidates = []
      notifyFieldLookupResolved(job)
    }
  })
  jobs = kept
  notify()
  schedulePersist()
}

export function shouldDeferFieldLookupSave(job) {
  if (!job) return false
  if (job.reviewCandidateId) return true
  return jobSearchMode(job) === 'review'
}

export async function applyFieldLookupChoice(jobId, candidate) {
  const job = jobs.find(function(item) { return item.id === jobId })
  if (!job || job.status !== 'awaiting') return null

  // Review mode and jobs linked into import review: draft owns persistence on Import/Add.
  const deferSave = shouldDeferFieldLookupSave(job)

  if (!deferSave && job.tuneId && candidate) {
    const getTune = queueContext.getTune
    const saveTune = queueContext.saveTune
    if (typeof getTune === 'function' && typeof saveTune === 'function') {
      const tune = getTune(job.tuneId)
      if (tune) {
        let applied = false
        // Live form handlers (lyrics/chords buttons) own the write; only mark done.
        if (job.kind === 'chords') {
          if (!hasLiveHandler(job)) {
            applied = tryApplyChordsCandidate(job, candidate)
            if (applied) {
              toastAppliedFieldLookup(job.kind, tune.name || job.title)
            }
          }
        } else if (job.kind === 'notation' && isNotationPdfCandidate(candidate)) {
          applied = await applyCandidateToTuneAsync(
            tune,
            job.kind,
            candidate,
            queueContext.abcTools,
            { accessToken: job.accessToken }
          )
          if (applied) {
            try {
              saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
              if (typeof queueContext.forceRefresh === 'function') {
                queueContext.forceRefresh()
              }
              if (!hasLiveHandler(job)) {
                toastAppliedFieldLookup(job.kind, tune.name || job.title)
              }
            } catch (e) {
              console.log(e)
            }
          }
        } else {
          applied = applyCandidateToTune(
            tune,
            job.kind,
            candidate,
            queueContext.abcTools
          )
          if (applied) {
            try {
              saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
              if (typeof queueContext.forceRefresh === 'function') {
                queueContext.forceRefresh()
              }
              if (!hasLiveHandler(job)) {
                toastAppliedFieldLookup(job.kind, tune.name || job.title)
              }
            } catch (e) {
              console.log(e)
            }
          }
        }
      }
    }
  }

  // One-shot: apply and finish. Cached alternatives live in fieldSearchResultCache.
  job.appliedCandidate = candidate || null
  job.status = 'done'
  job.progress = 100
  job.message = ''
  job.error = null
  job.candidates = []
  notifyFieldLookupResolved(job)
  notify()
  schedulePersist()
  return candidate
}

/**
 * Link an awaiting lookup to an import-review candidate so it is reviewed
 * in the import form instead of a separate search-suggestions list.
 */
export function linkFieldLookupToReviewCandidate(jobId, candidateId) {
  const job = jobs.find(function(item) { return item.id === jobId })
  if (!job || !candidateId) return false
  job.reviewCandidateId = String(candidateId)
  job.candidateId = String(candidateId)
  notify()
  schedulePersist()
  return true
}

/**
 * Drop reviewCandidateId links that no longer point at an active import-review
 * candidate (e.g. after reload when sessionStorage session was cleared).
 * Returns the number of jobs unlinked.
 */
export function clearOrphanFieldLookupReviewLinks(session) {
  const activeIds = {}
  if (session && Array.isArray(session.candidates)) {
    session.candidates.forEach(function(candidate) {
      if (candidate && candidate.id) activeIds[String(candidate.id)] = true
    })
  }
  let changed = 0
  jobs.forEach(function(job) {
    if (!job || !job.reviewCandidateId) return
    if (job.status !== 'awaiting' && job.status !== 'pending' && job.status !== 'running') {
      return
    }
    if (activeIds[String(job.reviewCandidateId)]) return
    job.reviewCandidateId = null
    changed += 1
  })
  if (changed) {
    notify()
    schedulePersist()
  }
  return changed
}

/**
 * Mark awaiting Review-mode lookups done when their tune no longer exists.
 * Returns the number of jobs dismissed.
 */
export function dismissAwaitingFieldLookupsMissingTune(getTune) {
  if (typeof getTune !== 'function') return 0
  let changed = 0
  jobs.forEach(function(job) {
    if (!job || job.status !== 'awaiting' || !job.tuneId) return
    if (getTune(job.tuneId)) return
    job.status = 'done'
    job.progress = 100
    job.message = ''
    job.error = null
    job.candidates = []
    job.manualCandidates = []
    job.reviewCandidateId = null
    changed += 1
  })
  if (changed) {
    notify()
    schedulePersist()
  }
  return changed
}

export function dismissFieldLookup(jobId) {
  const job = jobs.find(function(item) { return item.id === jobId })
  if (!job || job.status !== 'awaiting') return false
  job.status = 'done'
  job.progress = 100
  job.message = ''
  job.candidates = []
  job.manualCandidates = []
  notifyFieldLookupResolved(job)
  notify()
  schedulePersist()
  return true
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

function notifyLive(job) {
  const handler = liveHandlers.get(liveHandlerKey(targetKeyForJob(job), job.kind))
  if (!handler) return
  try {
    // Awaiting = open one-shot picker. Done with appliedCandidate = sync auto-apply to draft forms.
    if (
      (job.status === 'awaiting'
        || (job.status === 'done' && job.appliedCandidate)
        || (job.status === 'done' && job.notifyEmpty))
      && typeof handler.onAwaiting === 'function'
    ) {
      handler.onAwaiting(publicJob(job))
    } else if (job.status === 'error' && typeof handler.onError === 'function') {
      handler.onError(publicJob(job))
    } else if ((job.status === 'running' || job.status === 'pending') && typeof handler.onProgress === 'function') {
      handler.onProgress(publicJob(job))
    }
  } catch (e) {
    console.log(e)
  }
}

function normalizeCandidatesFromResult(kind, result, options) {
  if (!result) return { candidates: [], manualCandidates: [], empty: true }

  if (kind === 'composer') {
    const candidates = buildComposerPickerCandidates(result, options && options.currentComposer)
    return {
      candidates: candidates,
      manualCandidates: [],
      empty: candidates.length === 0,
    }
  }

  if (kind === 'albums' && result && Array.isArray(result.candidates) && result.candidates.length > 0) {
    return {
      candidates: result.candidates,
      manualCandidates: [],
      empty: false,
    }
  }

  if (kind === 'albums' && result && Array.isArray(result.albums) && result.albums.length > 0) {
    return {
      candidates: result.albums.map(function(album) {
        return { album: album, preview: album, source: 'MusicBrainz' }
      }),
      manualCandidates: [],
      empty: false,
    }
  }

  if (result.empty && result.musescorePaywalled === true) {
    return {
      candidates: [],
      manualCandidates: [],
      empty: true,
      musescorePaywalled: true,
    }
  }

  if (result.empty && Array.isArray(result.manualCandidates) && result.manualCandidates.length > 0) {
    return {
      candidates: [],
      manualCandidates: result.manualCandidates,
      empty: true,
      musescorePaywalled: result.musescorePaywalled === true,
    }
  }

  if (result.multiple && Array.isArray(result.candidates)) {
    const candidates = kind === 'notation'
      ? filterNotationSearchCandidates(result.candidates)
      : result.candidates
    return {
      candidates: candidates,
      manualCandidates: [],
      empty: candidates.length === 0,
    }
  }

  if (!result.empty && result) {
    // Single result object (lyrics/chords/notation)
    if (kind === 'notation' && Array.isArray(result.candidates) && result.candidates.length > 0) {
      const candidates = filterNotationSearchCandidates(result.candidates)
      return { candidates: candidates, manualCandidates: [], empty: candidates.length === 0 }
    }
    if (kind === 'notation' && filterNotationSearchCandidates([result]).length === 0) {
      return { candidates: [], manualCandidates: [], empty: true }
    }
    return {
      candidates: [result],
      manualCandidates: [],
      empty: false,
    }
  }

  return { candidates: [], manualCandidates: [], empty: true }
}

async function existingLinksAreValid(tune, searchOptions, signal) {
  if (!tuneHasLinkContent(tune)) return false
  const links = Array.isArray(tune.links) ? tune.links : []
  const isYoutubeLink = searchOptions && searchOptions.isYoutubeLink
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    const emptyReason = getEmptyLinkReason(link)
    if (emptyReason) continue
    const srcType = getLinkSrcType(link, isYoutubeLink)
    const src = String(link.link).trim()
    let result
    if (srcType === 'youtube') {
      result = await checkYouTubeLinkOembed(src, signal)
    } else if (srcType === 'recording') {
      // Owned recordings are treated as valid when present; full resolve is expensive.
      result = { ok: true }
    } else {
      result = await checkAudioLinkPlayback(src, { signal: signal, timeoutMs: 12000 })
    }
    if (result && result.ok) return true
  }
  return false
}

function chordsResultUsable(result) {
  if (!result || result.empty) {
    return !!(result && Array.isArray(result.manualCandidates) && result.manualCandidates.length)
  }
  if (result.multiple && Array.isArray(result.candidates) && result.candidates.length) return true
  if (result.chordText || result.abc || result.chordProSource) return true
  if (Array.isArray(result.lyricLines) && result.lyricLines.length) return true
  if (Array.isArray(result.sheetLines) && result.sheetLines.length) return true
  return false
}

function adoptJobAsChords(job) {
  job.kind = 'chords'
  // Enhance lyrics+chords: review shows one suggestion that updates both fields.
  job.label = 'Chords and lyrics search'
  const nextOptions = Object.assign({}, job.options || {}, { updateLyrics: true })
  delete nextOptions.preferChords
  job.options = nextOptions
}

/**
 * Prefer chord sheets (lyrics+chords); fall back to plain lyrics in the same job.
 */
async function searchLyricsPreferringChords(job, base, searchOptions) {
  try {
    const chordResult = await searchChords(Object.assign({}, base, {
      renderChords: searchOptions.renderChords || null,
      onProgress: function(message, progress) {
        if (typeof base.onProgress === 'function') {
          base.onProgress(message || 'Searching for chords…', progress)
        }
      },
    }))
    if (chordsResultUsable(chordResult)) {
      adoptJobAsChords(job)
      return chordResult
    }
  } catch (chordError) {
    if (chordError && chordError.name === 'AbortError') throw chordError
  }
  if (typeof base.onProgress === 'function') {
    base.onProgress('Searching for lyrics…', 0.35)
  }
  return searchLyrics(base)
}

async function runSearch(job, signal) {
  const searchOptions = job.searchOptions || {}
  const base = {
    title: job.title,
    artist: job.artist || '',
    accessToken: job.accessToken,
    signal: signal,
    resolverAvailable: searchOptions.resolverAvailable,
    abcTools: searchOptions.abcTools || null,
    onProgress: function(message, progress) {
      if (job.cancelled) return
      job.message = message || ''
      if (typeof progress === 'number' && Number.isFinite(progress)) {
        job.progress = Math.max(0, Math.min(100, Math.round(progress * 100)))
      }
      notify()
      notifyLive(job)
    },
  }

  if (job.kind === 'lyrics') {
    if (job.options && job.options.preferChords) {
      return searchLyricsPreferringChords(job, base, searchOptions)
    }
    return searchLyrics(base)
  }
  if (job.kind === 'chords') {
    return searchChords(Object.assign({}, base, {
      renderChords: searchOptions.renderChords || null,
    }))
  }
  if (job.kind === 'composer') {
    return discoverComposers(Object.assign({}, base, {
      titleHint: job.titleHint || job.title || '',
    }))
  }
  if (job.kind === 'notation') {
    return searchNotation(Object.assign({}, base, {
      songType: (job.options && job.options.songType) || undefined,
      midiFallback: !!(job.options && job.options.midiFallback)
        || !!(searchOptions && searchOptions.midiFallback),
      loadTuneTexts: searchOptions.loadTuneTexts || null,
      searchIndex: searchOptions.searchIndex || null,
    }))
  }
  if (job.kind === 'links') {
    const getTune = queueContext.getTune
    const tune = job.tuneId && typeof getTune === 'function' ? getTune(job.tuneId) : null
    if (tune) {
      base.onProgress('Checking existing links…', 0.1)
      const valid = await existingLinksAreValid(tune, searchOptions, signal)
      if (valid) {
        return { skipped: true, reason: 'existing-link-ok' }
      }
    }
    const query = [job.title, job.artist].filter(Boolean).join(' ').trim()
    base.onProgress('Searching media links…', 0.35)
    return searchMediaLinks({
      query: query,
      title: job.title,
      artist: job.artist || '',
      signal: signal,
      maxResults: 8,
      accessToken: searchOptions && searchOptions.accessToken,
      token: searchOptions && searchOptions.token,
    })
  }
  if (job.kind === 'genre') {
    return searchGenre(Object.assign({}, base, {
      rhythm: (job.options && job.options.rhythm) || '',
      currentGenre: (job.options && job.options.currentGenre) || '',
      backgroundInfo: (job.options && job.options.backgroundInfo) || '',
    }))
  }
  if (job.kind === 'albums') {
    return searchAlbumsForSong(job.title, job.artist || '', Object.assign({}, base, {
      performers: (job.options && job.options.performers) || [],
    }))
  }
  if (job.kind === 'artists') {
    return searchArtists(base)
  }
  if (job.kind === 'aliases') {
    return searchAliases(Object.assign({}, base, {
      existingAliases: (job.options && job.options.existingAliases) || [],
    }))
  }
  throw new Error('Unknown field lookup kind: ' + job.kind)
}

function hasLiveHandler(job) {
  return liveHandlers.has(liveHandlerKey(targetKeyForJob(job), job.kind))
}

function jobSearchMode(job) {
  return job && job.options && job.options.searchMode
    ? String(job.options.searchMode)
    : ''
}

function markAwaiting(job) {
  job.status = 'awaiting'
  job.progress = 100
  job.message = ''
  notifyLive(job)
}

function currentFieldValueForJob(job) {
  const getTune = queueContext.getTune
  if (typeof getTune !== 'function' || !job.tuneId) return null
  const tune = getTune(job.tuneId)
  if (!tune) return null
  if (job.kind === 'composer') return primaryArtist(tune) || ''
  if (job.kind === 'lyrics') {
    const lines = getPlainLyricLines(tune)
    return Array.isArray(lines) && lines.length ? lines.join('\n') : ''
  }
  if (job.kind === 'notation') {
    return tune.abc || (tune.voices && tune.voices['1'] && Array.isArray(tune.voices['1'].notes)
      ? tune.voices['1'].notes.join('\n')
      : '')
  }
  if (job.kind === 'chords') {
    // Prefer chord-ish text in notes / words
    return (tune.abc && String(tune.abc)) || ''
  }
  if (job.kind === 'genre') return allGenres(tune).join(', ')
  if (job.kind === 'albums') return Array.isArray(tune.albums) ? tune.albums.join(', ') : ''
  if (job.kind === 'title') return tune.name || ''
  if (job.kind === 'tempo') return tune.tempo != null ? String(tune.tempo) : ''
  if (job.kind === 'meter') return tune.meter || ''
  if (job.kind === 'key') return tune.key || ''
  if (job.kind === 'artists') return Array.isArray(tune.artists) ? tune.artists : []
  if (job.kind === 'aliases') return Array.isArray(tune.aliases) ? tune.aliases : []
  if (job.kind === 'links') return Array.isArray(tune.links) ? tune.links : []
  return null
}

function tryApplyChordsCandidate(job, candidate) {
  const getTune = queueContext.getTune
  const saveTune = queueContext.saveTune
  const getTunebook = queueContext.getTunebook
  if (typeof getTune !== 'function' || typeof saveTune !== 'function' || !job.tuneId) {
    return false
  }
  if (!candidate) return false
  const tunebook = typeof getTunebook === 'function' ? getTunebook() : null
  if (!tunebook) return false
  const tune = getTune(job.tuneId)
  if (!tune) return false
  const getAbcjsParser = queueContext.getAbcjsParser
  const committed = commitChordSearchResultToTune({
    result: candidate,
    tune: tune,
    tunebook: tunebook,
    abcjsParser: typeof getAbcjsParser === 'function' ? getAbcjsParser() : null,
    updateLyrics: !(job.options && job.options.updateLyrics === false),
    // Match lyrics-editor enhance path: keep chords in the lyrics block.
    skipAbcMerge: true,
    skipSave: true,
    historyLabel: historyLabelForKind('chords'),
  })
  if (!committed || !committed.ok) return false
  try {
    saveTune(tune, false, { historyLabel: historyLabelForKind('chords') })
    if (typeof queueContext.forceRefresh === 'function') {
      queueContext.forceRefresh()
    }
    job.appliedCandidate = candidate
    return true
  } catch (e) {
    return false
  }
}

function tryApplyCandidateKeepSuggestions(job, candidate) {
  if (job && job.kind === 'chords') {
    return tryApplyChordsCandidate(job, candidate)
  }
  const getTune = queueContext.getTune
  const saveTune = queueContext.saveTune
  if (typeof getTune !== 'function' || typeof saveTune !== 'function' || !job.tuneId) {
    return false
  }
  if (!candidate) return false
  const tune = getTune(job.tuneId)
  if (!tune) return false
  const applied = applyCandidateToTune(
    tune,
    job.kind,
    candidate,
    queueContext.abcTools
  )
  if (!applied) return false
  try {
    saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
    if (typeof queueContext.forceRefresh === 'function') {
      queueContext.forceRefresh()
    }
    job.appliedCandidate = candidate
    return true
  } catch (e) {
    return false
  }
}

function tryApplyAllAlbumCandidates(job, candidates) {
  const getTune = queueContext.getTune
  const saveTune = queueContext.saveTune
  if (typeof getTune !== 'function' || typeof saveTune !== 'function' || !job.tuneId) {
    return false
  }
  const tune = getTune(job.tuneId)
  if (!tune || !Array.isArray(candidates) || !candidates.length) return false
  let applied = false
  candidates.forEach(function(candidate) {
    if (applyCandidateToTune(tune, 'albums', candidate, queueContext.abcTools)) {
      applied = true
    }
  })
  if (!applied) return false
  try {
    saveTune(tune, false, { historyLabel: historyLabelForKind('albums') })
    if (typeof queueContext.forceRefresh === 'function') {
      queueContext.forceRefresh()
    }
    job.appliedCandidate = candidates[0]
    return true
  } catch (e) {
    return false
  }
}

/**
 * Settle a completed search:
 * - Persist unique suggestions (including Original Value when field non-empty).
 * - Freeze originalValue at settle time; applying a suggestion must not rewrite it.
 * - Always write searchable candidates to fieldSearchResultCache for caret reopen.
 * - Empty auto-apply kinds: apply first result and finish (done).
 * - Always-pick kinds, or non-empty auto-apply kinds: stay awaiting briefly so
 *   the live handler can open a one-shot picker, then the UI dismisses to done.
 */
const ALWAYS_PICK_KINDS = {
  artists: true,
  aliases: true,
  lyrics: true,
  chords: true,
  notation: true,
}

const CONFIDENCE_AUTO_APPLY_KINDS = {
  albums: true,
  composer: true,
  genre: true,
}

function highConfidenceCandidates(candidates) {
  return (candidates || []).filter(function(candidate) {
    return candidate && candidate.confidence === 'high'
  })
}

function hasLowerConfidenceRemainder(candidates) {
  return (candidates || []).some(function(candidate) {
    return candidate && candidate.confidence && candidate.confidence !== 'high'
  })
}

function settleCompletedJob(job) {
  let candidates = Array.isArray(job.candidates) ? job.candidates.slice() : []
  const currentValue = currentFieldValueForJob(job)
  job.originalValue = currentValue
  const tune = queueContext.getTune && job.tuneId ? queueContext.getTune(job.tuneId) : null
  // Chords+lyrics enhance fills the lyrics field; emptiness follows lyrics when updateLyrics.
  let fieldEmpty = !job.tuneId || isTuneFieldEmptyForKind(tune, job.kind)
  if (job.kind === 'chords' && job.options && job.options.updateLyrics) {
    fieldEmpty = !job.tuneId || isTuneFieldEmptyForKind(tune, 'lyrics')
  }
  if (!fieldEmpty) {
    const currentSuggestion = buildCurrentValueSuggestion(job.kind, currentValue)
    if (currentSuggestion) {
      candidates = [currentSuggestion].concat(nonCurrentCandidates(candidates, {
        kind: job.kind,
        originalValue: currentValue,
      }))
    }
  } else {
    candidates = nonCurrentCandidates(candidates, { kind: job.kind })
  }
  if (job.kind === 'artists') {
    candidates = sortCandidatesByConfidence(candidates)
  }
  candidates = collateUniqueSuggestions(job.kind, candidates)
  job.candidates = candidates

  const searchCandidates = nonCurrentCandidates(candidates, {
    kind: job.kind,
    originalValue: currentValue,
  })

  const cacheKey = targetKeyForFieldSearch(job.tuneId, job.candidateId)
  if (cacheKey && searchCandidates.length) {
    setFieldSearchResults(cacheKey, job.kind, searchCandidates)
  }

  const alwaysPick = !!ALWAYS_PICK_KINDS[job.kind]
    || !!(job.options && job.options.alwaysPick)
  const live = hasLiveHandler(job)

  let applied = false
  let needsReview = false
  if (CONFIDENCE_AUTO_APPLY_KINDS[job.kind] && fieldEmpty && searchCandidates.length > 0 && !alwaysPick) {
    const highs = highConfidenceCandidates(searchCandidates)
    if (job.kind === 'albums' && highs.length) {
      applied = tryApplyAllAlbumCandidates(job, highs)
    } else if ((job.kind === 'composer' || job.kind === 'genre') && highs.length === 1) {
      applied = tryApplyCandidateKeepSuggestions(job, highs[0])
    }
    needsReview = highs.length > 1 || hasLowerConfidenceRemainder(searchCandidates)
  } else if (fieldEmpty && searchCandidates.length && (!alwaysPick || !live)) {
    // Empty field: auto-apply when no live picker will handle it (e.g. Enhance).
    applied = tryApplyCandidateKeepSuggestions(job, searchCandidates[0])
  }

  // Empty + auto-applied (or nothing to pick): finish. Cache keeps alternatives.
  const finishWithoutDialog = searchCandidates.length === 0
    || (fieldEmpty && applied && !needsReview && (!alwaysPick || !live))

  if (finishWithoutDialog) {
    job.status = 'done'
    job.progress = 100
    job.message = ''
    // Notify while candidates are still present so live handlers (e.g. composer →
    // artists picker) can split writers/performers. Then clear for storage.
    if (!live) {
      toastFieldSearchFinished(job.kind, {
        count: applied ? 1 : 0,
        applied: applied,
      })
    }
    notifyLive(job)
    job.candidates = []
    return
  }

  markAwaiting(job)
  if (!live) {
    toastFieldSearchFinished(job.kind, {
      count: candidates.length,
      applied: applied,
    })
  }
}

/**
 * Update the frozen Original Value for an awaiting job after a manual field edit.
 * Does not change Original Value when a search suggestion is applied.
 */
export function updateFieldLookupOriginalValue(tuneId, kind, value) {
  if (!tuneId || !kind) return false
  const job = getAwaitingJob('tune:' + String(tuneId), kind)
  if (!job) return false
  job.originalValue = value
  const rest = nonCurrentCandidates(job.candidates, {
    kind: kind,
    originalValue: value,
  })
  const original = buildCurrentValueSuggestion(kind, value)
  job.candidates = collateUniqueSuggestions(
    kind,
    original ? [original].concat(rest) : rest
  )
  notify()
  schedulePersist()
  return true
}

async function runJob(job) {
  if (job.cancelled || job.status === 'awaiting') return

  job.status = 'running'
  job.progress = 0
  job.message = 'Starting search...'
  job.error = null
  currentJobId = job.id
  notify()
  schedulePersist()
  notifyLive(job)

  const controller = new AbortController()
  job.abortController = controller

  try {
    const result = await runSearch(job, controller.signal)
    if (job.cancelled) {
      job.status = 'cancelled'
      return
    }
    if (result && result.skipped) {
      job.status = 'done'
      job.progress = 100
      job.message = result.reason === 'existing-link-ok'
        ? 'Existing link is valid'
        : ''
      job.error = null
      job.candidates = []
      job.manualCandidates = []
      return
    }
    const normalized = normalizeCandidatesFromResult(job.kind, result, {
      currentComposer: job.artist,
      alwaysPick: !!(job.options && job.options.alwaysPick)
        || jobSearchMode(job) === 'review'
        || job.kind === 'links',
    })

    if (normalized.manualCandidates.length > 0 && normalized.candidates.length === 0) {
      job.manualCandidates = normalized.manualCandidates
      job.musescorePaywalled = normalized.musescorePaywalled === true
      job.candidates = []
      job.status = 'awaiting'
      job.progress = 100
      job.message = ''
      notifyLive(job)
      return
    }

    if (normalized.musescorePaywalled && normalized.candidates.length === 0) {
      job.manualCandidates = []
      job.musescorePaywalled = true
      job.candidates = []
      job.status = 'done'
      job.progress = 100
      job.message = 'MuseScore matches require PRO or purchase; try ABC or MusicXML sources instead.'
      job.error = null
      job.notifyEmpty = true
      if (!hasLiveHandler(job)) {
        toastFieldSearchFinished(job.kind, { count: 0, applied: false })
      }
      notifyLive(job)
      return
    }

    if (normalized.empty || normalized.candidates.length === 0) {
      job.status = 'done'
      job.error = null
      job.candidates = []
      job.progress = 100
      job.message = ''
      job.notifyEmpty = true
      if (!hasLiveHandler(job)) {
        toastFieldSearchFinished(job.kind, { count: 0, applied: false })
      }
      notifyLive(job)
      return
    }

    job.candidates = normalized.candidates
    job.manualCandidates = []
    job.suggestedTitle = result && result.suggestedTitle
      ? String(result.suggestedTitle).trim()
      : ''
    // Link suggestions always go to review / choose UI.
    if (job.kind === 'links') {
      job.options = Object.assign({}, job.options || {}, { alwaysPick: true })
    }
    settleCompletedJob(job)
  } catch (e) {
    if (job.cancelled || isAbortError(e)) {
      job.status = 'cancelled'
      job.error = null
    } else {
      job.status = 'error'
      job.error = e && e.message ? e.message : (kindLabel(job.kind) + ' failed')
      notifyLive(job)
      if (!hasLiveHandler(job)) {
        toast.error(job.error, {
          toastId: 'field-lookup-error-' + job.id,
          autoClose: 8000,
        })
      }
    }
  } finally {
    job.abortController = null
    if (currentJobId === job.id) currentJobId = null
    notify()
    schedulePersist()
  }
}

let processQueueRunning = false
const runningJobIds = new Set()

function canStartJob(job) {
  if (!job || job.status !== 'pending' || job.cancelled) return false
  // Prefer chords before lyrics for the same target so lyricLines can be reused.
  if (job.kind === 'lyrics') {
    const targetKey = targetKeyForJob(job)
    const chordsBlocking = jobs.some(function(other) {
      return other.id !== job.id
        && targetKeyForJob(other) === targetKey
        && other.kind === 'chords'
        && (other.status === 'pending' || other.status === 'running')
    })
    if (chordsBlocking) return false
  }
  return true
}

async function processQueue() {
  if (processQueueRunning || paused) return
  if (isNavigatorOffline()) return
  processQueueRunning = true
  try {
    while (running && !paused) {
      const availableSlots = MAX_CONCURRENT_JOBS - runningJobIds.size
      if (availableSlots <= 0) {
        await new Promise(function(resolve) { setTimeout(resolve, 40) })
        continue
      }
      const batch = []
      jobs.forEach(function(job) {
        if (batch.length >= availableSlots) return
        if (!canStartJob(job)) return
        if (runningJobIds.has(job.id)) return
        batch.push(job)
      })
      if (batch.length === 0) {
        if (runningJobIds.size === 0) {
          running = false
          break
        }
        await new Promise(function(resolve) { setTimeout(resolve, 40) })
        continue
      }
      await Promise.all(batch.map(async function(job) {
        runningJobIds.add(job.id)
        try {
          await runJob(job)
        } finally {
          runningJobIds.delete(job.id)
        }
      }))
    }
  } finally {
    processQueueRunning = false
    notify()
    schedulePersist()
  }
}

export function __resetForTests() {
  jobCounter = 0
  running = false
  paused = false
  jobs = []
  currentJobId = null
  persistTimer = null
  restored = false
  liveHandlers.clear()
  listeners.clear()
  runningJobIds.clear()
  fieldLookupResolvedHandler = null
  queueContext = {
    getTune: null,
    saveTune: null,
    forceRefresh: null,
    abcTools: null,
    getTunebook: null,
    getAbcjsParser: null,
  }
}

export function __loadSavedStateForTests(saved) {
  jobCounter = typeof saved.jobCounter === 'number' ? saved.jobCounter : 0
  running = false
  paused = !!saved.paused
  jobs = (saved.jobs || []).map(function(item) {
    return {
      id: item.id,
      tuneId: item.tuneId || null,
      candidateId: item.candidateId || null,
      kind: item.kind,
      label: item.label || kindLabel(item.kind),
      title: item.title || '',
      artist: item.artist || '',
      tuneName: item.tuneName || '',
      titleHint: item.titleHint || '',
      status: item.status === 'running' ? 'pending' : (item.status || 'pending'),
      progress: typeof item.progress === 'number' ? item.progress : 0,
      message: item.message || '',
      error: item.error || null,
      candidates: Array.isArray(item.candidates) ? item.candidates : [],
      manualCandidates: Array.isArray(item.manualCandidates) ? item.manualCandidates : [],
      options: item.options || {},
      searchOptions: {},
      accessToken: item.accessToken || null,
      cancelled: !!item.cancelled,
      origin: item.origin || null,
    }
  })
  notify()
}

registerOnlineResume(start)
