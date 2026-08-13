/**
 * Browser console hook for chord-readiness audit, tagging, and safe auto-fix.
 *
 * Usage (dev or ?chordMigration=1):
 *   const r = await abcbookChordMigration.audit({ book: 'songs' })
 *   await abcbookChordMigration.tagOnly({ book: 'songs' })
 *   await abcbookChordMigration.apply({ dryRun: true, book: 'songs', limit: 10 })
 *
 * apply/tagOnly process tunes in small async batches (default limit 25) so the tab
 * does not freeze or crash on large books. Use limit: 0 only when you mean all tunes.
 */
import {
  auditTunesChordReadiness,
  applyChordReadinessFixes,
  applyChordReadinessTags,
  classifyChordReadiness,
  hasCurrentChordReadinessTags,
  CHORD_READINESS_ATTENTION_TAGS,
  summarizeChordReadinessReport,
} from './tuneChordReadinessAudit'
import {
  buildWorkSessionKey,
  getWorkSession,
  setWorkSessionPendingIds,
  consumeWorkSessionBatch,
  pruneWorkSessionIds,
} from './chordReadinessWorkSession'

const DEFAULT_BATCH_LIMIT = 25

function tunesFromBook(tunesById, book) {
  const source = tunesById && typeof tunesById === 'object' ? tunesById : {}
  const list = Array.isArray(source)
    ? source.filter(Boolean)
    : Object.keys(source).map(function(id) { return source[id] }).filter(Boolean)
  if (!book) return list
  return list.filter(function(tune) {
    const books = Array.isArray(tune.books) ? tune.books : []
    return books.some(function(entry) {
      return String(entry || '').trim().toLowerCase() === String(book).trim().toLowerCase()
    })
  })
}

function buildDeps(tunebook, extra, getAbcjsParser) {
  const deps = Object.assign({}, extra || {})
  if (tunebook) {
    if (!deps.abcTools && tunebook.abcTools) deps.abcTools = tunebook.abcTools
    if (!deps.hasChords && tunebook.hasNotesOrChords) {
      deps.hasChords = function(abcText) {
        return tunebook.hasNotesOrChords({ voices: { '1': { notes: String(abcText || '').split('\n') } } })
      }
    }
  }
  if (!deps.abcjsParser && typeof getAbcjsParser === 'function') {
    deps.abcjsParser = getAbcjsParser()
  }
  return deps
}

function resolveBatchLimit(options, candidateCount) {
  if (options && options.all === true) return candidateCount
  if (options && options.limit != null) {
    const limit = Number(options.limit)
    if (limit === 0) return candidateCount
    if (limit > 0) return Math.min(limit, candidateCount)
  }
  return Math.min(DEFAULT_BATCH_LIMIT, candidateCount)
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

function jobWasCancelled(options) {
  return typeof options.isCancelled === 'function' && options.isCancelled()
}

function reportProgress(options, payload) {
  if (typeof options.onProgress === 'function') {
    options.onProgress(payload)
  } else if (payload.done === 1 || payload.done === payload.total || payload.done % 5 === 0) {
    console.log('[chordMigration]', payload.done + '/' + payload.total, payload.tuneName || '')
  }
}

function classificationPassesFilters(classification, options) {
  if (classification.status === 'skipped' || classification.status === 'instrumental') {
    return false
  }
  const statuses = Array.isArray(options.statuses) ? options.statuses : null
  if (statuses && statuses.indexOf(classification.status) < 0) {
    return false
  }
  const tagFilter = Array.isArray(options.tags) ? options.tags : null
  if (tagFilter && !classification.tags.some(function(tag) { return tagFilter.indexOf(tag) >= 0 })) {
    return false
  }
  return true
}

function classifyTuneForMigration(tune, options, deps) {
  return classifyChordReadiness(tune, Object.assign({}, deps, {
    book: options.book || null,
  }))
}

const SCAN_YIELD_EVERY = 10

async function buildFullPendingQueue(tunes, options, deps, scanOpts) {
  const opts = scanOpts || {}
  const list = Array.isArray(tunes) ? tunes : []
  const pendingIds = []
  const yieldMs = options.yieldMs != null ? options.yieldMs : 0
  const mode = opts.mode
  const fixTypes = opts.fixTypes

  for (let index = 0; index < list.length; index += 1) {
    if (jobWasCancelled(options)) break
    const tune = list[index]
    const classification = classifyTuneForMigration(tune, options, deps)
    let isPending = false

    if (classificationPassesFilters(classification, options)) {
      if (mode === 'tagOnly') {
        if (!hasCurrentChordReadinessTags(tune, classification)) {
          isPending = true
        }
      } else if (mode === 'apply') {
        const fixes = fixTypes || classification.suggestedFixes
        if (fixes && fixes.length) {
          isPending = true
        }
      }
    }

    if (isPending) {
      pendingIds.push(tune.id)
    }

    const shouldReport = index % SCAN_YIELD_EVERY === SCAN_YIELD_EVERY - 1 || index === list.length - 1
    if (shouldReport) {
      reportProgress(options, {
        phase: 'scan',
        done: index + 1,
        total: list.length,
        tuneId: tune && tune.id,
        tuneName: tune && tune.name,
        pending: pendingIds.length,
      })
    }
    if (shouldReport && index < list.length - 1) {
      await delay(yieldMs)
    }
  }

  return pendingIds
}

function resolveTunesById(tunes, getTunesFn, tuneIds) {
  const tuneById = Object.create(null)
  const list = Array.isArray(tunes) ? tunes : []
  list.forEach(function(tune) {
    if (tune && tune.id) tuneById[tune.id] = tune
  })
  const allTunes = typeof getTunesFn === 'function' ? getTunesFn() : {}
  ;(tuneIds || []).forEach(function(id) {
    if (!tuneById[id] && allTunes[id]) tuneById[id] = allTunes[id]
  })
  return tuneById
}

async function prepareWorkBatch(tunes, options, deps, mode, fixTypes, getTunesFn) {
  const sessionKey = buildWorkSessionKey(options, mode)
  const session = getWorkSession(sessionKey)

  if (session.pendingIds.length === 0) {
    const pendingIds = await buildFullPendingQueue(tunes, options, deps, {
      mode: mode,
      fixTypes: fixTypes,
    })
    setWorkSessionPendingIds(sessionKey, pendingIds)
  }

  const active = getWorkSession(sessionKey)
  const batchLimit = resolveBatchLimit(options, active.pendingIds.length)
  const consumed = consumeWorkSessionBatch(sessionKey, batchLimit, !options.dryRun)
  const tuneById = resolveTunesById(tunes, getTunesFn, consumed.batchIds)
  const missingIds = consumed.batchIds.filter(function(id) { return !tuneById[id] })
  if (missingIds.length && !options.dryRun) {
    pruneWorkSessionIds(sessionKey, missingIds)
  }
  const batch = consumed.batchIds.map(function(id) { return tuneById[id] }).filter(Boolean)
  const classificationById = new Map()
  const fixesById = mode === 'apply' ? new Map() : null

  batch.forEach(function(tune) {
    const classification = classifyTuneForMigration(tune, options, deps)
    classificationById.set(tune.id, classification)
    if (fixesById) {
      fixesById.set(tune.id, fixTypes || classification.suggestedFixes)
    }
  })

  const remaining = options.dryRun
    ? consumed.remaining
    : getWorkSession(sessionKey).pendingIds.length

  return {
    batch: batch,
    remaining: remaining,
    totalPending: consumed.totalPending,
    classificationById: classificationById,
    fixesById: fixesById,
  }
}

async function runTunesInBatches(tunes, options, worker) {
  const list = Array.isArray(tunes) ? tunes : []
  const limit = resolveBatchLimit(options, list.length)
  const batch = list.slice(0, limit)
  const results = []
  const yieldMs = options.yieldMs != null ? options.yieldMs : 0

  for (let index = 0; index < batch.length; index += 1) {
    if (jobWasCancelled(options)) break
    const tune = batch[index]
    results.push(await worker(tune, index, batch.length))
    reportProgress(options, {
      phase: 'process',
      done: index + 1,
      total: batch.length,
      tuneId: tune && tune.id,
      tuneName: tune && tune.name,
    })
    if (yieldMs >= 0 && index < batch.length - 1) {
      await delay(yieldMs)
    }
  }

  return {
    results: results,
    processed: batch.length,
    remaining: Math.max(0, list.length - batch.length),
    totalCandidates: list.length,
  }
}

export function createChordMigrationConsole(context) {
  const ctx = context || {}
  const getAbcjsParser = typeof ctx.getAbcjsParser === 'function' ? ctx.getAbcjsParser : null

  function getTunes(opts) {
    const options = opts || {}
    if (typeof ctx.getTunes === 'function') {
      return tunesFromBook(ctx.getTunes(), options.book)
    }
    return []
  }

  function getAllTunes() {
    return typeof ctx.getTunes === 'function' ? ctx.getTunes() : {}
  }

  function getTunebook() {
    if (typeof ctx.getTunebook === 'function') {
      const fromGetter = ctx.getTunebook()
      if (fromGetter) return fromGetter
    }
    if (ctx.tunebook) return ctx.tunebook
    return null
  }

  return {
    audit: function(opts) {
      const options = opts || {}
      const tunebook = getTunebook()
      const deps = buildDeps(tunebook, options, getAbcjsParser)
      const tunes = getTunes(options)
      const report = auditTunesChordReadiness(tunes, Object.assign({}, deps, {
        book: options.book || null,
      }))
      return Promise.resolve(report)
    },

    auditAsync: async function(opts) {
      const options = opts || {}
      const tunebook = getTunebook()
      const deps = buildDeps(tunebook, options, getAbcjsParser)
      const tunes = getTunes(options)
      const list = Array.isArray(tunes) ? tunes : []
      const yieldMs = options.yieldMs != null ? options.yieldMs : 0
      const results = []
      const byStatus = Object.create(null)
      const byStrainBucket = Object.create(null)
      const byTag = Object.create(null)

      for (let index = 0; index < list.length; index += 1) {
        if (jobWasCancelled(options)) break
        const tune = list[index]
        const row = classifyChordReadiness(tune, Object.assign({}, deps, {
          book: options.book || null,
        }))
        if (row.status === 'skipped' && row.details && row.details.skippedReason === 'book_filter') {
          // skip book filter rows like sync audit
        } else {
          results.push(row)
          if (!byStatus[row.status]) byStatus[row.status] = 0
          byStatus[row.status] += 1
          if (row.strainBucket) {
            if (!byStrainBucket[row.strainBucket]) byStrainBucket[row.strainBucket] = 0
            byStrainBucket[row.strainBucket] += 1
          }
          ;(row.tags || []).forEach(function(tag) {
            if (!byTag[tag]) byTag[tag] = 0
            byTag[tag] += 1
          })
        }
        reportProgress(options, {
          done: index + 1,
          total: list.length,
          tuneId: tune && tune.id,
          tuneName: tune && tune.name,
        })
        if (yieldMs >= 0 && index < list.length - 1) {
          await delay(yieldMs)
        }
      }

      return {
        results: results,
        summary: summarizeChordReadinessReport(results, byStatus, byStrainBucket, byTag),
      }
    },

    tagOnly: async function(opts) {
      const options = opts || {}
      const tunebook = getTunebook()
      if (!tunebook || typeof tunebook.saveTune !== 'function') {
        throw new Error('tunebook.saveTune is not available')
      }
      const deps = buildDeps(tunebook, options, getAbcjsParser)
      const tunes = getTunes(options)
      const prepared = await prepareWorkBatch(tunes, options, deps, 'tagOnly', null, getAllTunes)
      let tagged = 0
      const skipped = Math.max(0, (Array.isArray(tunes) ? tunes.length : 0) - prepared.totalPending)

      if (!options.dryRun && typeof tunebook.beginTunesBatchCommit === 'function') {
        tunebook.beginTunesBatchCommit()
      }

      const batchResult = await runTunesInBatches(prepared.batch, options, async function(tune) {
        const classification = prepared.classificationById.get(tune.id)
          || classifyTuneForMigration(tune, options, deps)
        if (options.dryRun) {
          tagged += 1
          return { tuneId: tune.id, dryRun: true }
        }
        const next = applyChordReadinessTags(tune, classification, {
          removeOldTags: options.removeOldTags !== false,
        })
        tunebook.saveTune(next, false, {
          historyLabel: 'Chord readiness tags',
          deferCommit: true,
        })
        tagged += 1
        return { tuneId: tune.id, tagged: true }
      })

      if (!options.dryRun && tagged > 0 && typeof tunebook.commitTunesBatch === 'function') {
        tunebook.commitTunesBatch()
      }

      return {
        tagged: tagged,
        skipped: skipped,
        dryRun: !!options.dryRun,
        processed: batchResult.processed,
        remaining: prepared.remaining,
        totalCandidates: prepared.totalPending,
        limit: resolveBatchLimit(options, prepared.totalPending),
      }
    },

    apply: async function(opts) {
      const options = opts || {}
      const tunebook = getTunebook()
      if (!tunebook || typeof tunebook.saveTune !== 'function') {
        throw new Error('tunebook.saveTune is not available')
      }
      const deps = buildDeps(tunebook, options, getAbcjsParser)
      const tunes = getTunes(options)
      const fixTypes = Array.isArray(options.fixes) ? options.fixes : null
      const prepared = await prepareWorkBatch(tunes, options, deps, 'apply', fixTypes, getAllTunes)
      const results = []
      let saved = 0
      const skipped = Math.max(0, (Array.isArray(tunes) ? tunes.length : 0) - prepared.totalPending)

      if (!options.dryRun && typeof tunebook.beginTunesBatchCommit === 'function') {
        tunebook.beginTunesBatchCommit()
      }

      const batchResult = await runTunesInBatches(prepared.batch, options, async function(tune) {
        const classification = prepared.classificationById.get(tune.id)
          || classifyTuneForMigration(tune, options, deps)
        const fixes = (prepared.fixesById && prepared.fixesById.get(tune.id))
          || fixTypes
          || classification.suggestedFixes
        if (!fixes || !fixes.length) {
          const row = { tuneId: tune.id, tuneName: tune.name, skipped: true, reason: 'no_fixes' }
          results.push(row)
          return row
        }

        const fixResult = applyChordReadinessFixes(tune, classification, Object.assign({}, deps, {
          dryRun: !!options.dryRun,
          fixes: fixes,
          includeMelody: !!options.includeMelody,
        }))

        let next = fixResult.tune
        if (!options.dryRun && (fixResult.applied.length > 0 || options.alwaysTag)) {
          const reclassified = classifyTuneForMigration(next, options, deps)
          next = applyChordReadinessTags(next, reclassified, { removeOldTags: true })
          tunebook.saveTune(next, false, {
            historyLabel: 'Chord readiness fix',
            deferCommit: true,
          })
          saved += 1
        }

        const row = {
          tuneId: tune.id,
          tuneName: tune.name,
          applied: fixResult.applied,
          skippedFixes: fixResult.skipped,
          dryRun: !!options.dryRun,
        }
        results.push(row)
        return row
      })

      if (!options.dryRun && saved > 0 && typeof tunebook.commitTunesBatch === 'function') {
        tunebook.commitTunesBatch()
      }

      return {
        results: results,
        dryRun: !!options.dryRun,
        saved: saved,
        skipped: skipped,
        processed: batchResult.processed,
        remaining: prepared.remaining,
        totalCandidates: prepared.totalPending,
        limit: resolveBatchLimit(options, prepared.totalPending),
      }
    },

    attentionTags: CHORD_READINESS_ATTENTION_TAGS,
    defaultBatchLimit: DEFAULT_BATCH_LIMIT,
  }
}

export const CHORD_MIGRATION_STORAGE_KEY = 'abcbookChordMigration'

export function shouldExposeChordMigrationConsole() {
  if (typeof window === 'undefined') return false
  if (process.env.NODE_ENV !== 'production') return true
  try {
    if (window.localStorage && window.localStorage.getItem(CHORD_MIGRATION_STORAGE_KEY) === '1') {
      return true
    }
    return /(?:^|[?&])chordMigration=1(?:&|$)/.test(window.location.search || '')
  } catch (e) {
    return false
  }
}

export function isChordMigrationConsoleFlagSet() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage && window.localStorage.getItem(CHORD_MIGRATION_STORAGE_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function setChordMigrationConsoleEnabled(enabled) {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage.setItem(CHORD_MIGRATION_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(CHORD_MIGRATION_STORAGE_KEY)
    }
  } catch (e) {}
  window.location.reload()
}

function installEnableHelper() {
  if (typeof window === 'undefined') return
  window.enableAbcbookChordMigration = function() {
    try {
      window.localStorage.setItem(CHORD_MIGRATION_STORAGE_KEY, '1')
    } catch (e) {}
    window.location.reload()
  }
}

function disabledChordMigrationApi() {
  return {
    enabled: false,
    enable: function() {
      if (typeof window !== 'undefined' && typeof window.enableAbcbookChordMigration === 'function') {
        window.enableAbcbookChordMigration()
      }
    },
    audit: function() {
      return Promise.reject(new Error(
        'abcbookChordMigration is disabled. Run enableAbcbookChordMigration() in the console, or open the app with ?chordMigration=1 and reload.'
      ))
    },
    auditAsync: function() {
      return disabledChordMigrationApi().audit()
    },
    tagOnly: function() {
      return disabledChordMigrationApi().audit()
    },
    apply: function() {
      return disabledChordMigrationApi().audit()
    },
    attentionTags: CHORD_READINESS_ATTENTION_TAGS,
    defaultBatchLimit: DEFAULT_BATCH_LIMIT,
  }
}

export function installChordMigrationConsole(context) {
  installEnableHelper()
  if (typeof window === 'undefined') return null

  if (!shouldExposeChordMigrationConsole()) {
    window.abcbookChordMigration = disabledChordMigrationApi()
    return null
  }

  const api = createChordMigrationConsole(context)
  api.enabled = true
  api.enable = function() { return api }
  window.abcbookChordMigration = api
  return api
}
