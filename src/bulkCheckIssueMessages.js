/**
 * User-facing issue text for bulk check, including hints for available fix buttons.
 */
export const ISSUE_FIX_HINTS = {
  missing_background: 'Try Search background.',
  missing_composer: 'Try Search chords and lyrics or Search background.',
  missing_title: 'Try Search notation or Search chords and lyrics.',
  title_not_capitalized: 'Try Capitalise title.',
  missing_tempo: 'Try Sync fields from ABC headers.',
  missing_meter_header: 'Try Fix missing headers.',
  missing_key_header: 'Try Fix missing headers.',
  missing_meter: 'Try Fix missing headers.',
  missing_key: 'Try Fix missing headers.',
  header_field_mismatch: 'Try Sync fields from ABC headers.',
  no_lyrics: 'Try Search chords and lyrics.',
  no_chord_layout: 'Try Search chords and lyrics.',
  stanza_chord_mismatch: 'Try Search chords and lyrics.',
  no_embedded_chords: 'Try Search chords and lyrics.',
  no_melody: 'Try Search notation.',
  empty_voice: 'Try Search notation.',
  parse_failure: 'Try Search notation or Normalize ABC.',
  render_failure: 'Try Search notation or Normalize ABC.',
  render_warning: 'Try Normalize ABC.',
  round_trip_drift: 'Try Normalize ABC (review before applying).',
  session_linebreak_markers: 'Try Fix Session ! line breaks.',
  stanza_strain_mismatch: 'Try Insert stanza double bar lines.',
  stanza_barlines: 'Try Insert stanza double bar lines.',
  repeat_style_mixed: 'Try Normalize repeat mark spacing.',
  missing_final_barline: 'Try Append final bar line (review before applying).',
  blocked_practice: 'Try Allow practice.',
  missing_practice_instruments: 'Try Set practice instruments.',
  no_links: 'Try Add playback link.',
}

export const ISSUE_MANUAL_HINTS = {
  unmatched_repeat_start: 'Edit tune to fix repeat marks.',
  unmatched_repeat_end: 'Edit tune to fix repeat marks.',
  truncated_repeat: 'Edit tune to close open repeats.',
  ending_without_repeat: 'Edit tune to fix first/second endings.',
  ending_bar_mismatch: 'Edit tune to balance ending bar counts.',
  overfull_bar: 'Edit tune to remove extra notes from the bar.',
  underfull_bar: 'Edit tune to complete the bar.',
  voice_bar_count_mismatch: 'Edit tune to align voice lengths.',
  secondary_voice_empty: 'Edit tune to add notes or remove the empty voice.',
  anacrusis_inconsistent: 'Edit tune to fix pickup timing.',
  empty_bar: 'Edit tune to add notes or rests.',
  unexpected_melody: 'Edit tune or switch to a melody layout.',
  sparse_melody: 'Edit tune to fill in missing melody bars.',
  chord_scaffold_in_melody: 'Edit tune to separate chord scaffold from melody.',
}

function hintForIssueCode(code) {
  if (!code) return ''
  if (ISSUE_FIX_HINTS[code]) return ISSUE_FIX_HINTS[code]
  if (ISSUE_MANUAL_HINTS[code]) return ISSUE_MANUAL_HINTS[code]
  if (code.indexOf('link_region_') === 0) return 'Try Scan link region.'
  if (code.indexOf('link_failure_') === 0) return 'Try Edit links.'
  return ''
}

export function formatBulkCheckIssueMessage(issue) {
  if (!issue) return ''
  const base = issue.message || ''
  const hint = hintForIssueCode(issue.code)
  if (!hint) return base
  if (base.indexOf(hint) >= 0) return base
  return base + ' ' + hint
}
