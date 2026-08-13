import { appendFreshLoadParam } from './appFreshLoadUtils'
import { shareOrigin } from './shareTunebookUtils'

export const AUDIO_ANALYSIS_SHARE_CONFIRM_KEY = 'bookstorage_audio_analysis_share_public'

export function buildAudioAnalysisShareLink(manifestFileId, origin, options) {
  if (!manifestFileId) return ''
  const opts = options || {}
  const link = shareOrigin(origin) + '/#/audioanalysis/share/' + encodeURIComponent(manifestFileId)
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}

export function buildAudioAnalysisSharePlayLink(manifestFileId, options) {
  const opts = options || {}
  const base = buildAudioAnalysisShareLink(manifestFileId, opts.origin)
  if (!base) return ''
  const params = []
  if (opts.side) params.push('side=' + encodeURIComponent(opts.side))
  if (opts.note) params.push('note=' + encodeURIComponent(opts.note))
  const withParams = params.length ? base + '?' + params.join('&') : base
  return opts.includeFreshParam === false ? withParams : appendFreshLoadParam(withParams)
}

export function shareEmailSubject(baseline, candidate) {
  const a = baseline && baseline.label ? baseline.label : 'Baseline'
  const b = candidate && candidate.label ? candidate.label : 'Candidate'
  return 'Audio Analysis comparison: ' + a + ' vs ' + b
}

export function shareEmailBody(link) {
  return 'Open this Audio Analysis comparison report. Play buttons on the report page will fetch note audio from Google Drive.\n\n' + link
}

export function shareSetEmailSubject(recordingSet) {
  const label = recordingSet && recordingSet.label ? recordingSet.label : 'Recording set'
  return 'Audio Analysis set: ' + label
}

export function shareSetEmailBody(link) {
  return 'Open this Audio Analysis recording set. Play buttons on the page will fetch note audio from Google Drive.\n\n' + link
}

export function shareGroupEmailSubject(groupLabel, setCount) {
  const label = groupLabel && String(groupLabel).trim() ? String(groupLabel).trim() : 'Ungrouped'
  const n = setCount != null ? setCount : 0
  return 'Audio Analysis group: ' + label + ' (' + n + ' set' + (n === 1 ? '' : 's') + ')'
}

export function shareGroupEmailBody(link, groupLabel) {
  const label = groupLabel && String(groupLabel).trim() ? String(groupLabel).trim() : 'Ungrouped'
  return 'Open this Audio Analysis group (“' + label + '”). Sets are imported into your collection under that group name.\n\n' + link
}

/** Percent for ProgressBar from { current, total }, or null when unknown. */
export function audioAnalysisProgressPercent(info) {
  if (!info || info.total == null || Number(info.total) <= 0 || info.current == null) return null
  return Math.max(0, Math.min(100, Math.round((100 * Number(info.current)) / Number(info.total))))
}

export function collectCompareDriveFileIds(baseline, candidate, extraIds) {
  return collectDriveFileIdsFromSets([baseline, candidate], extraIds)
}

export function collectDriveFileIdsFromSets(sets, extraIds) {
  const ids = {}
  function addFromSet(setObj) {
    ;(setObj && setObj.notes || []).forEach(function(note) {
      if (note && note.driveFileId) ids[note.driveFileId] = true
    })
  }
  ;(sets || []).forEach(addFromSet)
  ;(extraIds || []).forEach(function(id) {
    if (id) ids[id] = true
  })
  return Object.keys(ids)
}

/** Capture-setup mismatch flags for compare warnings. */
export function captureSetupMismatch(baseline, candidate) {
  if (!baseline || !candidate) {
    return { stereoMismatch: false, deviceMismatch: false, message: '' }
  }
  const stereoA = !!(baseline.stereoTap || baseline.channelCount === 2)
  const stereoB = !!(candidate.stereoTap || candidate.channelCount === 2)
  const stereoMismatch = stereoA !== stereoB
  const deviceA = baseline.inputDeviceId || ''
  const deviceB = candidate.inputDeviceId || ''
  const deviceMismatch = !!(deviceA && deviceB && deviceA !== deviceB)
  const parts = []
  if (stereoMismatch) {
    parts.push((stereoA ? 'stereo' : 'mono') + ' vs ' + (stereoB ? 'stereo' : 'mono'))
  }
  if (deviceMismatch) {
    const la = baseline.inputDeviceLabel || deviceA
    const lb = candidate.inputDeviceLabel || deviceB
    parts.push('“' + la + '” vs “' + lb + '”')
  }
  const message = parts.length
    ? ('These sets used different capture setups (' + parts.join('; ') +
      '). Treat spectral/body-mode deltas cautiously.')
    : ''
  return { stereoMismatch: stereoMismatch, deviceMismatch: deviceMismatch, message: message }
}

export function stripLocalOnlyCompareSet(setObj) {
  if (!setObj) return null
  const stripped = Object.assign({}, setObj, {
    notes: (setObj.notes || []).map(function(note) {
      if (!note) return note
      const next = {
        id: note.id,
        targetNote: note.targetNote,
        stringIndex: note.stringIndex,
        durationMs: note.durationMs,
        driveFileId: note.driveFileId || null,
        features: note.features || {},
        channelCount: note.channelCount || 1
      }
      if (note.featuresR) next.featuresR = note.featuresR
      return next
    })
  })
  delete stripped.audioBlobKey
  delete stripped.needsSync
  delete stripped.syncedAt
  return stripped
}
