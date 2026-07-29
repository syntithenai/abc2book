import { useEffect, useMemo, useRef, useState } from 'react'
import { checkTuneAbcCorrectness } from './tuneAbcCorrectnessCheck'
import { checkTuneAbcStructure } from './tuneAbcStructureCheck'
import { checkTuneLyricsAlignment } from './tuneLyricsAlignmentCheck'
import { buildNotationCheckTune } from './notationCheckSnapshot'

const DEFAULT_DEBOUNCE_MS = 300

function flattenIssues(result, source) {
  if (!result || !Array.isArray(result.issues)) return []
  return result.issues.map(function(item) {
    return Object.assign({}, item, { source: source })
  })
}

export function runNotationChecks(tune, options) {
  const opts = options || {}
  if (!tune || !tune.id) {
    return { issues: [], abcResult: null, structureResult: null, lyricsResult: null }
  }

  const abcTools = opts.abcTools
  const abcText = opts.abcText || (abcTools ? abcTools.json2abc(tune) : '')
  const checkOpts = Object.assign({}, opts, {
    abcText: abcText,
    skipRenderAbc: opts.skipRenderAbc !== false,
  })

  const abcResult = checkTuneAbcCorrectness(tune, checkOpts)
  const structureResult = checkTuneAbcStructure(tune, checkOpts)
  const lyricsResult = checkTuneLyricsAlignment(tune, checkOpts)

  const issues = []
  issues.push.apply(issues, flattenIssues(abcResult, 'abc'))
  issues.push.apply(issues, flattenIssues(structureResult, 'structure'))
  issues.push.apply(issues, flattenIssues(lyricsResult, 'lyrics'))

  return {
    issues: issues,
    abcResult: abcResult,
    structureResult: structureResult,
    lyricsResult: lyricsResult,
  }
}

export function buildNotationCheckReport(tune, liveBodies, options) {
  const opts = options || {}
  const snapshot = buildNotationCheckTune(tune, liveBodies, opts.voiceKeys)
  if (!snapshot) return { issues: [], tune: null }
  const result = runNotationChecks(snapshot, opts)
  return Object.assign({}, result, { tune: snapshot })
}

/**
 * Debounced live notation checks for the editor.
 */
export default function useNotationCheck(tune, liveBodies, options) {
  const opts = options || {}
  const debounceMs = opts.debounceMs != null ? opts.debounceMs : DEFAULT_DEBOUNCE_MS
  const enabled = opts.enabled !== false

  const [checkState, setCheckState] = useState({
    issues: [],
    abcResult: null,
    structureResult: null,
    lyricsResult: null,
    checking: false,
  })

  const bodiesKey = useMemo(function() {
    const bodies = liveBodies || {}
    return Object.keys(bodies).sort().map(function(key) {
      return key + '\u0001' + String(bodies[key] || '')
    }).join('\u0002')
  }, [liveBodies])

  const optionsRef = useRef(opts)
  optionsRef.current = opts

  useEffect(function() {
    if (!enabled || !tune || !tune.id) {
      setCheckState({
        issues: [],
        abcResult: null,
        structureResult: null,
        lyricsResult: null,
        checking: false,
      })
      return undefined
    }

    setCheckState(function(prev) {
      return Object.assign({}, prev, { checking: true })
    })

    const timer = setTimeout(function() {
      const report = buildNotationCheckReport(tune, liveBodies, optionsRef.current)
      setCheckState({
        issues: report.issues || [],
        abcResult: report.abcResult,
        structureResult: report.structureResult,
        lyricsResult: report.lyricsResult,
        checking: false,
      })
    }, debounceMs)

    return function() {
      clearTimeout(timer)
    }
  }, [tune, tune && tune.id, tune && tune.lastUpdated, bodiesKey, enabled, debounceMs])

  const issueBarIndices = useMemo(function() {
    const bars = new Set()
    checkState.issues.forEach(function(item) {
      if (item.barIndex != null) bars.add(item.barIndex)
    })
    return Array.from(bars)
  }, [checkState.issues])

  const checkTune = useMemo(function() {
    if (!tune || !tune.id) return null
    return buildNotationCheckTune(tune, liveBodies)
  }, [tune, tune && tune.id, bodiesKey])

  return Object.assign({}, checkState, {
    checkTune: checkTune,
    issueBarIndices: issueBarIndices,
    refresh: function() {
      if (!tune || !tune.id) return
      const report = buildNotationCheckReport(tune, liveBodies, optionsRef.current)
      setCheckState({
        issues: report.issues || [],
        abcResult: report.abcResult,
        structureResult: report.structureResult,
        lyricsResult: report.lyricsResult,
        checking: false,
      })
    },
  })
}
