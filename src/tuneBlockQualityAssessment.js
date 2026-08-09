/**
 * Pre-commit quality assessment for imported lyric/chord block structure.
 */
import { CHORD_MODES } from './tuneBlockModel'
import { hasLyricEmbeddedChords } from './chordSheetUtils'

const INLINE_CONFIDENCE_THRESHOLD = 0.65

/**
 * @returns {{ ok: boolean, issues: Array, recommendation: string, summary: string }}
 */
export function assessTuneBlockStructure(blocks, context) {
  const ctx = context || {}
  const list = Array.isArray(blocks) ? blocks : []
  const issues = []
  const strainCount = Number(ctx.strainCount) || 0

  if (!list.length) {
    return {
      ok: false,
      issues: [{ code: 'empty', message: 'No lyric sections were identified.' }],
      recommendation: 'lyrics_only',
      summary: 'No blocks',
    }
  }

  list.forEach(function(block, index) {
    const label = block.header || block.type || ('Section ' + (index + 1))
    if (!block.lyricLines || !block.lyricLines.length) {
      issues.push({
        code: 'header_only_repeat',
        blockIndex: index,
        message: label + ' has no words (display may copy from the first matching section).',
      })
    }
    if (block.chordMode === CHORD_MODES.NONE && strainCount > 0 && !hasLyricEmbeddedChords(block.lyricLines)) {
      issues.push({
        code: 'missing_chords',
        blockIndex: index,
        message: label + ' has lyrics but no chord chart or inline chords.',
      })
    }
    if ((block.warnings || []).indexOf('strain_lyric_count_mismatch') >= 0) {
      issues.push({
        code: 'strain_lyric_count_mismatch',
        blockIndex: index,
        message: 'Lyric section count does not match melody strain count.',
      })
    }
    if ((block.warnings || []).indexOf('extra_chart_attached') >= 0) {
      issues.push({
        code: 'orphan_chart',
        blockIndex: index,
        message: 'Extra chord chart block is attached to the last lyric section.',
      })
    }
  })

  if (strainCount > 0 && list.length !== strainCount) {
    const hymnLike = list.length > strainCount
      && list.filter(function(b) { return b.chartRevisit || b.chordMode === CHORD_MODES.REVISIT; }).length > 0
    if (!hymnLike) {
      issues.push({
        code: 'block_count_mismatch',
        message: list.length + ' lyric sections but ' + strainCount + ' melody strains.',
      })
    }
  }

  const inlineDominant = list.some(function(block) {
    return block.chordMode === CHORD_MODES.INLINE
      || hasLyricEmbeddedChords(block.lyricLines)
  })
  const lowConfidence = list.some(function(block) {
    return (block.confidence || 1) < INLINE_CONFIDENCE_THRESHOLD
  })
  const mismatch = issues.some(function(issue) {
    return issue.code === 'block_count_mismatch' || issue.code === 'strain_lyric_count_mismatch'
  })

  let recommendation = 'grid_merge'
  if (inlineDominant || lowConfidence || mismatch) {
    recommendation = 'inline_preserve'
  }
  if (!list.some(function(b) { return b.chordChart || b.chordMode !== CHORD_MODES.NONE; })) {
    recommendation = 'lyrics_only'
  }

  const summary = issues.length
    ? issues.length + ' structure note(s) — review before import.'
    : 'Block structure looks consistent.'

  return {
    ok: issues.length === 0,
    issues: issues,
    recommendation: recommendation,
    summary: summary,
  }
}

export function recommendationLabel(recommendation) {
  switch (recommendation) {
    case 'inline_preserve':
      return 'Keep inline chords (recommended)'
    case 'lyrics_only':
      return 'Import lyrics only'
    case 'grid_merge':
      return 'Merge chord grid into notation'
    default:
      return 'Review structure'
  }
}
