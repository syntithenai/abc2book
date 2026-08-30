import { useEffect, useMemo, useRef, useState } from 'react'
import { isPhotoOnlyTune } from './abcPhotoOnly'
import { checkTuneAbcCorrectness } from './tuneAbcCorrectnessCheck'
import { checkTuneAbcStructure } from './tuneAbcStructureCheck'
import { checkTuneLyricsAlignment } from './tuneLyricsAlignmentCheck'
import { checkTuneAbcExtended } from './tuneAbcExtendedCheck'
import { checkTuneCompleteness } from './tuneCompletenessCheck'
import { collectFieldWarnings } from './tuneBulkCheckReport'
import { buildNotationCheckTune } from './notationCheckSnapshot'

const DEFAULT_DEBOUNCE_MS = 300

function flattenIssues(result, source) {
  if (!result || !Array.isArray(result.issues)) return []
  return result.issues.map(function(item) {
    return Object.assign({}, item, { source: source })
  })
}

function flattenCompletenessIssues(result) {
  if (!result || !Array.isArray(result.issues)) return []
  return result.issues.map(function(item) {
    return Object.assign({}, item, {
      severity: item.severity || 'warning',
      source: 'completeness',
    })
  })
}

export function runNotationChecks(tune, options) {
  const opts = options || {}
  if (!tune || !tune.id) {
    return {
      issues: [],
      abcResult: null,
      structureResult: null,
      lyricsResult: null,
      extendedResult: null,
      completenessResult: null,
      completenessIssues: [],
      metadataIssues: [],
    }
  }

  const abcTools = opts.abcTools
  const abcText = opts.abcText || (abcTools ? abcTools.json2abc(tune) : '')
  if (isPhotoOnlyTune(tune, abcText)) {
    return {
      issues: [],
      abcResult: null,
      structureResult: null,
      lyricsResult: null,
      extendedResult: null,
      completenessResult: null,
      completenessIssues: [],
      metadataIssues: [],
    }
  }
  const checkOpts = Object.assign({}, opts, {
    abcText: abcText,
    skipRenderAbc: opts.skipRenderAbc !== false,
  })

  const abcResult = checkTuneAbcCorrectness(tune, checkOpts)
  const structureResult = checkTuneAbcStructure(tune, checkOpts)
  const lyricsResult = checkTuneLyricsAlignment(tune, checkOpts)
  const extendedResult = checkTuneAbcExtended(tune, checkOpts)
  const completenessResult = checkTuneCompleteness(tune, checkOpts)
  const completenessIssues = flattenCompletenessIssues(completenessResult)
  const metadataIssues = collectFieldWarnings(tune).map(function(item) {
    return Object.assign({}, item, { source: 'metadata' })
  })

  const issues = []
  issues.push.apply(issues, flattenIssues(abcResult, 'abc'))
  issues.push.apply(issues, flattenIssues(structureResult, 'structure'))
  issues.push.apply(issues, flattenIssues(lyricsResult, 'lyrics'))
  issues.push.apply(issues, flattenIssues(extendedResult, 'extended'))

  return {
    issues: issues,
    abcResult: abcResult,
    structureResult: structureResult,
    lyricsResult: lyricsResult,
    extendedResult: extendedResult,
    completenessResult: completenessResult,
    completenessIssues: completenessIssues,
    metadataIssues: metadataIssues,
  }
}

export function buildNotationCheckReport(tune, liveBodies, options) {
  const opts = options || {}
  const snapshot = buildNotationCheckTune(tune, liveBodies, opts.voiceKeys)
  if (!snapshot) {
    return {
      issues: [],
      completenessIssues: [],
      metadataIssues: [],
      tune: null,
    }
  }
  const result = runNotationChecks(snapshot, opts)
  return Object.assign({}, result, { tune: snapshot })
}

function emptyCheckState() {
  return {
    issues: [],
    abcResult: null,
    structureResult: null,
    lyricsResult: null,
    extendedResult: null,
    completenessResult: null,
    completenessIssues: [],
    metadataIssues: [],
    checking: false,
  }
}

function stateFromReport(report) {
  return {
    issues: report.issues || [],
    abcResult: report.abcResult,
    structureResult: report.structureResult,
    lyricsResult: report.lyricsResult,
    extendedResult: report.extendedResult,
    completenessResult: report.completenessResult,
    completenessIssues: report.completenessIssues || [],
    metadataIssues: report.metadataIssues || [],
    checking: false,
  }
}

/**
 * Debounced live notation checks for the editor.
 */
export default function useNotationCheck(tune, liveBodies, options) {
  const opts = options || {}
  const debounceMs = opts.debounceMs != null ? opts.debounceMs : DEFAULT_DEBOUNCE_MS
  const enabled = opts.enabled !== false

  const [checkState, setCheckState] = useState(emptyCheckState)

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
      setCheckState(emptyCheckState())
      return undefined
    }

    setCheckState(function(prev) {
      return Object.assign({}, prev, { checking: true })
    })

    const timer = setTimeout(function() {
      const report = buildNotationCheckReport(tune, liveBodies, optionsRef.current)
      setCheckState(stateFromReport(report))
    }, debounceMs)

    return function() {
      clearTimeout(timer)
    }
  }, [
    tune,
    tune && tune.id,
    tune && tune.lastUpdated,
    tune && tune.name,
    tune && tune.composer,
    tune && tune.tempo,
    tune && tune.meter,
    tune && tune.key,
    bodiesKey,
    enabled,
    debounceMs,
  ])

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
    refresh: function(override) {
      const refreshOpts = override || {}
      const tuneForCheck = refreshOpts.tune || tune
      if (!tuneForCheck || !tuneForCheck.id) return
      const bodiesForCheck = refreshOpts.liveBodies != null ? refreshOpts.liveBodies : liveBodies
      const report = buildNotationCheckReport(tuneForCheck, bodiesForCheck, optionsRef.current)
      setCheckState(stateFromReport(report))
    },
  })
}
