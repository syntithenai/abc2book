import { isPhotoOnlyTune } from './abcPhotoOnly'
import { checkTuneAbcCorrectness } from './tuneAbcCorrectnessCheck'
import { checkTuneAbcStructure } from './tuneAbcStructureCheck'

function considerIssues(result, flags) {
  if (!result || !Array.isArray(result.issues)) return
  for (let i = 0; i < result.issues.length; i += 1) {
    const severity = result.issues[i] && result.issues[i].severity
    if (severity === 'error') flags.hasMusicalErrors = true
    else if (severity === 'warning') flags.hasMusicalWarnings = true
    if (flags.hasMusicalErrors && flags.hasMusicalWarnings) return
  }
}

/**
 * Cheap-enough musical flags for list grouping and icon color.
 * Skips renderAbc, lyrics alignment, extended/info checks, and metadata gaps.
 * Photo-only stubs (snapshot is the source) are not flagged.
 */
export function scanTuneMusicalIssueStatus(tune, options) {
  const opts = options || {}
  const abcTools = opts.abcTools
  if (!tune || !tune.id || !abcTools) {
    return { hasMusicalErrors: false, hasMusicalWarnings: false }
  }

  const checkOpts = {
    abcTools: abcTools,
    skipRenderAbc: true,
  }
  if (typeof opts.abcText === 'string') checkOpts.abcText = opts.abcText
  const abcText = typeof checkOpts.abcText === 'string'
    ? checkOpts.abcText
    : abcTools.json2abc(tune)
  if (isPhotoOnlyTune(tune, abcText)) {
    return { hasMusicalErrors: false, hasMusicalWarnings: false }
  }
  if (typeof checkOpts.abcText !== 'string') checkOpts.abcText = abcText

  const flags = { hasMusicalErrors: false, hasMusicalWarnings: false }
  considerIssues(checkTuneAbcCorrectness(tune, checkOpts), flags)
  if (!(flags.hasMusicalErrors && flags.hasMusicalWarnings)) {
    considerIssues(checkTuneAbcStructure(tune, checkOpts), flags)
  }
  return flags
}
