import { shareOrigin } from './shareTunebookUtils'

export const AUDIO_ANALYSIS_SHARE_CONFIRM_KEY = 'bookstorage_audio_analysis_share_public'

export function buildAudioAnalysisShareLink(manifestFileId, origin) {
  if (!manifestFileId) return ''
  return shareOrigin(origin) + '/#/audioanalysis/share/' + encodeURIComponent(manifestFileId)
}

export function buildAudioAnalysisSharePlayLink(manifestFileId, options) {
  const opts = options || {}
  const base = buildAudioAnalysisShareLink(manifestFileId, opts.origin)
  if (!base) return ''
  const params = []
  if (opts.side) params.push('side=' + encodeURIComponent(opts.side))
  if (opts.note) params.push('note=' + encodeURIComponent(opts.note))
  return params.length ? base + '?' + params.join('&') : base
}

export function shareEmailSubject(baseline, candidate) {
  const a = baseline && baseline.label ? baseline.label : 'Baseline'
  const b = candidate && candidate.label ? candidate.label : 'Candidate'
  return 'Audio Analysis comparison: ' + a + ' vs ' + b
}

export function shareEmailBody(link) {
  return 'Open this Audio Analysis comparison report. Play buttons on the report page will fetch note audio from Google Drive.\n\n' + link
}

export function collectCompareDriveFileIds(baseline, candidate, extraIds) {
  const ids = {}
  function addFromSet(setObj) {
    ;(setObj && setObj.notes || []).forEach(function(note) {
      if (note && note.driveFileId) ids[note.driveFileId] = true
    })
  }
  addFromSet(baseline)
  addFromSet(candidate)
  ;(extraIds || []).forEach(function(id) {
    if (id) ids[id] = true
  })
  return Object.keys(ids)
}

export function stripLocalOnlyCompareSet(setObj) {
  if (!setObj) return null
  return Object.assign({}, setObj, {
    notes: (setObj.notes || []).map(function(note) {
      if (!note) return note
      const stripped = {
        id: note.id,
        targetNote: note.targetNote,
        stringIndex: note.stringIndex,
        durationMs: note.durationMs,
        driveFileId: note.driveFileId || null,
        features: note.features || {},
        channelCount: note.channelCount || 1
      }
      if (note.featuresR) stripped.featuresR = note.featuresR
      return stripped
    })
  })
}
