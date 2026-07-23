import { useCallback, useEffect, useRef, useState } from 'react'
import { buildTuneCheckReport } from './tuneBulkCheckReport'
import { yieldToMain } from './tuneDuplicateScan'

const BATCH_SIZE = 8
const reportCache = new Map()

function tuneCacheKey(tune, options) {
  if (!tune || !tune.id) return ''
  const abcTools = options && options.abcTools
  const hash = abcTools && typeof abcTools.getTuneImportHash === 'function'
    ? abcTools.getTuneImportHash(tune)
    : ''
  const linkCtx = options && options.linkContext
  let linkSuffix = ''
  if (linkCtx) {
    const failures = (linkCtx.failures || []).filter(function(item) { return item.tuneId === tune.id })
    const warnings = (linkCtx.warnings || []).filter(function(item) { return item.tuneId === tune.id })
    const failureKey = failures.map(function(item) { return item.linkIndex + ':' + (item.error || '') }).join(';')
    const warningKey = warnings.map(function(item) {
      const missing = Array.isArray(item.missing) ? item.missing.join(',') : ''
      return item.linkIndex + ':' + missing
    }).join(';')
    linkSuffix = ':links:' + (linkCtx.linksChecked ? '1' : '0') + ':' + failureKey + ':' + warningKey
  }
  return tune.id + ':' + hash + ':' + (tune.lastUpdated || '') + linkSuffix
}

function dedupeReportsByTuneId(reports) {
  const seen = new Set()
  const deduped = []
  reports.forEach(function(report) {
    if (!report || report.tuneId == null) return
    if (seen.has(report.tuneId)) return
    seen.add(report.tuneId)
    deduped.push(report)
  })
  return deduped
}

function sortReports(reports) {
  const SEVERITY_ORDER = { red: 0, orange: 1, blue: 2, green: 3 }
  return reports.slice().sort(function(a, b) {
    const severityDiff = (SEVERITY_ORDER[a.severity] || 0) - (SEVERITY_ORDER[b.severity] || 0)
    if (severityDiff !== 0) return severityDiff
    return a.tuneName.localeCompare(b.tuneName)
  })
}

function buildReportForTune(tune, checkOptions, options) {
  if (!tune || !tune.id) return null
  const opts = options || {}
  const cacheKey = tuneCacheKey(tune, checkOptions)
  if (!opts.bypassCache) {
    const cached = cacheKey ? reportCache.get(cacheKey) : null
    if (cached) return cached
  }
  const report = buildTuneCheckReport(tune, Object.assign({}, checkOptions, { skipRenderAbc: true }))
  if (cacheKey && report) reportCache.set(cacheKey, report)
  return report
}

export function invalidateTuneReportCache(tuneId) {
  if (tuneId == null) return
  const prefix = String(tuneId) + ':'
  reportCache.forEach(function(_value, key) {
    if (key.indexOf(prefix) === 0) reportCache.delete(key)
  })
}

export default function useBulkCheckReports(selectedTunes, checkOptions, enabled, refreshKey) {
  const [reports, setReports] = useState([])
  const [running, setRunning] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const runIdRef = useRef(0)
  const reportsRef = useRef(reports)

  useEffect(function() {
    reportsRef.current = reports
  }, [reports])

  const refreshTuneReport = useCallback(function(tune) {
    if (!tune || !tune.id) return
    invalidateTuneReportCache(tune.id)
    const report = buildReportForTune(tune, checkOptions, { bypassCache: true })
    if (!report) return
    setReports(function(prev) {
      const next = prev.slice()
      const index = next.findIndex(function(item) { return item.tuneId === report.tuneId })
      if (index >= 0) next[index] = report
      else next.push(report)
      return sortReports(next)
    })
  }, [checkOptions])

  useEffect(function() {
    if (!enabled || !Array.isArray(selectedTunes) || selectedTunes.length === 0) {
      setReports([])
      setRunning(false)
      setProgressPercent(0)
      setProgressMessage('')
      return undefined
    }

    const runId = runIdRef.current + 1
    runIdRef.current = runId
    let cancelled = false

    async function run() {
      const showIncrementalProgress = reportsRef.current.length === 0
      setRunning(true)
      setProgressPercent(0)
      setProgressMessage('Analyzing tunes...')
      const built = []
      const total = selectedTunes.length
      const seenTuneIds = new Set()

      for (let start = 0; start < total; start += BATCH_SIZE) {
        if (cancelled || runIdRef.current !== runId) return
        const end = Math.min(start + BATCH_SIZE, total)
        for (let i = start; i < end; i += 1) {
          const tune = selectedTunes[i]
          if (!tune || tune.id == null || seenTuneIds.has(tune.id)) continue
          seenTuneIds.add(tune.id)
          const report = buildReportForTune(tune, checkOptions)
          if (report) built.push(report)
        }
        if (showIncrementalProgress) {
          setReports(sortReports(built))
        }
        setProgressPercent(Math.round((end / total) * 100))
        setProgressMessage('Analyzed ' + end + ' of ' + total + ' tunes')
        if (end < total) {
          await yieldToMain()
        }
      }

      if (!cancelled && runIdRef.current === runId) {
        setReports(sortReports(built))
        setRunning(false)
        setProgressPercent(100)
        setProgressMessage('Analysis complete')
      }
    }

    run()

    return function() {
      cancelled = true
    }
  }, [selectedTunes, checkOptions, enabled, refreshKey])

  return {
    reports: dedupeReportsByTuneId(reports),
    running: running,
    progressPercent: progressPercent,
    progressMessage: progressMessage,
    refreshTuneReport: refreshTuneReport,
  }
}

export function clearBulkCheckReportCache() {
  reportCache.clear()
}
