import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'
import { tuneHasLyrics } from './practiceTuneViewUtils'
import { hasChordLines } from './chordSheetUtils'
import { getLyricLines } from './wLinesUtils'
import { formatTuneDisplayName } from './tuneDisplayName'
import { checkTuneCompleteness } from './tuneCompletenessCheck'
import { checkTuneAbcCorrectness } from './tuneAbcCorrectnessCheck'
import { checkTuneAbcStructure } from './tuneAbcStructureCheck'
import { tuneHasLinkContent } from './checkTuneLinkPlayback'
import { isSongTitleCapitalized } from './titleCaseUtils'

export const SEVERITY_RED = 'red'
export const SEVERITY_ORANGE = 'orange'
export const SEVERITY_BLUE = 'blue'
export const SEVERITY_GREEN = 'green'

const SEVERITY_ORDER = {
  [SEVERITY_RED]: 0,
  [SEVERITY_ORANGE]: 1,
  [SEVERITY_BLUE]: 2,
  [SEVERITY_GREEN]: 3,
}

function issue(code, message, severity, field) {
  return { code: code, message: message, severity: severity || 'warning', field: field || null }
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  return voice && Array.isArray(voice.notes) ? voice.notes : []
}

export function hasTuneTitle(tune) {
  return !!(tune && String(tune.name ?? '').trim())
}

export function hasTuneNotation(tune, options) {
  const opts = options || {}
  if (typeof opts.hasNotesOrChords === 'function' && opts.hasNotesOrChords(tune)) {
    return true
  }
  const noteLines = getNoteLines(tune)
  if (noteLinesHaveRealMelody(noteLines)) return true
  if (tune && tune.timingScaffold && noteLines.length > 0) return true
  const lyrics = getLyricLines(tune)
  if (hasChordLines(lyrics)) return true
  return false
}

export function hasTuneLinks(tune, hasLinks) {
  return tuneHasLinkContent(tune, hasLinks)
}

function collectFieldWarnings(tune) {
  const warnings = []
  if (!tune) return warnings
  const tempo = tune.tempo
  if (tempo == null || tempo === '' || (typeof tempo === 'string' && !tempo.trim())) {
    warnings.push(issue('missing_tempo', 'Tempo is missing', 'warning', 'tempo'))
  }
  if (!String(tune.composer ?? '').trim()) {
    warnings.push(issue('missing_composer', 'Artist is missing', 'warning', 'composer'))
  }
  const title = String(tune.name ?? '').trim()
  if (title && !isSongTitleCapitalized(title)) {
    warnings.push(issue('title_not_capitalized', 'Title is not capitalised', 'warning', 'name'))
  }
  return warnings
}

function collectOptionalGaps(tune) {
  const gaps = []
  if (!tune) return gaps
  if (!String(tune.backgroundInfo ?? '').trim()) {
    gaps.push(issue('missing_background', 'Background information is missing', 'info', 'backgroundInfo'))
  }
  if (tune.suitableForPractice === false) {
    gaps.push(issue('blocked_practice', 'Marked as not suitable for practice', 'info', 'suitableForPractice'))
  }
  const suitableFor = Array.isArray(tune.suitableFor) ? tune.suitableFor : []
  if (suitableFor.length === 0) {
    gaps.push(issue('missing_practice_instruments', 'No practice instrument settings (suitable for any instrument)', 'info', 'suitableFor'))
  }
  return gaps
}

function collectLinkIssues(tune, linkContext) {
  const ctx = linkContext || {}
  const issues = []
  if (!tune || !tune.id) return issues

  const failures = Array.isArray(ctx.failures) ? ctx.failures : []
  failures.filter(function(item) { return item.tuneId === tune.id }).forEach(function(item) {
    issues.push(issue(
      'link_failure_' + item.linkIndex,
      'Link failed: ' + (item.error || 'Playback failed'),
      'error',
      'links'
    ))
  })

  const warnings = Array.isArray(ctx.warnings) ? ctx.warnings : []
  warnings.filter(function(item) { return item.tuneId === tune.id }).forEach(function(item) {
    const missing = Array.isArray(item.missing) ? item.missing.join(', ') : 'start/end'
    issues.push(issue(
      'link_region_' + item.linkIndex,
      'Link missing region: ' + missing,
      'warning',
      'links'
    ))
  })

  if (ctx.linksChecked && !hasTuneLinks(tune, ctx.hasLinks)) {
    issues.push(issue('no_links', 'No playback links', 'warning', 'links'))
  }

  return issues
}

function flattenCompletenessIssues(completenessResult) {
  if (!completenessResult || !Array.isArray(completenessResult.issues)) return []
  return completenessResult.issues.map(function(item) {
    return issue(item.code, item.message, 'error', item.field)
  })
}

function flattenStructureIssues(structureResult) {
  if (!structureResult || !Array.isArray(structureResult.issues)) return []
  return structureResult.issues.map(function(item) {
    return issue(item.code, item.message, item.severity || 'warning', item.field || 'voices')
  })
}

function flattenAbcIssues(abcResult) {
  if (!abcResult || !Array.isArray(abcResult.issues)) return []
  return abcResult.issues.map(function(item) {
    return issue(item.code, item.message, item.severity || 'error', item.field)
  })
}

export function classifyTuneSeverity(tune, allIssues, optionalGaps, options) {
  const opts = options || {}
  const titleMissing = !hasTuneTitle(tune)
  const noLyrics = !tuneHasLyrics(tune)
  const noNotation = !hasTuneNotation(tune, opts)
  const noLinks = !hasTuneLinks(tune, opts.hasLinks)

  if (titleMissing || (noLyrics && noNotation && noLinks)) {
    return SEVERITY_RED
  }

  const blocking = allIssues.filter(function(item) {
    return item.severity === 'error' || item.severity === 'warning'
  })
  if (blocking.length > 0) {
    return SEVERITY_ORANGE
  }

  const infoIssues = allIssues.filter(function(item) { return item.severity === 'info' })
  if (infoIssues.length > 0 || optionalGaps.length > 0) {
    return SEVERITY_BLUE
  }

  return SEVERITY_GREEN
}

export function buildTuneCheckReport(tune, options) {
  const opts = options || {}
  if (!tune || !tune.id) return null

  const abcText = opts.abcText || (opts.abcTools ? opts.abcTools.json2abc(tune) : '')
  const checkOpts = Object.assign({}, opts, { abcText: abcText })

  const completenessResult = checkTuneCompleteness(tune, checkOpts)
  const abcResult = checkTuneAbcCorrectness(tune, checkOpts)
  const structureResult = checkTuneAbcStructure(tune, checkOpts)

  const issues = []
  issues.push.apply(issues, flattenCompletenessIssues(completenessResult))
  issues.push.apply(issues, flattenAbcIssues(abcResult))
  issues.push.apply(issues, flattenStructureIssues(structureResult))
  issues.push.apply(issues, collectFieldWarnings(tune))
  issues.push.apply(issues, collectLinkIssues(tune, opts.linkContext))

  const optionalGaps = collectOptionalGaps(tune)
  const severity = classifyTuneSeverity(tune, issues, optionalGaps, opts)

  let displayIssues = []
  if (severity === SEVERITY_GREEN) {
    displayIssues = []
  } else if (severity === SEVERITY_BLUE) {
    displayIssues = issues.filter(function(item) { return item.severity === 'info' })
    displayIssues = displayIssues.concat(optionalGaps)
  } else {
    displayIssues = issues.slice()
    if (optionalGaps.length > 0) {
      displayIssues = displayIssues.concat(optionalGaps)
    }
  }

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    composer: tune.composer || '',
    severity: severity,
    issues: displayIssues,
    optionalGaps: optionalGaps,
    completenessResult: completenessResult,
    abcResult: abcResult,
    structureResult: structureResult,
  }
}

export function buildTuneCheckReports(tunes, options) {
  if (!Array.isArray(tunes)) return []
  return tunes
    .map(function(tune) { return buildTuneCheckReport(tune, options) })
    .filter(Boolean)
    .sort(function(a, b) {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (severityDiff !== 0) return severityDiff
      return a.tuneName.localeCompare(b.tuneName)
    })
}

export function countIssuesInReports(reports) {
  if (!Array.isArray(reports)) return 0
  return reports.filter(function(report) {
    return report.severity !== SEVERITY_GREEN
  }).length
}

/**
 * All check issues for a tune report — used to gate notation fix actions even when
 * only a subset is shown in the issue list (e.g. blue-severity info-only display).
 */
export function collectReportIssuesForFixes(report) {
  if (!report) return []
  const seen = {}
  const items = []

  function addIssue(item) {
    if (!item || !item.code || seen[item.code]) return
    seen[item.code] = true
    items.push(item)
  }

  function addFromResult(result) {
    if (!result || !Array.isArray(result.issues)) return
    result.issues.forEach(addIssue)
  }

  addFromResult(report.completenessResult)
  addFromResult(report.abcResult)
  addFromResult(report.structureResult)
  if (Array.isArray(report.issues)) {
    report.issues.forEach(addIssue)
  }
  if (Array.isArray(report.optionalGaps)) {
    report.optionalGaps.forEach(addIssue)
  }
  return items
}
