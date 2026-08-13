/**
 * Corpus audit for tune block structure analysis.
 * Treats stored lyrics as ground truth and critiques parser output.
 */
import { blocksFromTune } from './tuneBlockModel'
import { assessTuneBlockStructure } from './tuneBlockQualityAssessment'
import { lyricLinesForChecks } from './tuneDisplayLayers'
import {
  classifyLyricChordLines,
  isSectionHeader,
  hasLyricEmbeddedChords,
  normalizeLyricBlocks,
  normalizeStanzaNameKey,
  shouldSoftJoinSingleBlanks,
  lineHasChordProInlineChords,
  parseChordProInlineLyricLine,
  isLeadingTitleComposerLine,
} from './chordSheetUtils'
import { stripNoteSpacingFromLine, lyricLineHasNoteSpacing } from './wLinesUtils'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { noteLinesForMelodyMerge, splitMelodyStrainsWithBarlines } from './chordBlockMerge'

function normalizeSourceLine(line) {
  const raw = String(line == null ? '' : line)
  if (lineHasChordProInlineChords(raw)) {
    return parseChordProInlineLyricLine(raw)
      .map(function(token) { return token.text })
      .join('')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const stripped = lyricLineHasNoteSpacing(raw) ? stripNoteSpacingFromLine(raw) : raw
  return stripped.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function lineKeysMatch(a, b) {
  const left = normalizeStanzaNameKey(a)
  const right = normalizeStanzaNameKey(b)
  if (left && right && left === right) return true
  return normalizeSourceLine(a) === normalizeSourceLine(b)
}

function nonEmptySourceLines(sourceLines) {
  return (Array.isArray(sourceLines) ? sourceLines : [])
    .map(function(line, index) {
      const classified = classifyLyricChordLines([line])[0]
      const normalized = normalizeSourceLine(line)
      return {
        index: index,
        type: classified ? classified.type : 'lyric',
        text: normalized,
        key: normalizeStanzaNameKey(normalized),
        raw: String(line == null ? '' : line),
      }
    })
    .filter(function(item) { return item.text.length > 0 })
}

function sourceLineKeySet(sourceLines) {
  const keys = new Set()
  nonEmptySourceLines(sourceLines).forEach(function(item) {
    if (item.key) keys.add(item.key)
  })
  return keys
}

function flattenBlocksForCritique(blocks, sourceKeys) {
  const lines = []
  ;(Array.isArray(blocks) ? blocks : []).forEach(function(block) {
    const header = String(block && block.header || '').trim()
    if (header) {
      const key = normalizeStanzaNameKey(header)
      if (sourceKeys.has(key)) {
        lines.push({ kind: 'header', text: normalizeSourceLine(header), key: key })
      }
    }
    ;(block && block.lyricLines || []).forEach(function(line) {
      const classified = classifyLyricChordLines([line])[0]
      if (classified && classified.type === 'chord') return
      const normalized = normalizeSourceLine(line)
      if (normalized) {
        lines.push({
          kind: 'lyric',
          text: normalized,
          key: normalizeStanzaNameKey(normalized),
        })
      }
    })
  })
  return lines
}

function expectedStanzaCount(sourceLines) {
  const blocks = normalizeLyricBlocks(sourceLines)
  return blocks.filter(function(block) {
    return Array.isArray(block) && block.some(function(line) {
      return String(line || '').trim().length > 0
    })
  }).length
}

function isOptionalPrefaceLine(item, output, context) {
  if (item.type === 'chord') return false
  if (findOutputMatch(output, item, new Set()) >= 0) return false

  if (isLeadingTitleComposerLine(item.raw, {
    title: context && context.tuneName,
    composer: context && context.composer,
  })) {
    return true
  }

  if (context && context.tuneName && lineKeysMatch(item.text, context.tuneName)) {
    return findOutputMatch(output, item, new Set()) < 0
  }

  return false
}

function findOutputMatch(output, item, usedOutputIndexes) {
  for (let index = 0; index < output.length; index++) {
    if (usedOutputIndexes.has(index)) continue
    const candidate = output[index]
    if (lineKeysMatch(candidate.text, item.text) || (item.key && candidate.key === item.key)) {
      return index
    }
  }
  return -1
}

/**
 * Tag lyric sheet patterns for corpus reporting.
 */
export function classifyLyricPattern(sourceLines) {
  const lines = Array.isArray(sourceLines) ? sourceLines : []
  const tags = []
  const classified = classifyLyricChordLines(lines)

  if (shouldSoftJoinSingleBlanks(lines)) tags.push('double_spaced')
  if (classified.some(function(item) { return item.type === 'header' })) tags.push('section_label')
  if (hasLyricEmbeddedChords(lines)) tags.push('inline_chords')
  if (classified.some(function(item) { return item.type === 'chord' })) tags.push('chord_only_lines')
  if (lines.some(function(line) { return /\t/.test(String(line || '')) })) tags.push('tab_aligned')
  if (classified.filter(function(item) { return item.type === 'lyric' }).length >= 3
    && expectedStanzaCount(lines) >= 3
    && blocksAreSingleLineStanzas(lines)) {
    tags.push('hymn_single_line')
  }
  if (!tags.length) tags.push('plain_stanza')
  return tags
}

function blocksAreSingleLineStanzas(lines) {
  const blocks = normalizeLyricBlocks(lines)
  return blocks.every(function(block) {
    const body = block.filter(function(line) { return !isSectionHeader(line) })
    return body.filter(function(line) { return String(line || '').trim() }).length <= 1
  })
}

/**
 * Critique parser blocks against stored lyric lines (source of truth).
 * @returns {{ ok: boolean, issues: Array, sensibility: Object }}
 */
export function critiqueBlocksAgainstLyrics(sourceLines, blocks, context) {
  const ctx = context || {}
  const issues = []
  const sourceKeys = sourceLineKeySet(sourceLines)
  const source = nonEmptySourceLines(sourceLines).filter(function(item) {
    return item.type !== 'chord'
  })
  const output = flattenBlocksForCritique(blocks, sourceKeys)

  if (!source.length) {
    return {
      ok: !output.length,
      issues: output.length ? [{ code: 'unexpected_blocks', message: 'Parser produced blocks but source has no lyrics.' }] : [],
      sensibility: {},
    }
  }

  const usedOutputIndexes = new Set()
  let lastOutputIndex = -1

  source.forEach(function(item) {
    if (isOptionalPrefaceLine(item, output, ctx)) return

    const matchIndex = findOutputMatch(output, item, usedOutputIndexes)
    if (matchIndex < 0) {
      issues.push({
        code: item.type === 'header' ? 'missing_header' : 'missing_line',
        sourceIndex: item.index,
        message: 'Source line not found in block output: "' + item.text.slice(0, 60) + '"',
      })
      return
    }
    if (matchIndex < lastOutputIndex) {
      issues.push({
        code: 'order_violation',
        sourceIndex: item.index,
        message: 'Block output order does not match source at: "' + item.text.slice(0, 60) + '"',
      })
    }
    usedOutputIndexes.add(matchIndex)
    lastOutputIndex = matchIndex
  })

  output.forEach(function(item, index) {
    if (!usedOutputIndexes.has(index)) {
      issues.push({
        code: 'phantom_line',
        outputIndex: index,
        message: 'Block output contains line not in source: "' + item.text.slice(0, 60) + '"',
      })
    }
  })

  const stanzaCount = expectedStanzaCount(sourceLines)
  const blockCount = (Array.isArray(blocks) ? blocks : []).length
  const sensibility = {
    stanzaCount: stanzaCount,
    blockCount: blockCount,
    overSplitting: blockCount > stanzaCount * 1.5 && stanzaCount > 0,
    underSplitting: blockCount < Math.max(1, stanzaCount * 0.5) && stanzaCount > 1,
  }

  if (sensibility.overSplitting) {
    issues.push({
      code: 'over_splitting',
      message: blockCount + ' blocks vs ' + stanzaCount + ' expected stanzas.',
    })
  }
  if (sensibility.underSplitting) {
    issues.push({
      code: 'under_splitting',
      message: blockCount + ' blocks vs ' + stanzaCount + ' expected stanzas.',
    })
  }

  ;(Array.isArray(blocks) ? blocks : []).forEach(function(block, index) {
    const classified = classifyLyricChordLines(block && block.lyricLines || [])
    const chordOnlyBlock = classified.some(function(item) { return item.type === 'chord' })
      && !classified.some(function(item) { return item.type === 'lyric' })
      && !String(block && block.header || '').trim()
    if (chordOnlyBlock) {
      issues.push({
        code: 'orphan_chord_row',
        blockIndex: index,
        message: 'Chord-only row formed a standalone block without lyrics.',
      })
    }
  })

  return {
    ok: issues.length === 0,
    issues: issues,
    sensibility: sensibility,
  }
}

function strainCountForTune(tune) {
  const voices = tune && tune.voices || {}
  const voiceKey = resolvePrimaryVoiceKey(voices)
  const noteLines = noteLinesForMelodyMerge(
    voices[voiceKey] && Array.isArray(voices[voiceKey].notes) ? voices[voiceKey].notes : []
  )
  return splitMelodyStrainsWithBarlines(noteLines).length
}

/**
 * How lyric section blocks relate to ABC melody strains.
 *
 * Buckets:
 * - instrumental: no lyrics
 * - lyrics_no_melody: lyrics but no melody strains in ABC
 * - aligned: block count matches strain count (1:1 progression mapping)
 * - hymn_like: one melody strain, many lyric blocks (revisit/hymn pattern)
 * - one_progression: one strain, many lyric blocks without revisit markers
 * - pop_mismatch: more lyric blocks than strains (typical verse/chorus repeats)
 * - strain_heavy: more strains than lyric blocks
 */
export function classifyStrainLyricMapping(blockCount, strainCount, blocks) {
  const list = Array.isArray(blocks) ? blocks : []
  const blocksN = Math.max(0, Number(blockCount) || 0)
  const strainsN = Math.max(0, Number(strainCount) || 0)
  const ratio = strainsN > 0 ? blocksN / strainsN : null
  const hasRevisitBlocks = list.some(function(block) {
    return block && (block.chartRevisit || block.chordMode === 'revisit')
  })
  const revisitAfterFirst = blocksN > strainsN && list.length > 1
    && list.every(function(block, index) {
      if (index === 0) return true
      return block && (block.chartRevisit || block.chordMode === 'revisit')
    })

  let bucket = 'instrumental'
  let description = 'No lyrics to map.'

  if (blocksN > 0 && strainsN === 0) {
    bucket = 'lyrics_no_melody'
    description = 'Lyrics present but ABC has no melody strains.'
  } else if (blocksN > 0 && strainsN > 0) {
    if (blocksN === strainsN) {
      bucket = 'aligned'
      description = 'Lyric sections match melody strain count.'
    } else if (strainsN === 1 && blocksN > 1) {
      if (hasRevisitBlocks || revisitAfterFirst) {
        bucket = 'hymn_like'
        description = 'One progression with many lyric stanzas (hymn/revisit).'
      } else {
        bucket = 'one_progression'
        description = 'One ABC progression with many written lyric sections.'
      }
    } else if (blocksN > strainsN) {
      bucket = 'pop_mismatch'
      description = 'More lyric sections than melody strains (repeated chorus/verse blocks).'
    } else {
      bucket = 'strain_heavy'
      description = 'More melody strains than lyric sections.'
    }
  }

  const outlier = blocksN > 0 && strainsN > 0 && (
    blocksN >= 15
    || ratio >= 3
    || (strainsN === 1 && blocksN >= 8)
  )

  return {
    bucket: bucket,
    description: description,
    blockCount: blocksN,
    strainCount: strainsN,
    ratio: ratio,
    outlier: outlier,
    hasRevisitBlocks: hasRevisitBlocks,
  }
}

/**
 * Full audit for one tune snapshot.
 */
export function auditTuneBlockStructure(tune) {
  const sourceLines = lyricLinesForChecks(tune || {})
  const hasLyrics = sourceLines.some(function(line) { return String(line || '').trim().length > 0 })
  const blocks = blocksFromTune(tune, { lyricLines: sourceLines })
  const strainCount = strainCountForTune(tune)
  const assessment = assessTuneBlockStructure(blocks, { strainCount: strainCount })
  const critique = critiqueBlocksAgainstLyrics(sourceLines, blocks, {
    tuneName: tune && tune.name,
    composer: tune && tune.composer,
  })
  const patterns = hasLyrics ? classifyLyricPattern(sourceLines) : ['no_lyrics']
  const strainLyric = hasLyrics
    ? classifyStrainLyricMapping(blocks.length, strainCount, blocks)
    : classifyStrainLyricMapping(0, strainCount, [])

  return {
    tuneId: tune && tune.id,
    tuneName: tune && tune.name,
    hasLyrics: hasLyrics,
    patterns: patterns,
    blockCount: blocks.length,
    strainCount: strainCount,
    strainLyric: strainLyric,
    blocks: blocks,
    assessment: assessment,
    critique: critique,
    ok: hasLyrics ? critique.ok : true,
  }
}

/**
 * Batch audit with aggregate stats.
 */
export function auditCorpus(tunes, options) {
  const opts = options || {}
  const list = Array.isArray(tunes) ? tunes : []
  const results = []
  const byPattern = Object.create(null)
  const byIssueCode = Object.create(null)
  const byStrainLyricBucket = Object.create(null)
  const issueCounts = Object.create(null)
  const strainLyricOutliers = []
  let lyricsCount = 0
  let passCount = 0
  let failCount = 0
  let skippedCount = 0

  list.forEach(function(tune) {
    const result = auditTuneBlockStructure(tune)
    if (!result.hasLyrics) {
      skippedCount += 1
      const bucket = 'instrumental'
      if (!byStrainLyricBucket[bucket]) byStrainLyricBucket[bucket] = 0
      byStrainLyricBucket[bucket] += 1
      if (opts.includeInstrumental) results.push(result)
      return
    }
    lyricsCount += 1
    if (result.ok) passCount += 1
    else failCount += 1
    results.push(result)

    const mapping = result.strainLyric || {}
    const bucket = mapping.bucket || 'unknown'
    if (!byStrainLyricBucket[bucket]) byStrainLyricBucket[bucket] = 0
    byStrainLyricBucket[bucket] += 1
    if (mapping.outlier && strainLyricOutliers.length < (opts.maxOutlierExamples || 15)) {
      strainLyricOutliers.push({
        tuneId: result.tuneId,
        tuneName: result.tuneName,
        blockCount: mapping.blockCount,
        strainCount: mapping.strainCount,
        ratio: mapping.ratio,
        bucket: mapping.bucket,
      })
    }

    result.patterns.forEach(function(pattern) {
      if (!byPattern[pattern]) byPattern[pattern] = { total: 0, pass: 0, fail: 0 }
      byPattern[pattern].total += 1
      if (result.ok) byPattern[pattern].pass += 1
      else byPattern[pattern].fail += 1
    })

    if (!result.ok) {
      result.critique.issues.forEach(function(issue) {
        const code = issue.code || 'unknown'
        issueCounts[code] = (issueCounts[code] || 0) + 1
        if (!byIssueCode[code]) byIssueCode[code] = []
        if (byIssueCode[code].length < (opts.maxExamplesPerIssue || 5)) {
          byIssueCode[code].push({
            tuneId: result.tuneId,
            tuneName: result.tuneName,
            message: issue.message,
            patterns: result.patterns,
          })
        }
      })
    }
  })

  const passRate = lyricsCount > 0 ? passCount / lyricsCount : 1

  return {
    totalTunes: list.length,
    lyricsTunes: lyricsCount,
    skippedTunes: skippedCount,
    passCount: passCount,
    failCount: failCount,
    passRate: passRate,
    issueCounts: issueCounts,
    byPattern: byPattern,
    byStrainLyricBucket: byStrainLyricBucket,
    strainLyricOutliers: strainLyricOutliers,
    byIssueCode: byIssueCode,
    failures: results.filter(function(r) { return r.hasLyrics && !r.ok }),
    results: opts.includeAll ? results : undefined,
  }
}

/**
 * Summarize audit for CLI / reports (strip heavy block payloads).
 */
export function summarizeAuditReport(report) {
  return {
    totalTunes: report.totalTunes,
    lyricsTunes: report.lyricsTunes,
    skippedTunes: report.skippedTunes,
    passCount: report.passCount,
    failCount: report.failCount,
    passRate: report.passRate,
    issueCounts: report.issueCounts,
    byPattern: report.byPattern,
    byStrainLyricBucket: report.byStrainLyricBucket,
    strainLyricOutliers: report.strainLyricOutliers,
    byIssueCode: report.byIssueCode,
    failures: (report.failures || []).map(function(item) {
      return {
        tuneId: item.tuneId,
        tuneName: item.tuneName,
        patterns: item.patterns,
        blockCount: item.blockCount,
        strainCount: item.strainCount,
        strainLyric: item.strainLyric,
        issues: item.critique.issues,
        assessmentIssues: item.assessment.issues,
      }
    }),
  }
}
