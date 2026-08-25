import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { formatTuneDisplayName } from './tuneDisplayName'
import { splitIntoBlocks } from './chordSheetUtils'
import { firstOccurrenceLyricSectionCount } from './lyricStructureUtils'
import {
  buildNotationLineBarMap,
  detectBarsPerLyricLine,
  flattenMelodyText,
  splitMelodyIntoBlocks,
} from './lyricBarAlignmentUtils'
import {
  buildNotationWLines,
  countLyricSlotsInNoteLine,
} from './noteSpacingUtils'
import { suggestCompletenessPath } from './tuneCompletenessCheck'
import { getLyricLines } from './wLinesUtils'

function issue(code, message, severity, extras) {
  return Object.assign({
    code: code,
    message: message,
    severity: severity || 'warning',
    field: 'lyrics',
  }, extras || {})
}

function getNoteLines(tune) {
  if (!tune || !tune.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  return voice && Array.isArray(voice.notes) ? voice.notes : []
}

function lyricBlockCount(tune) {
  const lyrics = getLyricLines(tune)
  const blocks = splitIntoBlocks(lyrics)
  return blocks.filter(function(block) {
    return block.some(function(line) { return String(line || '').trim().length > 0 })
  }).length
}

function countWLineSlots(wLine) {
  const text = String(wLine || '').trim()
  if (!text) return 0
  return text.split(/\s+/).filter(function(token) { return token.length > 0 }).length
}

function hasStoredWLines(tune) {
  return Array.isArray(tune.wLines) && tune.wLines.some(function(line) {
    return String(line || '').trim().length > 0
  })
}

function checkWLineCountMismatch(noteLines, wLines) {
  if (!hasStoredWLines({ wLines: wLines })) return null
  if (noteLines.length !== wLines.length) {
    return issue(
      'wline_count_mismatch',
      'Lyric lines (' + wLines.length + ') do not match notation staff lines (' + noteLines.length + ')',
      'warning'
    )
  }
  return null
}

function checkLyricNoteMisalignment(tune, noteLines, wLines) {
  const issues = []
  const opts = {
    meter: tune.meter,
    noteLength: tune.noteLength,
    key: tune.key,
  }
  const limit = Math.max(noteLines.length, wLines.length)
  for (let i = 0; i < limit; i += 1) {
    const wLine = i < wLines.length ? wLines[i] : ''
    const noteLine = i < noteLines.length ? noteLines[i] : ''
    if (!String(wLine || '').trim() || !String(noteLine || '').trim()) continue
    const noteSlots = countLyricSlotsInNoteLine(noteLine, opts)
    const wSlots = countWLineSlots(wLine)
    if (noteSlots > 0 && wSlots > 0 && noteSlots !== wSlots) {
      issues.push(issue(
        'lyric_note_misalignment',
        'Staff line ' + (i + 1) + ': ' + wSlots + ' lyric syllables for ' + noteSlots + ' notes',
        'warning',
        { lineIndex: i }
      ))
    }
  }
  return issues
}

function checkStaleWLines(tune, noteLines) {
  if (!hasStoredWLines(tune)) return null
  const stored = tune.wLines.map(function(line) { return String(line || '') })
  const regenerated = buildNotationWLines(tune)
  if (stored.length !== regenerated.length) {
    return issue(
      'stale_wlines',
      'Stored w: lyrics may be out of date after melody edits',
      'warning'
    )
  }
  for (let i = 0; i < stored.length; i += 1) {
    const a = stored[i].replace(/\s+/g, ' ').trim()
    const b = String(regenerated[i] || '').replace(/\s+/g, ' ').trim()
    if (a && b && a !== b) {
      return issue(
        'stale_wlines',
        'Stored w: lyrics on staff line ' + (i + 1) + ' may be out of date after melody edits',
        'warning',
        { lineIndex: i }
      )
    }
  }
  return null
}

function checkVisualLineBreakMidBar(noteLines) {
  const issues = []
  if (!Array.isArray(noteLines) || noteLines.length <= 1) return issues
  const barlineEndRe = /\|(?:\]|[:])?|\|\||:\|:\s*$/
  for (let i = 0; i < noteLines.length - 1; i += 1) {
    const line = String(noteLines[i] || '').trim()
    if (!line) continue
    if (!barlineEndRe.test(line)) {
      issues.push(issue(
        'visual_line_break_mid_bar',
        'Notation line ' + (i + 1) + ' may break mid-bar (no barline at line end)',
        'info',
        { lineIndex: i }
      ))
      break
    }
  }
  return issues
}

function checkStrainLyricCount(tune, noteLines) {
  const melodyBlocks = splitMelodyIntoBlocks(noteLines).length
  const lyricsBlocks = firstOccurrenceLyricSectionCount(getLyricLines(tune), {
    title: tune.name,
    composer: tune.composer,
  })
  // One melody chart + several lyric verses is normal (hymns / folk songs).
  // Only flag when both sides have multiple blocks and the counts disagree.
  if (lyricsBlocks > 1 && melodyBlocks > 1 && lyricsBlocks !== melodyBlocks) {
    return issue(
      'strain_lyric_count_mismatch',
      'Lyric sections (' + lyricsBlocks + ') and melody strains (' + melodyBlocks + ') differ',
      'warning'
    )
  }
  return null
}

function checkLyricLineBarRatio(tune, noteLines) {
  const lyricLines = getLyricLines(tune).filter(function(line) {
    return String(line || '').trim().length > 0
  })
  if (lyricLines.length < 2) return null
  const barMap = buildNotationLineBarMap(noteLines)
  const barCount = barMap.reduce(function(sum, row) { return sum + row.barCount }, 0)
  if (barCount < 2) return null
  const barsPerLine = detectBarsPerLyricLine(lyricLines.length, barCount, [])
  const evenScore = Math.abs(barsPerLine - Math.round(barCount / lyricLines.length))
  if (evenScore > 1) {
    return issue(
      'lyric_line_bar_ratio_suspect',
      'Chord/lyric line ratio may not match melody (' + barsPerLine + ' bars per lyric line)',
      'info'
    )
  }
  return null
}

function checkHymnSingleChartUnmarked(tune, noteLines) {
  const melodyBlocks = splitMelodyIntoBlocks(noteLines).length
  const lyricsBlocks = lyricBlockCount(tune)
  if (lyricsBlocks !== 1 || melodyBlocks <= 1) return null
  if (/\|\|/.test(flattenMelodyText(noteLines))) return null
  return issue(
    'hymn_single_chart_unmarked',
    'One lyric block over ' + melodyBlocks + ' melody strains — consider || strain markers',
    'info'
  )
}

function checkInterleavedWSpacing(tune, noteLines, wLines) {
  if (suggestCompletenessPath(tune) !== 'B') return null
  const singable = getLyricLines(tune).filter(function(line) {
    return String(line || '').trim().length > 0
  })
  if (singable.length === 0) return null
  if (!hasStoredWLines(tune)) return null
  const opts = {
    meter: tune.meter,
    noteLength: tune.noteLength,
    key: tune.key,
  }
  let needsSpacing = false
  noteLines.forEach(function(noteLine, index) {
    const wLine = index < wLines.length ? wLines[index] : ''
    if (!String(wLine || '').trim()) return
    const slots = countLyricSlotsInNoteLine(noteLine, opts)
    if (slots > 1 && countWLineSlots(wLine) <= 1 && !/\s{2,}/.test(wLine) && !/-\s/.test(wLine)) {
      needsSpacing = true
    }
  })
  if (needsSpacing) {
    return issue(
      'interleaved_w_spacing',
      'w: lyrics may need note-spacing for under-staff display',
      'info'
    )
  }
  return null
}

export function checkTuneLyricsAlignment(tune, options) {
  const opts = options || {}
  if (!tune || !tune.id) return null

  const noteLines = getNoteLines(tune)
  if (noteLines.length === 0) return null

  const wLines = Array.isArray(tune.wLines) ? tune.wLines : []
  const issues = []

  const wCountIssue = checkWLineCountMismatch(noteLines, wLines)
  if (wCountIssue) issues.push(wCountIssue)

  issues.push.apply(issues, checkLyricNoteMisalignment(tune, noteLines, wLines))

  const staleIssue = checkStaleWLines(tune, noteLines)
  if (staleIssue) issues.push(staleIssue)

  issues.push.apply(issues, checkVisualLineBreakMidBar(noteLines))

  const strainIssue = checkStrainLyricCount(tune, noteLines)
  if (strainIssue) issues.push(strainIssue)

  const ratioIssue = checkLyricLineBarRatio(tune, noteLines)
  if (ratioIssue) issues.push(ratioIssue)

  const hymnIssue = checkHymnSingleChartUnmarked(tune, noteLines)
  if (hymnIssue) issues.push(hymnIssue)

  const spacingIssue = checkInterleavedWSpacing(tune, noteLines, wLines)
  if (spacingIssue) issues.push(spacingIssue)

  if (issues.length === 0) return null

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    composer: tune.composer || '',
    issues: issues,
  }
}

export function checkTunesLyricsAlignment(tunes, options) {
  if (!Array.isArray(tunes)) return []
  return tunes
    .map(function(tune) { return checkTuneLyricsAlignment(tune, options) })
    .filter(Boolean)
}
