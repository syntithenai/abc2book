/**
 * Save an Add draft, then enqueue OCR or media analysis and close Add chrome.
 */
import { toast } from 'react-toastify'
import {
  removeAddDraftFromSession,
} from './importReviewSession'
import {
  clearImportReviewSession,
  getImportReviewSession,
  hideImportReviewUi,
  setImportReviewSession,
} from './importReviewSessionStore'
import { clearImportReviewEnrichmentBridge } from './importReviewEnrichmentBridge'
import { enqueueFileOcrJob } from './fileOcrJobs'
import { requestTuneMediaAnalysis } from './useTuneMediaAnalysis'
import { getTuneFiles } from './tuneFiles'
import {
  subscribeMediaAnalysisJobs,
  getMediaAnalysisJob,
} from './mediaAnalysisJobs'

const pendingMediaReadyTuneIds = new Set()
let mediaReadyUnsub = null

function activeFileMeta(tune) {
  if (!tune) return null
  const files = getTuneFiles(tune)
  const activeId = tune.activeFile
  if (activeId) {
    const match = files.find(function(f) { return f && f.id === activeId })
    if (match) return match
  }
  return files.length ? files[files.length - 1] : null
}

export function closeAddChromeAfterQueue(updateSession, navigate) {
  const current = getImportReviewSession()
  const next = removeAddDraftFromSession(current)
  hideImportReviewUi()
  if (next) {
    if (typeof updateSession === 'function') updateSession(next)
    else setImportReviewSession(next)
  } else {
    clearImportReviewEnrichmentBridge()
    clearImportReviewSession()
  }
  if (typeof navigate === 'function') navigate('/tunes')
}

function ensureMediaReadyWatcher(navigate) {
  if (mediaReadyUnsub) return
  mediaReadyUnsub = subscribeMediaAnalysisJobs(function() {
    const doneIds = []
    pendingMediaReadyTuneIds.forEach(function(tuneId) {
      const job = getMediaAnalysisJob(tuneId)
      if (!job || job.isAnalyzing) return
      doneIds.push(tuneId)
      if (job.error) {
        toast.error(job.error || 'Media analysis failed')
        return
      }
      toast.success(
        'Media analysis ready',
        {
          autoClose: 8000,
          onClick: function() {
            if (typeof navigate === 'function') {
              navigate('/tunes/' + encodeURIComponent(tuneId))
            }
          },
        }
      )
    })
    doneIds.forEach(function(id) { pendingMediaReadyTuneIds.delete(id) })
    if (pendingMediaReadyTuneIds.size === 0 && mediaReadyUnsub) {
      mediaReadyUnsub()
      mediaReadyUnsub = null
    }
  })
}

/**
 * Persist draft, enqueue OCR, close Add, toast queued.
 * @returns {Promise<{ tune: object, job: object }>}
 */
export async function queueOcrFromAddDraft(options) {
  const opts = options || {}
  const tune = opts.tune
  const tunebook = opts.tunebook
  if (!tune || !tune.id || !tunebook || typeof tunebook.saveTune !== 'function') {
    throw new Error('Missing tune for OCR')
  }
  const meta = opts.meta || activeFileMeta(tune)
  if (!meta || !meta.id) throw new Error('Missing file for OCR')

  const saved = tunebook.saveTune(tune) || tune
  const job = enqueueFileOcrJob({
    tune: saved,
    meta: meta,
    token: opts.token,
    accessToken: opts.token && opts.token.access_token ? opts.token.access_token : opts.token,
    driveApi: opts.driveApi,
  })
  closeAddChromeAfterQueue(opts.updateSession, opts.navigate)
  toast.info('OCR queued — we will notify you when it is ready')
  return { tune: saved, job: job }
}

/**
 * Persist draft, enqueue media analysis, close Add, toast queued + ready later.
 */
export async function queueMediaAnalysisFromAddDraft(options) {
  const opts = options || {}
  const tune = opts.tune
  const tunebook = opts.tunebook
  const analysisDeps = opts.analysisDeps
  if (!tune || !tune.id || !tunebook || typeof tunebook.saveTune !== 'function') {
    throw new Error('Missing tune for analysis')
  }
  if (!analysisDeps) throw new Error('Missing analysis deps')

  const saved = tunebook.saveTune(tune) || tune
  pendingMediaReadyTuneIds.add(String(saved.id))
  ensureMediaReadyWatcher(opts.navigate)

  const started = requestTuneMediaAnalysis(analysisDeps, saved.id, { tune: saved, force: true })
  closeAddChromeAfterQueue(opts.updateSession, opts.navigate)
  toast.info('Analysis queued — we will notify you when it is ready')

  Promise.resolve(started).catch(function(err) {
    pendingMediaReadyTuneIds.delete(String(saved.id))
    toast.error((err && err.message) || 'Could not start media analysis')
  })

  return { tune: saved }
}

export function __resetAttachAnalyzePendingForTests() {
  pendingMediaReadyTuneIds.clear()
  if (mediaReadyUnsub) {
    mediaReadyUnsub()
    mediaReadyUnsub = null
  }
}
