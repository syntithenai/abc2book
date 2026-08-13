/**
 * Chord readiness classification, audit reporting, and safe auto-fix planning
 * for song-book tunes (structured blocks + ABC notation with chords).
 */
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'
import { getLyricLines } from './wLinesUtils'
import { formatTuneDisplayName } from './tuneDisplayName'
import {
  hasChordLines,
  hasLyricEmbeddedChords,
  isSectionHeader,
  chordSectionLabelsUsableForMatching,
} from './chordSheetUtils'
import {
  auditTuneBlockStructure,
} from './tuneBlockCorpusAudit'
import { CHORD_MODES } from './tuneBlockModel'
import {
  checkPathA,
  checkPathB,
  suggestCompletenessPath,
} from './tuneCompletenessCheck'
import {
  buildTuneCheckReport,
  collectReportIssuesForFixes,
} from './tuneBulkCheckReport'
import {
  applyStructureFix,
  getAvailableStructureFixes,
  STRUCTURE_FIX_ACTIONS,
} from './tuneAbcStructureFix'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  noteLinesForMelodyMerge,
  splitMelodyStrainsWithBarlines,
  syncChordSectionLabelsFromPrimaryVoice,
} from './chordBlockMerge'
import { chordSectionLabelsFromSections } from './chordsEditorSections'
import { lyricLinesForChecks } from './tuneDisplayLayers'
import { resolveChordRenderPlan } from './chordLyricRenderPlan'
import { melodyHasAnacrusisDoubleBarlines } from './melodyBarlineNormalize'

export const CHORD_READINESS_TAG_PREFIX = 'chords:'

export const CHORD_READINESS_TAGS = {
  READY: 'chords:ready',
  DISPLAY_READY: 'chords:display-ready',
  INLINE_ONLY: 'chords:inline-only',
  SCAFFOLD_INCOMPLETE: 'chords:scaffold-incomplete',
  NEEDS_SOURCE: 'chords:needs-source',
  STRUCTURE_REVIEW: 'chords:structure-review',
  MELODY_NO_CHORDS: 'chords:melody-no-chords',
  STRAIN_MISMATCH: 'chords:strain-mismatch',
  HYMN_LIKE: 'chords:hymn-like',
  GRID_MERGE_CANDIDATE: 'chords:grid-merge-candidate',
  SYNC_LABELS: 'chords:sync-labels',
  ANACRUSIS_REVIEW: 'chords:anacrusis-review',
}

export const CHORD_READINESS_ATTENTION_TAGS = [
  CHORD_READINESS_TAGS.INLINE_ONLY,
  CHORD_READINESS_TAGS.SCAFFOLD_INCOMPLETE,
  CHORD_READINESS_TAGS.NEEDS_SOURCE,
  CHORD_READINESS_TAGS.STRUCTURE_REVIEW,
  CHORD_READINESS_TAGS.MELODY_NO_CHORDS,
  CHORD_READINESS_TAGS.STRAIN_MISMATCH,
  CHORD_READINESS_TAGS.HYMN_LIKE,
  CHORD_READINESS_TAGS.GRID_MERGE_CANDIDATE,
  CHORD_READINESS_TAGS.SYNC_LABELS,
  CHORD_READINESS_TAGS.ANACRUSIS_REVIEW,
]

export const CHORD_READINESS_RECOMMENDED_QUEUE = [
  'chords:structure-review',
  'chords:anacrusis-review',
  'chords:sync-labels',
  'chords:grid-merge-candidate (scaffold-only auto-fix)',
  'chords:inline-only',
  'chords:melody-no-chords',
  'chords:needs-source',
]

const HIGH_PRIORITY_HYGIENE_TAGS = new Set([
  CHORD_READINESS_TAGS.STRUCTURE_REVIEW,
  CHORD_READINESS_TAGS.NEEDS_SOURCE,
  CHORD_READINESS_TAGS.SCAFFOLD_INCOMPLETE,
  CHORD_READINESS_TAGS.ANACRUSIS_REVIEW,
])

const INFORMATIONAL_ATTENTION_TAGS = new Set([
  CHORD_READINESS_TAGS.STRAIN_MISMATCH,
  CHORD_READINESS_TAGS.HYMN_LIKE,
])

export const CHORD_READINESS_STATUSES = {
  READY: 'ready',
  INLINE_ONLY: 'inline_only',
  SCAFFOLD_INCOMPLETE: 'scaffold_incomplete',
  LYRICS_NO_CHORDS: 'lyrics_no_chords',
  STRUCTURE_MISMATCH: 'structure_mismatch',
  MELODY_NO_CHORDS: 'melody_no_chords',
  INSTRUMENTAL: 'instrumental',
  SKIPPED: 'skipped',
}

const STRUCTURE_MISMATCH_CODES = new Set([
  'block_count_mismatch',
  'orphan_chart',
  'strain_lyric_count_mismatch',
  'header_only_repeat',
  'stanza_chord_mismatch',
])

const STRAIN_MISMATCH_BUCKETS = new Set(['pop_mismatch', 'strain_heavy'])
const TIER_A_STRUCTURE_IDS = STRUCTURE_FIX_ACTIONS
  .filter(function(action) { return action.tier === 'a' })
  .map(function(action) { return action.id })

function getNoteLines(tune) {
  if (!tune || !tune.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  return voice && Array.isArray(voice.notes) ? voice.notes : []
}

function singableLyricLines(tune) {
  return getLyricLines(tune).filter(function(line) {
    return String(line || '').trim().length > 0 && !isSectionHeader(line)
  })
}

function noteLinesHaveAbcChords(noteLines, hasChordsFn) {
  const text = Array.isArray(noteLines) ? noteLines.join('\n') : ''
  if (typeof hasChordsFn === 'function') {
    return hasChordsFn(text)
  }
  return /"[^"]+"/.test(text)
}

function isPlaceholderScaffold(tune, noteLines, hasChordsFn) {
  if (!tune || !tune.timingScaffold) return false
  return !noteLinesHaveAbcChords(noteLines, hasChordsFn)
}

function hasStructureMismatch(blockAudit, pathAIssues) {
  const assessment = blockAudit && blockAudit.assessment
  const assessmentIssues = assessment && Array.isArray(assessment.issues) ? assessment.issues : []
  if (assessmentIssues.some(function(issue) {
    return STRUCTURE_MISMATCH_CODES.has(issue.code)
  })) {
    return true
  }
  const blocks = blockAudit && Array.isArray(blockAudit.blocks) ? blockAudit.blocks : []
  if (blocks.some(function(block) {
    return (block.warnings || []).indexOf('extra_chart_attached') >= 0
  })) {
    return true
  }
  const pathIssues = Array.isArray(pathAIssues) ? pathAIssues : []
  return pathIssues.some(function(issue) {
    return issue.code === 'stanza_chord_mismatch'
  })
}

function needsSyncLabels(tune, noteLines) {
  const merged = noteLinesForMelodyMerge(noteLines)
  const strains = splitMelodyStrainsWithBarlines(merged)
  const hasMultiStrain = strains.length > 1 || /\|\|/.test(merged.join('\n'))
  if (!hasMultiStrain) return false
  const labels = Array.isArray(tune.chordSectionLabels) ? tune.chordSectionLabels : []
  const sounding = labels.filter(function(label) { return label && !label.chartRevisit })
  return !chordSectionLabelsUsableForMatching(sounding)
}

function collectIssueCodes(blockAudit, pathAIssues, pathBIssues) {
  const codes = []
  const assessment = blockAudit && blockAudit.assessment
  ;(assessment && assessment.issues || []).forEach(function(issue) {
    if (issue && issue.code) codes.push(issue.code)
  })
  ;(blockAudit && blockAudit.critique && blockAudit.critique.issues || []).forEach(function(issue) {
    if (issue && issue.code) codes.push(issue.code)
  })
  ;(pathAIssues || []).forEach(function(issue) {
    if (issue && issue.code) codes.push(issue.code)
  })
  ;(pathBIssues || []).forEach(function(issue) {
    if (issue && issue.code) codes.push(issue.code)
  })
  return Array.from(new Set(codes))
}

function lyricsHaveEmbeddedChords(lyrics) {
  return hasLyricEmbeddedChords(lyrics) || hasChordLines(lyrics)
}

function isPassthroughRenderMode(tune) {
  const plan = resolveChordRenderPlan(tune, { hideChords: false })
  return plan.mode === 'passthrough_cow' || plan.mode === 'passthrough_chordpro'
}

function isScaffoldMergePath(tune, noteLines, hasChordsFn) {
  if (!tune) return false
  if (tune.timingScaffold) return true
  return isPlaceholderScaffold(tune, noteLines, hasChordsFn)
}

function hasHighPriorityHygieneIssues(tags) {
  return (tags || []).some(function(tag) { return HIGH_PRIORITY_HYGIENE_TAGS.has(tag) })
}

function hasOnlyInformationalAttentionTags(tags) {
  const attention = (tags || []).filter(function(tag) {
    return CHORD_READINESS_ATTENTION_TAGS.indexOf(tag) >= 0
  })
  if (!attention.length) return true
  return attention.every(function(tag) { return INFORMATIONAL_ATTENTION_TAGS.has(tag) })
}

/**
 * Whether lyrics+chords view can show harmony under the render plan.
 */
export function isDisplayChordReady(tune, options) {
  const opts = options || {}
  const lyrics = lyricLinesForChecks(tune)
  const hasLyrics = lyrics.some(function(line) { return String(line || '').trim().length > 0 })
  const noteLines = getNoteLines(tune)
  const plan = resolveChordRenderPlan(tune, { hideChords: false })

  if (!hasLyrics) {
    return plan.mode === 'chords_only' && noteLinesHaveAbcChords(noteLines, opts.hasChords)
  }
  if (plan.mode === 'passthrough_cow' || plan.mode === 'passthrough_chordpro') return true
  if (plan.mode === 'per_line_abc') return noteLinesHaveAbcChords(noteLines, opts.hasChords)
  if (plan.mode === 'chords_only') return noteLinesHaveAbcChords(noteLines, opts.hasChords)
  return false
}

function suggestFixesForClassification(input, tune, lyrics, opts) {
  const fixes = []
  const status = input.status
  const tags = input.tags || []

  if (status === CHORD_READINESS_STATUSES.STRUCTURE_MISMATCH) {
    fixes.push('structure')
  }
  if (tags.indexOf(CHORD_READINESS_TAGS.SYNC_LABELS) >= 0) {
    fixes.push('syncLabels')
  }

  const noteLines = getNoteLines(tune)
  const canGridMerge = isScaffoldMergePath(tune, noteLines, opts && opts.hasChords)
    && status !== CHORD_READINESS_STATUSES.INLINE_ONLY
    && !lyricsHaveEmbeddedChords(lyrics)
    && !isPassthroughRenderMode(tune)

  if (canGridMerge) {
    const strainBucket = input.strainBucket
    const recommendation = input.recommendation
    if (
      tags.indexOf(CHORD_READINESS_TAGS.GRID_MERGE_CANDIDATE) >= 0
      && recommendation === 'grid_merge'
      && strainBucket !== 'pop_mismatch'
    ) {
      fixes.push('gridMerge')
    }
    if (status === CHORD_READINESS_STATUSES.SCAFFOLD_INCOMPLETE) {
      fixes.push('gridMerge')
    }
  }

  return Array.from(new Set(fixes))
}

function isChordReady(tune, noteLines, options, blockAudit) {
  const opts = options || {}
  const hasMelody = noteLinesHaveRealMelody(noteLines) && !tune.timingScaffold
  const abcChords = noteLinesHaveAbcChords(noteLines, opts.hasChords)
  const pathBIssues = checkPathB(tune, opts)

  if (hasMelody && pathBIssues.length === 0) {
    return !hasStructureMismatch(blockAudit, checkPathA(tune, opts))
  }

  if (abcChords && !isPlaceholderScaffold(tune, noteLines, opts.hasChords)) {
    if (hasStructureMismatch(blockAudit, checkPathA(tune, opts))) return false
    return true
  }

  return false
}

/**
 * Whether a tune belongs to the target song book (default: songs).
 */
export function tuneInSongBook(tune, bookName) {
  const target = String(bookName || 'songs').trim().toLowerCase()
  const books = tune && Array.isArray(tune.books) ? tune.books : []
  return books.some(function(book) {
    return String(book || '').trim().toLowerCase() === target
  })
}

/**
 * Classify one tune for chord readiness.
 */
export function classifyChordReadiness(tune, options) {
  const opts = options || {}
  if (!tune || !tune.id) {
    return {
      tuneId: null,
      tuneName: '',
      status: CHORD_READINESS_STATUSES.SKIPPED,
      tags: [],
      suggestedFixes: [],
      issueCodes: [],
      strainBucket: null,
      recommendation: null,
      displayReady: false,
      renderMode: null,
      details: null,
    }
  }

  if (opts.book && !tuneInSongBook(tune, opts.book)) {
    return {
      tuneId: tune.id,
      tuneName: formatTuneDisplayName(tune.name),
      status: CHORD_READINESS_STATUSES.SKIPPED,
      tags: [],
      suggestedFixes: [],
      issueCodes: [],
      strainBucket: null,
      recommendation: null,
      displayReady: false,
      renderMode: null,
      details: { skippedReason: 'book_filter' },
    }
  }

  const blockAudit = auditTuneBlockStructure(tune)
  const lyrics = lyricLinesForChecks(tune)
  const hasLyrics = lyrics.some(function(line) { return String(line || '').trim().length > 0 })
  const noteLines = getNoteLines(tune)
  const renderPlan = resolveChordRenderPlan(tune, { hideChords: false })
  const renderMode = renderPlan.mode
  const displayReady = isDisplayChordReady(tune, opts)
  const pathAIssues = checkPathA(tune, opts)
  const pathBIssues = checkPathB(tune, opts)
  const issueCodes = collectIssueCodes(blockAudit, pathAIssues, pathBIssues)
  const strainBucket = blockAudit.strainLyric && blockAudit.strainLyric.bucket
  const recommendation = blockAudit.assessment && blockAudit.assessment.recommendation
  const tags = []
  let status = CHORD_READINESS_STATUSES.LYRICS_NO_CHORDS

  if (!hasLyrics) {
    status = CHORD_READINESS_STATUSES.INSTRUMENTAL
    return {
      tuneId: tune.id,
      tuneName: formatTuneDisplayName(tune.name),
      status: status,
      tags: tags,
      suggestedFixes: [],
      issueCodes: issueCodes,
      strainBucket: strainBucket,
      recommendation: recommendation,
      displayReady: displayReady,
      renderMode: renderMode,
      details: { blockAudit: blockAudit, suggestedPath: suggestCompletenessPath(tune) },
    }
  }

  if (isChordReady(tune, noteLines, opts, blockAudit)) {
    status = CHORD_READINESS_STATUSES.READY
    tags.push(CHORD_READINESS_TAGS.READY)
  } else if (
    noteLinesHaveRealMelody(noteLines)
    && !tune.timingScaffold
    && !noteLinesHaveAbcChords(noteLines, opts.hasChords)
  ) {
    status = CHORD_READINESS_STATUSES.MELODY_NO_CHORDS
    tags.push(CHORD_READINESS_TAGS.MELODY_NO_CHORDS)
  } else if (hasStructureMismatch(blockAudit, pathAIssues)) {
    status = CHORD_READINESS_STATUSES.STRUCTURE_MISMATCH
    tags.push(CHORD_READINESS_TAGS.STRUCTURE_REVIEW)
  } else if (isPlaceholderScaffold(tune, noteLines, opts.hasChords)) {
    status = CHORD_READINESS_STATUSES.SCAFFOLD_INCOMPLETE
    tags.push(CHORD_READINESS_TAGS.SCAFFOLD_INCOMPLETE)
  } else if (
    hasLyricEmbeddedChords(lyrics)
    || hasChordLines(lyrics)
    || (blockAudit.blocks || []).some(function(block) {
      return block.chordMode === CHORD_MODES.INLINE
    })
  ) {
    status = CHORD_READINESS_STATUSES.INLINE_ONLY
    tags.push(CHORD_READINESS_TAGS.INLINE_ONLY)
  } else if (
    pathAIssues.some(function(issue) { return issue.code === 'no_chord_layout' })
    || (!noteLinesHaveAbcChords(noteLines, opts.hasChords) && !tune.timingScaffold)
  ) {
    status = CHORD_READINESS_STATUSES.LYRICS_NO_CHORDS
    tags.push(CHORD_READINESS_TAGS.NEEDS_SOURCE)
  }

  if (strainBucket && STRAIN_MISMATCH_BUCKETS.has(strainBucket)) {
    tags.push(CHORD_READINESS_TAGS.STRAIN_MISMATCH)
  }
  if (strainBucket === 'hymn_like') {
    tags.push(CHORD_READINESS_TAGS.HYMN_LIKE)
  }
  if (recommendation === 'grid_merge' && status !== CHORD_READINESS_STATUSES.READY) {
    tags.push(CHORD_READINESS_TAGS.GRID_MERGE_CANDIDATE)
  }
  if (needsSyncLabels(tune, noteLines)) {
    tags.push(CHORD_READINESS_TAGS.SYNC_LABELS)
  }
  if (melodyHasAnacrusisDoubleBarlines(noteLines)) {
    tags.push(CHORD_READINESS_TAGS.ANACRUSIS_REVIEW)
  }

  const uniqueTags = Array.from(new Set(tags))
  if (displayReady && !hasHighPriorityHygieneIssues(uniqueTags)) {
    uniqueTags.push(CHORD_READINESS_TAGS.DISPLAY_READY)
  }
  const suggestedFixes = suggestFixesForClassification({
    status: status,
    tags: uniqueTags,
    strainBucket: strainBucket,
    recommendation: recommendation,
  }, tune, lyrics, opts)

  return {
    tuneId: tune.id,
    tuneName: formatTuneDisplayName(tune.name),
    status: status,
    tags: uniqueTags,
    suggestedFixes: suggestedFixes,
    issueCodes: issueCodes,
    strainBucket: strainBucket,
    recommendation: recommendation,
    displayReady: displayReady,
    renderMode: renderMode,
    details: {
      blockAudit: blockAudit,
      suggestedPath: suggestCompletenessPath(tune),
      pathAIssues: pathAIssues,
      pathBIssues: pathBIssues,
    },
  }
}

/**
 * Apply chord-readiness tags to a tune (replaces prior chords:* tags by default).
 */
export function applyChordReadinessTags(tune, classification, options) {
  const opts = options || {}
  const next = Object.assign({}, tune)
  let tags = Array.isArray(next.tags) ? next.tags.slice() : []
  if (opts.removeOldTags !== false) {
    tags = tags.filter(function(tag) {
      return !String(tag || '').startsWith(CHORD_READINESS_TAG_PREFIX)
    })
  }
  ;(classification && classification.tags || []).forEach(function(tag) {
    if (tags.indexOf(tag) < 0) tags.push(tag)
  })
  next.tags = tags
  return next
}

export function hasCurrentChordReadinessTags(tune, classification) {
  const expected = classification && Array.isArray(classification.tags) ? classification.tags : []
  const existing = (tune && Array.isArray(tune.tags) ? tune.tags : []).filter(function(tag) {
    return String(tag || '').startsWith(CHORD_READINESS_TAG_PREFIX)
  })
  if (expected.length === 0) {
    return existing.length === 0
  }
  return expected.every(function(tag) { return existing.indexOf(tag) >= 0 })
}

function runStructureFixes(tune, deps) {
  const applied = []
  const skipped = []
  const abcTools = deps.abcTools
  if (!abcTools) {
    skipped.push({ type: 'structure', reason: 'missing_abcTools' })
    return { tune: tune, applied: applied, skipped: skipped }
  }

  let next = tune
  const report = buildTuneCheckReport(next, deps)
  const issues = collectReportIssuesForFixes(report)
  const available = getAvailableStructureFixes(next, abcTools, issues, deps.parseAndRender)
    .map(function(action) { return action.id })
    .filter(function(actionId) { return TIER_A_STRUCTURE_IDS.indexOf(actionId) >= 0 })

  available.forEach(function(actionId) {
    const fixed = applyStructureFix(actionId, next, abcTools, deps.parseAndRender)
    if (fixed) {
      applied.push({ type: 'structure', action: actionId })
      next = fixed
    }
  })

  return { tune: next, applied: applied, skipped: skipped }
}

function runSyncLabelsFix(tune, deps) {
  const abcTools = deps.abcTools
  const abcjsParser = deps.abcjsParser
  if (!abcTools || !abcjsParser) {
    return { tune: tune, applied: [], skipped: [{ type: 'syncLabels', reason: 'missing_deps' }] }
  }

  const next = Object.assign({}, tune)
  const noteLines = getNoteLines(next)
  if (!needsSyncLabels(next, noteLines)) {
    return { tune: next, applied: [], skipped: [{ type: 'syncLabels', reason: 'not_needed' }] }
  }

  syncChordSectionLabelsFromPrimaryVoice(next, noteLines)
  const abc = abcTools.json2abc(next)
  const lyricLines = getLyricLines(next)
  const extracted = buildUnifiedBlocks({
    noteLines: noteLines,
    chordChart: abcjsParser.renderChords(abc, true),
    displayChordChart: abcjsParser.renderChords(abc, false),
    lyricLines: lyricLines,
    defaultMeter: next.meter || '4/4',
    defaultKey: next.key || 'C',
    defaultTempo: next.tempo || 120,
    defaultNoteLength: next.noteLength || '1/8',
    chordSectionLabels: next.chordSectionLabels,
    title: next.name,
    composer: next.composer,
  })
  next.chordSectionLabels = chordSectionLabelsFromSections(extracted.blocks)
  return {
    tune: next,
    applied: [{ type: 'syncLabels' }],
    skipped: [],
  }
}

function runGridMergeFix(tune, deps) {
  const abcTools = deps.abcTools
  const abcjsParser = deps.abcjsParser
  if (!abcTools || !abcjsParser) {
    return { tune: tune, applied: [], skipped: [{ type: 'gridMerge', reason: 'missing_deps' }] }
  }

  const next = Object.assign({}, tune)
  const lyricLines = getLyricLines(next)
  if (lyricsHaveEmbeddedChords(lyricLines) || isPassthroughRenderMode(next)) {
    return {
      tune: next,
      applied: [],
      skipped: [{ type: 'gridMerge', reason: 'embedded_chords_passthrough' }],
    }
  }

  const noteLines = getNoteLines(next)
  if (!isScaffoldMergePath(next, noteLines, deps.hasChords)) {
    return {
      tune: next,
      applied: [],
      skipped: [{ type: 'gridMerge', reason: 'not_scaffold_only' }],
    }
  }

  const hasMelody = noteLinesHaveRealMelody(noteLines) && !next.timingScaffold
  if (hasMelody && !deps.includeMelody) {
    return {
      tune: next,
      applied: [],
      skipped: [{ type: 'gridMerge', reason: 'real_melody' }],
    }
  }

  const abc = abcTools.json2abc(next)
  const chordChart = abcjsParser.renderChords(abc, true)
  if (!String(chordChart || '').trim() && !hasLyricEmbeddedChords(lyricLines)) {
    return {
      tune: next,
      applied: [],
      skipped: [{ type: 'gridMerge', reason: 'no_chord_source' }],
    }
  }

  const extracted = buildUnifiedBlocks({
    noteLines: noteLines,
    chordChart: chordChart,
    displayChordChart: abcjsParser.renderChords(abc, false),
    lyricLines: lyricLines,
    defaultMeter: next.meter || '4/4',
    defaultKey: next.key || 'C',
    defaultTempo: next.tempo || 120,
    defaultNoteLength: next.noteLength || '1/8',
    chordSectionLabels: next.chordSectionLabels,
    title: next.name,
    composer: next.composer,
  })

  if (!extracted.blocks || !extracted.blocks.length) {
    return {
      tune: next,
      applied: [],
      skipped: [{ type: 'gridMerge', reason: 'no_blocks' }],
    }
  }

  const result = applyBlockMergeToTune(next, {
    abc: abc,
    blocks: extracted.blocks,
    tunebook: { abcTools: abcTools },
    abcjsParser: abcjsParser,
    wipeNotation: !hasMelody || !!next.timingScaffold,
    keepEditorBlocks: true,
    defaultMeter: next.meter || '4/4',
    notesBefore: noteLines.slice(),
  })

  if (!result.ok) {
    return {
      tune: next,
      applied: [],
      skipped: [{ type: 'gridMerge', reason: result.error && result.error.message || 'merge_failed' }],
    }
  }

  next.chordSectionLabels = chordSectionLabelsFromSections(extracted.blocks)
  if (!hasMelody || next.timingScaffold) {
    next.timingScaffold = true
  }
  return {
    tune: next,
    applied: [{ type: 'gridMerge' }],
    skipped: [],
  }
}

/**
 * Apply safe chord-readiness fixes to one tune.
 */
export function applyChordReadinessFixes(tune, classification, deps) {
  const opts = deps || {}
  const dryRun = !!opts.dryRun
  const fixTypes = Array.isArray(opts.fixes) && opts.fixes.length
    ? opts.fixes.slice()
    : (classification && classification.suggestedFixes || []).slice()

  let working = Object.assign({}, tune)
  const applied = []
  const skipped = []

  if (fixTypes.indexOf('structure') >= 0) {
    const structureResult = runStructureFixes(working, opts)
    applied.push.apply(applied, structureResult.applied)
    skipped.push.apply(skipped, structureResult.skipped)
    if (!dryRun) working = structureResult.tune
  }

  if (fixTypes.indexOf('syncLabels') >= 0) {
    const syncResult = runSyncLabelsFix(working, opts)
    applied.push.apply(applied, syncResult.applied)
    skipped.push.apply(skipped, syncResult.skipped)
    if (!dryRun) working = syncResult.tune
  }

  if (fixTypes.indexOf('gridMerge') >= 0) {
    const mergeResult = runGridMergeFix(working, opts)
    applied.push.apply(applied, mergeResult.applied)
    skipped.push.apply(skipped, mergeResult.skipped)
    if (!dryRun) working = mergeResult.tune
  }

  return {
    tune: working,
    applied: applied,
    skipped: skipped,
    dryRun: dryRun,
  }
}

/**
 * Audit many tunes; returns per-tune rows plus summary stats.
 */
export function auditTunesChordReadiness(tunes, options) {
  const opts = options || {}
  const list = Array.isArray(tunes) ? tunes : []
  const results = []
  const byStatus = Object.create(null)
  const byStrainBucket = Object.create(null)
  const byTag = Object.create(null)

  list.forEach(function(tune) {
    const row = classifyChordReadiness(tune, opts)
    if (row.status === CHORD_READINESS_STATUSES.SKIPPED && row.details && row.details.skippedReason === 'book_filter') {
      return
    }
    results.push(row)
    if (!byStatus[row.status]) byStatus[row.status] = 0
    byStatus[row.status] += 1
    if (row.strainBucket) {
      if (!byStrainBucket[row.strainBucket]) byStrainBucket[row.strainBucket] = 0
      byStrainBucket[row.strainBucket] += 1
    }
    ;(row.tags || []).forEach(function(tag) {
      if (!byTag[tag]) byTag[tag] = 0
      byTag[tag] += 1
    })
  })

  return {
    results: results,
    summary: summarizeChordReadinessReport(results, byStatus, byStrainBucket, byTag),
  }
}

function rowCountsAsNeedsWork(row) {
  if (!row) return false
  if (row.status === CHORD_READINESS_STATUSES.INSTRUMENTAL) return false
  if (row.status === CHORD_READINESS_STATUSES.READY) return false
  if (row.displayReady && hasOnlyInformationalAttentionTags(row.tags)) return false
  return true
}

export function summarizeChordReadinessReport(results, byStatus, byStrainBucket, byTag) {
  const rows = Array.isArray(results) ? results : []
  const statusCounts = byStatus || Object.create(null)
  const strainCounts = byStrainBucket || Object.create(null)
  const tagCounts = byTag || Object.create(null)
  const byRenderMode = Object.create(null)

  if (!Object.keys(statusCounts).length) {
    rows.forEach(function(row) {
      if (!statusCounts[row.status]) statusCounts[row.status] = 0
      statusCounts[row.status] += 1
      if (row.strainBucket) {
        if (!strainCounts[row.strainBucket]) strainCounts[row.strainBucket] = 0
        strainCounts[row.strainBucket] += 1
      }
      ;(row.tags || []).forEach(function(tag) {
        if (!tagCounts[tag]) tagCounts[tag] = 0
        tagCounts[tag] += 1
      })
    })
  }

  rows.forEach(function(row) {
    const mode = row.renderMode || 'unknown'
    if (!byRenderMode[mode]) byRenderMode[mode] = 0
    byRenderMode[mode] += 1
  })

  const songCount = rows.length
  const readyCount = statusCounts[CHORD_READINESS_STATUSES.READY] || 0
  const displayReadyCount = rows.filter(function(row) { return !!row.displayReady }).length
  const needsWork = rows.filter(rowCountsAsNeedsWork).length

  return {
    totalTunes: songCount,
    readyCount: readyCount,
    displayReadyCount: displayReadyCount,
    needsWorkCount: needsWork,
    readyRate: songCount > 0 ? readyCount / songCount : 0,
    displayReadyRate: songCount > 0 ? displayReadyCount / songCount : 0,
    byStatus: statusCounts,
    byStrainBucket: strainCounts,
    byTag: tagCounts,
    byRenderMode: byRenderMode,
  }
}

export function formatChordReadinessMarkdown(report, sourceLabel) {
  const summary = report && report.summary ? report.summary : summarizeChordReadinessReport(report && report.results)
  const lines = [
    '# Chord Readiness Audit',
    '',
    'Source: ' + (sourceLabel || 'tunebook export'),
    '',
    '| Metric | Value |',
    '|--------|-------|',
    '| Total songs | ' + summary.totalTunes + ' |',
    '| Ready | ' + summary.readyCount + ' |',
    '| Display ready | ' + (summary.displayReadyCount || 0) + ' |',
    '| Needs work | ' + summary.needsWorkCount + ' |',
    '| Ready rate | ' + (summary.readyRate * 100).toFixed(1) + '% |',
    '| Display ready rate | ' + ((summary.displayReadyRate || 0) * 100).toFixed(1) + '% |',
    '',
    '## By status',
    '',
  ]

  Object.keys(summary.byStatus || {}).sort().forEach(function(status) {
    lines.push('- **' + status + '**: ' + summary.byStatus[status])
  })

  lines.push('', '## By strain bucket', '')
  Object.keys(summary.byStrainBucket || {}).sort().forEach(function(bucket) {
    lines.push('- **' + bucket + '**: ' + summary.byStrainBucket[bucket])
  })

  lines.push('', '## By render mode', '')
  Object.keys(summary.byRenderMode || {}).sort().forEach(function(mode) {
    lines.push('- **' + mode + '**: ' + summary.byRenderMode[mode])
  })

  lines.push('', '## By tag', '')
  Object.keys(summary.byTag || {}).sort().forEach(function(tag) {
    lines.push('- **' + tag + '**: ' + summary.byTag[tag])
  })

  lines.push('', '## Recommended queue order', '')
  CHORD_READINESS_RECOMMENDED_QUEUE.forEach(function(item, index) {
    lines.push((index + 1) + '. ' + item)
  })
  lines.push('')
  lines.push('Note: tunes tagged `chords:strain-mismatch` may still render via positional section mapping and per-line ABC when display-ready.')

  return lines.join('\n')
}

export function formatChordReadinessCsv(report) {
  const rows = report && report.results ? report.results : []
  const header = [
    'id',
    'name',
    'status',
    'displayReady',
    'renderMode',
    'strainBucket',
    'recommendation',
    'issueCodes',
    'suggestedTags',
    'suggestedFixes',
  ]
  const lines = [header.join(',')]
  rows.forEach(function(row) {
    const cells = [
      row.tuneId,
      row.tuneName,
      row.status,
      row.displayReady ? 'yes' : 'no',
      row.renderMode || '',
      row.strainBucket || '',
      row.recommendation || '',
      (row.issueCodes || []).join(';'),
      (row.tags || []).join(';'),
      (row.suggestedFixes || []).join(';'),
    ].map(function(cell) {
      const text = cell == null ? '' : String(cell)
      if (text.indexOf('"') >= 0 || text.indexOf(',') >= 0 || text.indexOf('\n') >= 0) {
        return '"' + text.replace(/"/g, '""') + '"'
      }
      return text
    })
    lines.push(cells.join(','))
  })
  return lines.join('\n')
}

/**
 * Parse exported tunebook JSON (array or single tune).
 */
export function parseTunebookExportJson(text) {
  const parsed = JSON.parse(String(text || '[]'))
  if (Array.isArray(parsed)) return parsed
  if (parsed && parsed.id) return [parsed]
  return []
}
