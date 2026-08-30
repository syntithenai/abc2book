import {
  collectReportIssuesForFixes,
  hasTuneNotation,
} from './tuneBulkCheckReport'
import { STRUCTURE_FIX_ACTIONS } from './tuneAbcStructureFix'
import {
  canFixSessionLineBreaks,
  canNormalizeMelodyRepeatMarks,
  canCollapseEmptyRepeatBars,
  canCollapseAnacrusisDoubleBarlines,
  canFixStrainRepeatEndsInTune,
} from './tuneAbcStructureFix'

const NOTATION_ISSUE_CODES = new Set([
  'empty_bar',
  'rest_only_bar',
  'chord_scaffold_in_melody',
  'unmatched_repeat_start',
  'strain_missing_repeat_end',
  'unmatched_repeat_end',
  'ending_without_repeat',
  'ending_bar_mismatch',
  'repeat_style_mixed',
  'truncated_repeat',
  'missing_final_barline',
  'stanza_strain_mismatch',
  'stanza_barlines',
  'overfull_bar',
  'underfull_bar',
  'secondary_voice_empty',
  'voice_bar_count_mismatch',
  'anacrusis_inconsistent',
  'anacrusis_double_barline',
  'mid_block_double_barline',
  'section_pickup_should_be_ending',
  'unexpected_melody',
  'sparse_melody',
  'session_linebreak_markers',
  'orphan_chord_symbol',
  'tie_across_barline',
  'inconsistent_note_length',
  'duplicate_voice_content',
  'missing_repeat_second_time',
  'stale_chord_in_melody',
])

const ABC_RECORD_ISSUE_CODES = new Set([
  'empty_voice',
  'missing_meter_header',
  'missing_key_header',
  'parse_failure',
  'render_warning',
  'render_failure',
  'round_trip_drift',
  'header_field_mismatch',
  'missing_meter',
  'missing_key',
])

const CHORDS_LYRICS_ISSUE_CODES = new Set([
  'no_lyrics',
  'no_chord_layout',
  'stanza_chord_mismatch',
  'wline_count_mismatch',
  'lyric_note_misalignment',
  'stale_wlines',
  'visual_line_break_mid_bar',
  'strain_lyric_count_mismatch',
  'interleaved_w_spacing',
  'lyric_line_bar_ratio_suspect',
  'hymn_single_chart_unmarked',
])

const NOTATION_MISSING_CODES = new Set([
  'no_melody',
])

const OTHER_INFO_ISSUE_CODES = new Set([
  'missing_title',
  'missing_composer',
  'missing_tempo',
  'title_not_capitalized',
  'missing_background',
  'tempo_mismatch',
  'tempo_beat_unit_mismatch',
])

const SEARCH_ACTIONS = new Set([
  'searchAbc',
  'searchChordsLyrics',
  'backgroundInfo',
  'capitalizeTitle',
])

/** Which groups may show each fix/search action. */
const ACTION_GROUP_IDS = {
  capitalizeTitle: ['otherInfo'],
  searchAbc: ['notation', 'abcRecord', 'otherInfo'],
  searchChordsLyrics: ['chordsLyrics', 'otherInfo'],
  searchArtist: ['otherInfo'],
  backgroundInfo: ['otherInfo'],
  fixHeaders: ['abcRecord'],
  syncHeadersFromAbc: ['abcRecord'],
  editTuneLinks: ['links'],
  scanLinkRegion: ['links'],
  sessionLineBreaks: ['notation'],
  stanzaDoubleBarlines: ['notation'],
  normalizeRepeatMarks: ['notation'],
  fixStrainRepeatEnds: ['notation'],
  applyTuneTempoOnly: ['notation', 'abcRecord', 'otherInfo'],
  collapseAnacrusisDoubleBarlines: ['notation'],
  normalizeAbc: ['notation', 'abcRecord'],
  appendFinalBarline: ['notation'],
  closeOpenRepeat: ['notation'],
  padBarWithRests: ['notation'],
  removeEmptyBars: ['notation'],
  padVoicesToMatch: ['notation'],
  rebuildWLines: ['chordsLyrics'],
  relayoutNoteLines: ['notation'],
  resolveHeaderConflict: ['abcRecord'],
  resolveHeaderConflictFromTune: ['abcRecord'],
  wrapEndingInRepeat: ['notation'],
  removeEmptyVoice: ['notation'],
  declarePickupLength: ['notation'],
  convertScaffoldToRests: ['notation'],
  quantizeOverfullBars: ['notation'],
  balanceEndings: ['notation'],
  closeRepeatAtEnd: ['notation'],
  removeOrphanRepeatEnd: ['notation'],
  fillSparseBars: ['notation'],
}

/** Issue codes mapped to fix/search actions offered in matching groups. */
const ISSUE_CODE_ACTIONS = {
  no_lyrics: ['searchChordsLyrics'],
  no_chord_layout: ['searchChordsLyrics'],
  stanza_chord_mismatch: ['searchChordsLyrics'],
  no_embedded_chords: ['searchChordsLyrics'],
  no_melody: ['searchAbc'],
  empty_voice: ['searchAbc'],
  missing_title: ['searchAbc'],
  missing_composer: ['searchArtist', 'backgroundInfo'],
  missing_tempo: ['syncHeadersFromAbc'],
  title_not_capitalized: ['capitalizeTitle'],
  missing_background: ['backgroundInfo'],
  missing_meter_header: ['fixHeaders'],
  missing_key_header: ['fixHeaders'],
  missing_meter: ['fixHeaders'],
  missing_key: ['fixHeaders'],
  header_field_mismatch: ['syncHeadersFromAbc', 'resolveHeaderConflict', 'resolveHeaderConflictFromTune'],
  parse_failure: ['searchAbc'],
  render_failure: ['searchAbc'],
  render_warning: ['normalizeAbc'],
  round_trip_drift: ['normalizeAbc'],
  session_linebreak_markers: ['sessionLineBreaks'],
  stanza_strain_mismatch: ['stanzaDoubleBarlines'],
  stanza_barlines: ['stanzaDoubleBarlines'],
  empty_bar: ['fixStrainRepeatEnds', 'removeEmptyBars'],
  repeat_style_mixed: ['normalizeRepeatMarks'],
  missing_final_barline: ['appendFinalBarline'],
  truncated_repeat: ['closeOpenRepeat', 'closeRepeatAtEnd'],
  underfull_bar: ['padBarWithRests'],
  overfull_bar: ['quantizeOverfullBars'],
  voice_bar_count_mismatch: ['padVoicesToMatch'],
  secondary_voice_empty: ['removeEmptyVoice'],
  anacrusis_inconsistent: ['declarePickupLength', 'collapseAnacrusisDoubleBarlines'],
  anacrusis_double_barline: ['collapseAnacrusisDoubleBarlines'],
  section_pickup_should_be_ending: ['convertSectionPickupsToVoltas'],
  chord_scaffold_in_melody: ['convertScaffoldToRests'],
  ending_without_repeat: ['wrapEndingInRepeat'],
  ending_bar_mismatch: ['balanceEndings'],
  strain_missing_repeat_end: ['fixStrainRepeatEnds'],
  unmatched_repeat_start: ['fixStrainRepeatEnds', 'closeRepeatAtEnd'],
  unmatched_repeat_end: ['removeOrphanRepeatEnd'],
  sparse_melody: ['searchAbc', 'fillSparseBars'],
  wline_count_mismatch: ['rebuildWLines', 'relayoutNoteLines'],
  lyric_note_misalignment: ['rebuildWLines'],
  stale_wlines: ['rebuildWLines'],
  interleaved_w_spacing: ['rebuildWLines'],
  visual_line_break_mid_bar: ['relayoutNoteLines'],
  strain_lyric_count_mismatch: ['stanzaDoubleBarlines'],
  hymn_single_chart_unmarked: ['stanzaDoubleBarlines'],
  tempo_mismatch: ['applyTuneTempoOnly'],
  tempo_beat_unit_mismatch: ['applyTuneTempoOnly'],
}

/** Actions that open the editor instead of mutating the tune in place. */
export const BULK_CHECK_NAV_ACTIONS = new Set([
  'editTuneLinks',
])

/** Never run these from Fix all — require an explicit button click. */
export const FIX_ALL_EXCLUDED_ACTIONS = new Set([
  'scanLinkRegion',
  'analyse',
  'stems',
  'editTuneLinks',
  // Dangerous for folk ABC / anacrusis: can desync chord fill or strip implied repeats.
  'padBarWithRests',
  'removeOrphanRepeatEnd',
])

const SEARCH_ACTION_LABELS = {
  capitalizeTitle: 'Capitalise title',
  searchAbc: 'Search notation',
  searchChordsLyrics: 'Search chords and lyrics',
  searchArtist: 'Search artist',
  backgroundInfo: 'Search background',
  editTuneLinks: 'Add playback link',
  scanLinkRegion: 'Scan link region',
}

export const BULK_CHECK_ISSUE_GROUPS = [
  { id: 'notation', title: 'Notation' },
  { id: 'abcRecord', title: 'ABC record' },
  { id: 'chordsLyrics', title: 'Chords and lyrics' },
  { id: 'otherInfo', title: 'Other information' },
  { id: 'links', title: 'Links' },
]

function isLinkIssue(code) {
  return code === 'no_links'
    || code.indexOf('link_failure_') === 0
    || code.indexOf('link_region_') === 0
}

function classifyIssue(issueItem) {
  const code = issueItem && issueItem.code ? issueItem.code : ''
  if (NOTATION_MISSING_CODES.has(code)) return 'notation'
  if (code === 'no_embedded_chords') return 'chordsLyrics'
  if (NOTATION_ISSUE_CODES.has(code)) return 'notation'
  if (ABC_RECORD_ISSUE_CODES.has(code)) return 'abcRecord'
  if (CHORDS_LYRICS_ISSUE_CODES.has(code)) return 'chordsLyrics'
  if (OTHER_INFO_ISSUE_CODES.has(code)) return 'otherInfo'
  if (isLinkIssue(code)) return 'links'
  return 'otherInfo'
}

function actionAllowedInGroup(actionId, groupId) {
  const groups = ACTION_GROUP_IDS[actionId]
  return Array.isArray(groups) && groups.indexOf(groupId) >= 0
}

function labelForAction(actionId) {
  if (SEARCH_ACTION_LABELS[actionId]) return SEARCH_ACTION_LABELS[actionId]
  const structureAction = STRUCTURE_FIX_ACTIONS.find(function(item) { return item.id === actionId })
  return structureAction ? structureAction.label : actionId
}

function canFixHeaders(tune, issues) {
  const codes = (issues || []).map(function(item) { return item.code })
  return codes.some(function(code) {
    return code === 'missing_meter_header' || code === 'missing_key_header'
      || code === 'missing_meter' || code === 'missing_key'
  })
}

function addActionId(actionIds, actionId, groupId) {
  if (!actionId || !actionAllowedInGroup(actionId, groupId)) return
  actionIds.add(actionId)
}

function linkIndexFromIssueCode(code, prefix) {
  if (!code || code.indexOf(prefix) !== 0) return null
  const index = parseInt(code.slice(prefix.length), 10)
  return isNaN(index) ? null : index
}

function linkGroupActions(linkIssues) {
  const actions = []
  const seen = {}

  function addAction(action) {
    const key = action.id + ':' + (action.linkIndex != null ? action.linkIndex : '')
    if (seen[key]) return
    seen[key] = true
    actions.push(action)
  }

  ;(linkIssues || []).forEach(function(issueItem) {
    const code = issueItem && issueItem.code ? issueItem.code : ''
    if (code === 'no_links') {
      addAction({ id: 'editTuneLinks', label: 'Add playback link' })
      return
    }
    if (code.indexOf('link_failure_') === 0) {
      addAction({ id: 'editTuneLinks', label: 'Edit links' })
      return
    }
    if (code.indexOf('link_region_') === 0) {
      const linkIndex = linkIndexFromIssueCode(code, 'link_region_')
      if (linkIndex == null) return
      addAction({
        id: 'scanLinkRegion',
        label: 'Scan link ' + (linkIndex + 1) + ' region',
        linkIndex: linkIndex,
      })
    }
  })

  return actions
}

function actionsFromIssues(groupId, groupIssues, tune, abcTools) {
  const actionIds = new Set()

  groupIssues.forEach(function(issueItem) {
    const mapped = ISSUE_CODE_ACTIONS[issueItem.code] || []
    mapped.forEach(function(actionId) {
      if (actionId === 'sessionLineBreaks' && !canFixSessionLineBreaks(tune, abcTools)) return
      if (actionId === 'normalizeRepeatMarks' && !canNormalizeMelodyRepeatMarks(tune)) return
      if (actionId === 'fixStrainRepeatEnds' && !canFixStrainRepeatEndsInTune(tune)) return
      if (actionId === 'removeEmptyBars' && canFixStrainRepeatEndsInTune(tune)) return
      addActionId(actionIds, actionId, groupId)
    })
  })

  if (groupId === 'abcRecord' && canFixHeaders(tune, groupIssues)) {
    actionIds.add('fixHeaders')
  }

  if (groupId === 'notation' && needsNotationSearch(tune, groupIssues)) {
    actionIds.add('searchAbc')
  }

  if (groupId === 'chordsLyrics' && needsChordsLyricsSearch(tune, groupIssues)) {
    actionIds.add('searchChordsLyrics')
  }

  if (groupId === 'otherInfo') {
    if (needsBackgroundSearch(tune, groupIssues)) actionIds.add('backgroundInfo')
    if (needsTitleCapitalize(tune, groupIssues)) actionIds.add('capitalizeTitle')
  }

  return Array.from(actionIds).map(function(actionId) {
    return { id: actionId, label: labelForAction(actionId) }
  })
}

export function needsChordsLyricsSearch(tune, issues) {
  if (!tune) return false
  const codes = (issues || []).map(function(item) { return item.code })
  if (codes.some(function(code) { return CHORDS_LYRICS_ISSUE_CODES.has(code) || code === 'no_embedded_chords' })) {
    return true
  }
  return false
}

export function needsNotationSearch(tune, issues, options) {
  if (!tune) return false
  const opts = options || {}
  const codes = (issues || []).map(function(item) { return item.code })
  if (codes.some(function(code) {
    return NOTATION_MISSING_CODES.has(code) || code === 'empty_voice'
      || code === 'parse_failure' || code === 'render_failure'
  })) {
    return true
  }
  if (codes.indexOf('missing_title') >= 0) return true
  return !hasTuneNotation(tune, opts)
}

export function needsBackgroundSearch(tune, issues) {
  if (!tune) return false
  const codes = (issues || []).map(function(item) { return item.code })
  return codes.indexOf('missing_background') >= 0
}

export function needsTitleCapitalize(tune, issues) {
  if (!tune) return false
  const codes = (issues || []).map(function(item) { return item.code })
  return codes.indexOf('title_not_capitalized') >= 0
}

export function groupReportIssues(report) {
  const issues = collectReportIssuesForFixes(report)
  const grouped = {
    notation: [],
    abcRecord: [],
    chordsLyrics: [],
    otherInfo: [],
    links: [],
  }

  issues.forEach(function(issueItem) {
    const groupId = classifyIssue(issueItem)
    grouped[groupId].push(issueItem)
  })

  return grouped
}

export function buildBulkCheckIssueGroups(report, tune, tunebook, parseAndRender) {
  const issues = collectReportIssuesForFixes(report)
  const groupedIssues = groupReportIssues(report)
  const abcTools = tunebook && tunebook.abcTools ? tunebook.abcTools : null

  const groups = [
    {
      id: 'notation',
      title: 'Notation',
      issues: groupedIssues.notation,
      actions: actionsFromIssues('notation', groupedIssues.notation, tune, abcTools),
    },
    {
      id: 'abcRecord',
      title: 'ABC record',
      issues: groupedIssues.abcRecord,
      actions: actionsFromIssues('abcRecord', groupedIssues.abcRecord, tune, abcTools),
    },
    {
      id: 'chordsLyrics',
      title: 'Chords and lyrics',
      issues: groupedIssues.chordsLyrics,
      actions: actionsFromIssues('chordsLyrics', groupedIssues.chordsLyrics, tune, abcTools),
    },
    {
      id: 'otherInfo',
      title: 'Other information',
      issues: groupedIssues.otherInfo,
      actions: actionsFromIssues('otherInfo', groupedIssues.otherInfo, tune, abcTools),
    },
    {
      id: 'links',
      title: 'Links',
      issues: groupedIssues.links,
      actions: linkGroupActions(groupedIssues.links),
    },
  ]

  return groups.filter(function(group) {
    return group.issues.length > 0 || group.actions.length > 0
  })
}

export function listAvailableFixActionIds(report, tune, tunebook, parseAndRender) {
  const groups = buildBulkCheckIssueGroups(report, tune, tunebook, parseAndRender)
  const actionIds = new Set()
  groups.forEach(function(group) {
    group.actions.forEach(function(action) {
      if (BULK_CHECK_NAV_ACTIONS.has(action.id)) return
      actionIds.add(action.id)
    })
  })
  return Array.from(actionIds)
}

export function listFixAllActionIds(report, tune, tunebook, parseAndRender) {
  return listAvailableFixActionIds(report, tune, tunebook, parseAndRender).filter(function(actionId) {
    return !FIX_ALL_EXCLUDED_ACTIONS.has(actionId)
  })
}

export function canRunFixAll(tune, report, tunebook, parseAndRender) {
  return listFixAllActionIds(report, tune, tunebook, parseAndRender).length > 0
}

const TUNE_DIFF_FIELDS = [
  { key: 'name', label: 'Title' },
  { key: 'composer', label: 'Artist' },
  { key: 'meter', label: 'Time signature' },
  { key: 'key', label: 'Key' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'noteLength', label: 'Note length' },
  { key: 'rhythm', label: 'Rhythm' },
  { key: 'backgroundInfo', label: 'Background' },
]

function formatFieldValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function diffTuneFields(beforeTune, afterTune, abcTools) {
  const diffs = []
  TUNE_DIFF_FIELDS.forEach(function(field) {
    const beforeValue = formatFieldValue(beforeTune ? beforeTune[field.key] : '')
    const afterValue = formatFieldValue(afterTune ? afterTune[field.key] : '')
    if (beforeValue !== afterValue) {
      diffs.push({
        field: field.key,
        label: field.label,
        before: beforeValue,
        after: afterValue,
      })
    }
  })

  if (abcTools && typeof abcTools.json2abc === 'function') {
    const beforeAbc = beforeTune ? abcTools.json2abc(beforeTune) : ''
    const afterAbc = afterTune ? abcTools.json2abc(afterTune) : ''
    if (beforeAbc.trim() !== afterAbc.trim()) {
      diffs.push({
        field: 'abc',
        label: 'ABC notation',
        before: beforeAbc,
        after: afterAbc,
        multiline: true,
      })
    }
  }

  return diffs
}

export {
  SEARCH_ACTIONS,
  ISSUE_CODE_ACTIONS,
}
