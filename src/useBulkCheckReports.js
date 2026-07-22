import { useEffect, useRef, useState } from 'react'
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
  return tune.id + ':' + hash + ':' + (tune.lastUpdated || '')
}

function sortReports(reports) {
  const SEVERITY_ORDER = { red: 0, orange: 1, blue: 2, green: 3 }
  return reports.slice().sort(function(a, b) {
    const severityDiff = (SEVERITY_ORDER[a.severity] || 0) - (SEVERITY_ORDER[b.severity] || 0)
    if (severityDiff !== 0) return severityDiff
    return a.tuneName.localeCompare(b.tuneName)
  })
}

export default function useBulkCheckReports(selectedTunes, checkOptions, enabled, refreshKey) {
  const [reports, setReports] = useState([])
  const [running, setRunning] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const runIdRef = useRef(0)

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
      setRunning(true)
      setProgressPercent(0)
      setProgressMessage('Analyzing tunes...')
      const built = []
      const total = selectedTunes.length

      for (let start = 0; start < total; start += BATCH_SIZE) {
        if (cancelled || runIdRef.current !== runId) return
        const end = Math.min(start + BATCH_SIZE, total)
        for (let i = start; i < end; i += 1) {
          const tune = selectedTunes[i]
          if (!tune || !tune.id) continue
          const cacheKey = tuneCacheKey(tune, checkOptions)
          let report = cacheKey ? reportCache.get(cacheKey) : null
          if (!report) {
            report = buildTuneCheckReport(tune, Object.assign({}, checkOptions, { skipRenderAbc: true }))
            if (cacheKey && report) reportCache.set(cacheKey, report)
          }
          if (report) built.push(report)
        }
        setReports(sortReports(built))
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
    reports: reports,
    running: running,
    progressPercent: progressPercent,
    progressMessage: progressMessage,
  }
}

export function clearBulkCheckReportCache() {
  reportCache.clear()
}
