/**
 * Block-scoped chord merge: melody strains are canonical; chart/lyric attach
 * at extract. Lyric alignment never drives ABC merge.
 */
import {
  extractBarsFromMelodyText,
  flattenMelodyText,
  splitMelodyIntoBlocks,
} from './lyricBarAlignmentUtils'
import {
  normalizeSectionType,
  splitChordChartIntoBlocks,
} from './chordSheetUtils'
import { listLyricSections, sectionDisplayTitle } from './lyricStructureUtils'
import { normalizeMeter } from './barModel'
import {
  applyChordSectionLabels,
  chordSectionLabelsFromSections,
  extractMeterFromChartBlock,
  extractTempoFromChartBlock,
  firstSectionMeter,
  firstSectionTempo,
  normalizeTempo,
  prependMeterMarker,
  rebuildChordGridFromSections,
  stripMeterMarkers,
} from './chordsEditorSections'
import { clearTransientTimedFields } from './timedImportFinalizer'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import {
  getPlainLyricLines,
  setNoteAlignedLyricLines,
  setPlainLyricLines,
} from './wLinesUtils'
import { buildNotationWLines } from './noteSpacingUtils'

const CACHE_VERSION = 1

const MERGE_FAILURE_FIX = {
  chart_parse_error: 'Fix the chord grid syntax in this section; one | per bar.',
  invalid_chord_symbol: 'Correct chord spelling in the grid (e.g. Am, G7, F#m).',
  invalid_meter: 'Set a valid time signature (e.g. 4/4, 3/4, 6/8).',
  chart_shorter_than_melody: 'Add bars to the chord grid, or shorten melody in Music / ABC tab.',
  chart_longer_no_room: 'Add bars in ABC / Music tab, or remove extra bars from the chord grid.',
  anchor_stale: 'Re-open the chords tab to refresh, then retry.',
  anchor_missing_range: 'Add matching bars in ABC for the new section, or remove the extra blank-line block.',
  block_count_mismatch: 'Restore the section in the chord grid or delete the matching || strain in ABC.',
  anacrusis_bar_mismatch: 'Align pickup in the chord grid or Music tab.',
  meter_change_unsupported: 'Move [M:…] to the start of a bar line, or set meter in the ABC header.',
  strain_barline_conflict: 'Edit barlines in the ABC tab to match section structure, then retry.',
  ending_structure_conflict: 'Edit first/second endings in the ABC tab first.',
  no_primary_voice: 'Add a voice in the ABC tab or import notation first.',
  abc_parse_error: 'Fix syntax errors in the ABC tab.',
  timed_media_conflict: 'This tune has timed media — add/remove bars in Music tab first, or edit only chord names without changing bar count.',
  invariant_violation: 'Use Undo; re-open the chords tab to refresh anchors.',
}

export function mergeFailure(code, message, extras) {
  const extra = extras || {}
  return Object.assign({
    code: code,
    message: message || code,
    fixHint: MERGE_FAILURE_FIX[code] || 'Fix the chord grid or ABC notation, then retry.',
  }, extra)
}

export function hashAbcNotes(noteLines) {
  const normalized = (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').replace(/\s+/g, ' ').trim() })
    .filter(Boolean)
    .join('\n')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return String(4294967296 * (2097151 & h2) + (h1 >>> 0))
}

function barHasPitch(barText) {
  const stripped = String(barText || '').replace(/"([^"]*)"/g, '')
  return /[a-gA-G]/.test(stripped)
}

function barIsChordScaffold(barText) {
  const text = String(barText || '').trim()
  if (!text) return false
  if (barHasPitch(text)) return false
  if (/"[^"]+"/.test(text) && /[zZ]/.test(text.replace(/"([^"]*)"/g, ''))) return true
  return false
}

function barIsRestOnly(barText) {
  const stripped = String(barText || '').replace(/"([^"]*)"/g, '').trim()
  if (!stripped) return true
  if (barHasPitch(stripped)) return false
  return /[zZx]/.test(stripped) || !/[a-gA-G]/.test(stripped)
}

/**
 * Classify a single bar of melody text.
 * @returns {'pitch'|'rest'|'chord_scaffold'|'empty'}
 */
export function classifyBar(barText) {
  const text = String(barText || '').trim()
  if (!text) return 'empty'
  if (barHasPitch(text)) return 'pitch'
  if (barIsChordScaffold(text)) return 'chord_scaffold'
  if (barIsRestOnly(text)) return 'rest'
  return 'empty'
}

const CLASS_RANK = { empty: 0, chord_scaffold: 1, rest: 2, pitch: 3 }

export function classifyBarsInRange(noteLines, abcBarStart, abcBarEnd) {
  const flat = flattenMelodyText(noteLines)
  const bars = extractBarsFromMelodyText(flat)
  const start = Math.max(0, abcBarStart | 0)
  const end = Math.min(bars.length - 1, abcBarEnd | 0)
  const classes = []
  for (let i = start; i <= end && i < bars.length; i++) {
    classes.push(classifyBar(bars[i]))
  }
  return classes
}

export function blockMergeMode(classes) {
  let max = 'empty'
  ;(classes || []).forEach(function(c) {
    if ((CLASS_RANK[c] || 0) > (CLASS_RANK[max] || 0)) max = c
  })
  return max
}

export function countChartBars(chart) {
  const text = stripMeterMarkers(chart || '')
  if (!String(text).trim()) return 0
  // Count trailing | as bar delimiters; empty segments between || ignored.
  const parts = String(text).replace(/\n+/g, ' ').split('|')
  let count = 0
  parts.forEach(function(part, index) {
    const trimmed = part.trim()
    if (!trimmed && index === parts.length - 1) return
    if (!trimmed) return
    count += 1
  })
  return count
}

/**
 * Split flattened melody preserving strain separators (||, ::, |:).
 * @returns {{ text: string, startBarline: string|null, endBarline: string|null }[]}
 */
export function splitMelodyStrainsWithBarlines(noteLines) {
  const flat = flattenMelodyText(noteLines)
  if (!flat) return []
  const re = /(\|\||::|\|:)/g
  const parts = []
  let lastIndex = 0
  let match
  let pendingStart = null
  while ((match = re.exec(flat)) !== null) {
    const before = flat.slice(lastIndex, match.index).trim()
    if (before) {
      parts.push({
        text: before,
        startBarline: pendingStart,
        endBarline: match[1],
      })
      pendingStart = match[1] === '|:' ? '|:' : null
    } else if (match[1] === '|:') {
      pendingStart = '|:'
    }
    lastIndex = match.index + match[1].length
  }
  const tail = flat.slice(lastIndex).trim()
  if (tail) {
    parts.push({
      text: tail,
      startBarline: pendingStart,
      endBarline: null,
    })
  }
  if (parts.length === 0 && flat.trim()) {
    parts.push({ text: flat.trim(), startBarline: null, endBarline: null })
  }
  return parts
}

export function buildBarIndexMap(noteLines) {
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const map = {}
  let globalBar = 0
  strains.forEach(function(strain, strainIndex) {
    const bars = extractBarsFromMelodyText(strain.text)
    bars.forEach(function(barText, barInStrain) {
      map[globalBar] = {
        strainIndex: strainIndex,
        barInStrain: barInStrain,
        barText: barText,
        class: classifyBar(barText),
      }
      globalBar += 1
    })
  })
  return map
}

function sectionKeyForIndex(index, type, header) {
  const base = type || (header ? String(header).replace(/\W+/g, '-').toLowerCase() : 'section')
  return base + '-' + index
}

/**
 * Build unified chord blocks: one per melody strain (canonical).
 */
export function buildUnifiedBlocks(options) {
  const opts = options || {}
  const noteLines = Array.isArray(opts.noteLines) ? opts.noteLines : []
  const lyricLines = Array.isArray(opts.lyricLines) ? opts.lyricLines : []
  const defaultMeter = normalizeMeter(opts.defaultMeter || '4/4')
  const defaultTempo = normalizeTempo(opts.defaultTempo) || 120
  const fullChart = String(opts.chordChart == null ? '' : opts.chordChart)
  const chartBlocks = splitChordChartIntoBlocks(fullChart)
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const lyricSections = listLyricSections(lyricLines)
  const warnings = []
  const chordSectionLabels = Array.isArray(opts.chordSectionLabels) ? opts.chordSectionLabels : null

  if (strains.length === 0) {
    // No melody — treat chart blocks as blocks (scaffold / paste create).
    let previousMeter = null
    let previousTempo = null
    let blocks = (chartBlocks.length ? chartBlocks : [fullChart]).map(function(chart, index) {
      const raw = String(chart || '')
      const meter = normalizeMeter(
        extractMeterFromChartBlock(raw) || previousMeter || defaultMeter
      )
      const tempo = normalizeTempo(
        extractTempoFromChartBlock(raw) || previousTempo || defaultTempo
      ) || defaultTempo
      previousMeter = meter
      previousTempo = tempo
      const lyricSection = lyricSections[index] || null
      const header = (lyricSection && lyricSection.header) || ''
      const type = header ? normalizeSectionType(header) : null
      return {
        id: sectionKeyForIndex(index, type, header),
        key: sectionKeyForIndex(index, type, header),
        chart: stripMeterMarkers(raw),
        meter: meter,
        tempo: tempo,
        abcBarStart: 0,
        abcBarEnd: Math.max(0, countChartBars(raw) - 1),
        melodyStrainIndex: index,
        hasAnacrusis: false,
        lyricSectionType: type,
        lyricSectionHeader: header,
        title: lyricSection
          ? lyricSection.title
          : (chartBlocks.length > 1 ? ('Section ' + (index + 1)) : 'Chords'),
        chartRevisit: false,
        sourceTypeKey: type,
        strainStartBarline: null,
        strainEndBarline: null,
        endingMarkers: [],
        extraChart: '',
        lyricLines: lyricSection ? lyricSection.lines.slice() : [],
      }
    })
    if (chordSectionLabels && chordSectionLabels.length) {
      blocks = applyChordSectionLabels(blocks, chordSectionLabels, lyricLines)
    }
    if (lyricSections.length && lyricSections.length !== blocks.length) {
      warnings.push(mergeFailure(
        'strain_lyric_count_mismatch',
        'Lyric sections and chord blocks differ — titles are approximate.'
      ))
    }
    return { blocks: blocks, warnings: warnings, abcHash: hashAbcNotes(noteLines) }
  }

  if (lyricSections.length && lyricSections.length !== strains.length) {
    warnings.push(mergeFailure(
      'strain_lyric_count_mismatch',
      'Lyric sections and melody strains differ — titles are approximate.'
    ))
  }

  let globalBar = 0
  let previousMeter = null
  let previousTempo = null
  const hymnSingleChart = chartBlocks.length === 1 && strains.length > 1

  const blocks = strains.map(function(strain, index) {
    const bars = extractBarsFromMelodyText(strain.text)
    const abcBarStart = globalBar
    const abcBarEnd = globalBar + Math.max(0, bars.length - 1)
    globalBar += bars.length

    let rawChart = ''
    let extraChart = ''
    if (hymnSingleChart) {
      rawChart = index === 0 ? String(chartBlocks[0] || '') : ''
    } else if (index < chartBlocks.length) {
      rawChart = String(chartBlocks[index] || '')
    } else {
      rawChart = ''
    }
    if (index === strains.length - 1 && chartBlocks.length > strains.length) {
      extraChart = chartBlocks.slice(strains.length).join('\n\n')
    }

    const blockMeter = extractMeterFromChartBlock(rawChart)
      || (index === 0 ? defaultMeter : previousMeter)
      || defaultMeter
    const meter = normalizeMeter(blockMeter)
    const blockTempo = extractTempoFromChartBlock(rawChart)
      || (index === 0 ? defaultTempo : previousTempo)
      || defaultTempo
    const tempo = normalizeTempo(blockTempo) || defaultTempo
    if (String(rawChart).trim() || index === 0) {
      previousMeter = meter
      previousTempo = tempo
    }

    const lyricSection = lyricSections[index] || null
    const header = (lyricSection && lyricSection.header) || ''
    const type = header ? normalizeSectionType(header) : null
    const title = lyricSection
      ? lyricSection.title
      : sectionDisplayTitle({ header: header, lines: [] }) || ('Section ' + (index + 1))

    return {
      id: sectionKeyForIndex(index, type, header),
      key: sectionKeyForIndex(index, type, header),
      chart: stripMeterMarkers(rawChart),
      meter: meter,
      tempo: tempo,
      abcBarStart: abcBarStart,
      abcBarEnd: abcBarEnd,
      melodyStrainIndex: index,
      hasAnacrusis: index === 0 && bars.length > 0 && classifyBar(bars[0]) !== 'empty' && false,
      lyricSectionType: type,
      lyricSectionHeader: header,
      title: title,
      chartRevisit: false,
      sourceTypeKey: type,
      strainStartBarline: strain.startBarline,
      strainEndBarline: strain.endBarline,
      endingMarkers: [],
      extraChart: extraChart,
      lyricLines: lyricSection ? lyricSection.lines.slice() : [],
      strainText: strain.text,
    }
  })

  const labeled = chordSectionLabels && chordSectionLabels.length
    ? applyChordSectionLabels(blocks, chordSectionLabels, lyricLines)
    : blocks

  return { blocks: labeled, warnings: warnings, abcHash: hashAbcNotes(noteLines) }
}

/**
 * Positional reconcile of unified blocks from an edited whole-grid string.
 */
export function reconcileBlocksFromGrid(blocks, gridText, defaultMeter, defaultTempo) {
  const list = Array.isArray(blocks) ? blocks.map(function(b) {
    return b ? Object.assign({}, b) : b
  }) : []
  const chartBlocks = splitChordChartIntoBlocks(String(gridText == null ? '' : gridText))
  const meterFallback = normalizeMeter(defaultMeter || (list[0] && list[0].meter) || '4/4')
  const tempoFallback = normalizeTempo(defaultTempo)
    || normalizeTempo(list[0] && list[0].tempo)
    || 120
  let previousMeter = null
  let previousTempo = null
  const next = []

  for (let i = 0; i < Math.max(list.length, chartBlocks.length); i++) {
    const raw = i < chartBlocks.length ? chartBlocks[i] : ''
    const meter = normalizeMeter(
      extractMeterFromChartBlock(raw) || previousMeter || meterFallback
    )
    const tempo = normalizeTempo(
      extractTempoFromChartBlock(raw) || previousTempo || tempoFallback
    ) || tempoFallback
    previousMeter = meter
    previousTempo = tempo
    if (i < list.length) {
      next.push(Object.assign({}, list[i], {
        chart: stripMeterMarkers(raw),
        meter: meter,
        tempo: tempo,
      }))
    } else {
      const prev = next[next.length - 1] || list[list.length - 1] || {}
      next.push({
        id: 'section-' + i,
        key: 'section-' + i,
        chart: stripMeterMarkers(raw),
        meter: meter,
        tempo: tempo,
        abcBarStart: -1,
        abcBarEnd: -1,
        melodyStrainIndex: i,
        hasAnacrusis: false,
        lyricSectionType: null,
        lyricSectionHeader: '',
        title: 'Section ' + (i + 1),
        chartRevisit: false,
        sourceTypeKey: null,
        strainStartBarline: null,
        strainEndBarline: '||',
        endingMarkers: [],
        extraChart: '',
        lyricLines: [],
        needsAbcExpand: true,
      })
      void prev
    }
  }
  return next
}

function restBarForMeter(meter) {
  const m = normalizeMeter(meter || '4/4')
  if (m === '3/4') return 'z z z'
  if (m === '6/8') return 'z2 z2 z2'
  if (m === '2/4') return 'z z'
  return 'z z z z'
}

/**
 * Insert rest-scaffold strains for blocks that lack an ABC range.
 * Also expands when there are more non-revisit sections than melody strains
 * (e.g. New section without an explicit needsAbcExpand flag).
 */
export function autoExpandNoteLinesForBlocks(noteLines, blocks, defaultMeter) {
  const lines = Array.isArray(noteLines) ? noteLines.slice() : []
  let list = Array.isArray(blocks) ? blocks.map(function(b) {
    return b ? Object.assign({}, b) : b
  }) : []
  const strains = splitMelodyStrainsWithBarlines(lines)
  const nonRevisit = list.filter(function(b) { return b && !b.chartRevisit })
  const deficit = Math.max(0, nonRevisit.length - strains.length)
  let explicitNeeds = 0
  list.forEach(function(b) {
    if (b && b.needsAbcExpand) explicitNeeds += 1
  })
  // Mark trailing blocks that lack a strain so rebuild can reindex them.
  if (deficit > 0) {
    let marked = 0
    for (let i = list.length - 1; i >= 0 && marked < deficit; i--) {
      if (!list[i] || list[i].chartRevisit) continue
      if (!list[i].needsAbcExpand) {
        list[i] = Object.assign({}, list[i], {
          needsAbcExpand: true,
          melodyStrainIndex: -1,
          abcBarStart: -1,
          abcBarEnd: -1,
        })
      }
      marked += 1
    }
  }
  const needs = list.filter(function(b) { return b && b.needsAbcExpand })
  const expandCount = Math.max(needs.length, deficit, explicitNeeds)
  if (expandCount === 0) {
    return { noteLines: lines, blocks: list, error: null, expanded: false }
  }

  let flat = flattenMelodyText(lines)
  const meter = normalizeMeter(defaultMeter || '4/4')
  const rest = restBarForMeter(meter)

  for (let n = 0; n < expandCount; n++) {
    const sep = flat.trim() ? ' || ' : ''
    flat = (flat.trim() + sep + rest + ' |').trim()
  }

  const nextLines = [flat]
  const rebuilt = buildUnifiedBlocks({
    noteLines: nextLines,
    chordChart: list.map(function(b) {
      const chart = b && String(stripMeterMarkers(b.chart || '')).trim()
        ? b.chart
        : '. |'
      return prependMeterMarker(chart, b && b.meter, null)
    }).join('\n\n'),
    lyricLines: [],
    defaultMeter: meter,
  })

  // Preserve charts / titles from editor order; clear expand flags.
  const mergedBlocks = rebuilt.blocks.map(function(b, i) {
    const src = list[i] || {}
    return Object.assign({}, b, {
      chart: src.chart != null ? src.chart : b.chart,
      meter: src.meter || b.meter,
      tempo: src.tempo || b.tempo,
      title: src.title || b.title,
      header: src.header || src.lyricSectionHeader || b.lyricSectionHeader,
      type: src.type || src.lyricSectionType || b.lyricSectionType,
      key: src.key || b.key,
      id: src.id || src.key || b.id,
      chartRevisit: !!src.chartRevisit,
      sourceTypeKey: src.sourceTypeKey != null ? src.sourceTypeKey : b.sourceTypeKey,
      needsAbcExpand: false,
    })
  })

  return { noteLines: nextLines, blocks: mergedBlocks, error: null, expanded: true }
}

function stripChordsFromAbcText(text) {
  return String(text || '').replace(/"([^"]*)"/g, '')
}

/**
 * Replace primary-voice note lines in an ABC string, preserving other voices.
 */
function splicePrimaryVoiceNotes(abcString, noteLines, abcTools, voicesHint) {
  const voiceKey = resolvePrimaryVoiceKey(voicesHint)
  const notesOut = (Array.isArray(noteLines) ? noteLines : [String(noteLines || '')])
    .map(function(line) { return String(line == null ? '' : line) })
  if (!notesOut.length) notesOut.push('')

  const rawLines = String(abcString || '').split('\n')
  const hasVoiceHeaders = rawLines.some(function(line) { return /^V:/i.test(line) })
  const rebuilt = []
  let inPrimary = !hasVoiceHeaders
  let wrotePrimaryNotes = false

  function flushPrimaryNotes() {
    if (wrotePrimaryNotes) return
    notesOut.forEach(function(line) { rebuilt.push(line) })
    wrotePrimaryNotes = true
  }

  rawLines.forEach(function(line) {
    const vMatch = String(line).match(/^V:\s*(\S+)/i)
    if (vMatch) {
      if (inPrimary && !wrotePrimaryNotes) flushPrimaryNotes()
      inPrimary = vMatch[1] === voiceKey
      rebuilt.push(line)
      return
    }
    if (abcTools.isNoteLine(line) && !String(line).startsWith('w:')) {
      if (inPrimary) {
        if (!wrotePrimaryNotes) flushPrimaryNotes()
        // Drop previous primary note lines (already replaced).
        return
      }
      rebuilt.push(line)
      return
    }
    rebuilt.push(line)
  })

  if (!wrotePrimaryNotes) {
    if (hasVoiceHeaders) {
      // Primary V: header missing — append it with notes.
      rebuilt.push('V:' + voiceKey)
    }
    flushPrimaryNotes()
  }
  return rebuilt.join('\n')
}

/**
 * Normalize mergeChords note body (often multi-line) onto strain layout:
 * prefer a single primary-voice note stream joined with existing || markers.
 */
function noteLinesFromMergedBody(mergedBody, abcTools) {
  const text = String(mergedBody || '')
  // Full ABC (rare) — take note body only.
  const notes = abcTools && typeof abcTools.justNotes === 'function' && /(?:^|\n)[A-Za-z]:/.test(text)
    ? abcTools.justNotes(text)
    : text
  const lines = String(notes).split('\n').map(function(line) {
    return String(line || '').trim()
  }).filter(Boolean)
  if (lines.length <= 1) return lines.length ? lines : ['']
  // Flatten system breaks into one voice line; strain boundaries stay as ||.
  return [lines.join(' ')]
}

function notesFingerprintOutsideBlocks(noteLines, blocks, editedIndexes) {
  const edited = {}
  ;(editedIndexes || []).forEach(function(i) { edited[i] = true })
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  return strains.map(function(strain, index) {
    if (edited[index]) return ''
    return stripChordsFromAbcText(strain.text).replace(/\s+/g, ' ').trim()
  }).join('||')
}

function headerFromAbc(abcString, abcTools) {
  const json = abcTools.abc2json(abcString)
  return {
    meter: normalizeMeter(json.meter || '4/4'),
    noteLength: json.noteLength || '1/8',
    key: json.key || 'C',
    abcJson: json,
  }
}

function miniAbcForStrain(header, strainText, startBarline) {
  const body = (startBarline === '|:' ? '|: ' : '') + String(strainText || '').trim()
  return [
    'X:1',
    'T:',
    'M:' + header.meter,
    'L:' + header.noteLength,
    'K:' + header.key,
    body,
  ].join('\n')
}

function padChartToBarCount(chart, barCount, meter) {
  const current = countChartBars(chart)
  if (current >= barCount) return stripMeterMarkers(chart)
  const slots = []
  const existing = String(stripMeterMarkers(chart) || '').trim()
  if (existing) slots.push(existing.replace(/\|\s*$/, '') + ' |')
  for (let i = current; i < barCount; i++) {
    slots.push('. |')
  }
  void meter
  return slots.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Merge one block's chart into ABC (strain-scoped).
 */
export function mergeChordsForBlock(abcString, block, chartText, options) {
  const opts = options || {}
  const abcjsParser = opts.abcjsParser
  const abcTools = opts.tunebook && opts.tunebook.abcTools
  if (!abcjsParser || !abcTools) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Missing ABC tools') }
  }

  let noteLines
  try {
    noteLines = abcTools.justNotes(abcString).split('\n')
  } catch (e) {
    return { ok: false, error: mergeFailure('abc_parse_error', e.message || 'ABC parse failed') }
  }

  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const strainIndex = block.melodyStrainIndex
  if (strainIndex < 0 || strainIndex >= strains.length) {
    return { ok: false, error: mergeFailure('anchor_missing_range', 'Block has no ABC strain') }
  }

  const strain = strains[strainIndex]
  const bars = extractBarsFromMelodyText(strain.text)
  const classes = bars.map(classifyBar)
  const mode = blockMergeMode(classes)
  const pitchCount = classes.filter(function(c) { return c === 'pitch' }).length
  const chartBars = countChartBars(chartText)

  if (opts.hasTimedMedia && chartBars !== bars.length && (mode === 'pitch')) {
    return { ok: false, error: mergeFailure('timed_media_conflict', 'Bar count change with timed media') }
  }

  if (mode === 'pitch' && chartBars < pitchCount) {
    return {
      ok: false,
      error: mergeFailure(
        'chart_shorter_than_melody',
        'Chart has fewer bars than pitched melody in this section',
        { blockTitle: block.title, blockIndex: strainIndex }
      ),
    }
  }

  const header = headerFromAbc(abcString, abcTools)
  header.meter = normalizeMeter(block.meter || header.meter)

  let chartForMerge = stripMeterMarkers(chartText)
  if (block.meter && normalizeMeter(block.meter) !== normalizeMeter(header.abcJson.meter || header.meter)) {
    // Inline meter only for non-first blocks is handled via prepend on full grid;
    // for mini merge, set header meter to block meter when rewriting scaffold.
    if (mode !== 'pitch') header.meter = normalizeMeter(block.meter)
  }

  if (mode === 'pitch' && chartBars < bars.length) {
    chartForMerge = padChartToBarCount(chartForMerge, bars.length, block.meter)
  }

  if (mode === 'pitch' && chartBars > bars.length) {
    // Allow mergeChords to append rest bars within the strain mini-abc.
  }

  const beforeOutside = notesFingerprintOutsideBlocks(noteLines, null, [strainIndex])
  const mini = miniAbcForStrain(header, strain.text, strain.startBarline)
  let mergedMini
  try {
    mergedMini = abcjsParser.mergeChords(chartForMerge, mini, null)
  } catch (e) {
    return { ok: false, error: mergeFailure('chart_parse_error', e.message || 'Chord merge failed') }
  }

  const mergedNotes = abcTools.justNotes(mergedMini).split('\n')
  const mergedFlat = flattenMelodyText(mergedNotes)
  // Drop leading |: if we injected it
  let strainOut = mergedFlat.replace(/^\|:\s*/, '').trim()

  const rebuilt = strains.map(function(s, i) {
    if (i === strainIndex) return strainOut
    return s.text
  })

  // Rejoin with || between strains (preserve |: starts)
  let joined = ''
  strains.forEach(function(s, i) {
    if (i > 0) {
      const sep = s.startBarline === '|:' ? ' |: ' : ' || '
      joined += sep
    } else if (s.startBarline === '|:' || (i === strainIndex && block.strainStartBarline === '|:')) {
      // first strain with left repeat — keep if present in text
    }
    const piece = i === strainIndex ? strainOut : s.text
    joined += piece
  })

  void rebuilt
  const newNoteLines = [joined.trim()]
  const afterOutside = notesFingerprintOutsideBlocks(newNoteLines, null, [strainIndex])
  // Recompute outside fingerprint using original strain texts for non-edited
  const afterStrains = splitMelodyStrainsWithBarlines(newNoteLines)
  const afterOutsideCheck = afterStrains.map(function(s, i) {
    if (i === strainIndex) return ''
    return stripChordsFromAbcText(s.text).replace(/\s+/g, ' ').trim()
  }).join('||')

  if (afterOutsideCheck !== beforeOutside && strains.length > 1) {
    // Soft check — strain join can normalize whitespace; compare chord-stripped
    const beforeNorm = beforeOutside.replace(/\s+/g, ' ')
    const afterNorm = afterOutsideCheck.replace(/\s+/g, ' ')
    if (beforeNorm !== afterNorm) {
      return {
        ok: false,
        error: mergeFailure('invariant_violation', 'Notes outside edited block changed'),
      }
    }
  }

  void afterOutside
  const noteLinesOut = [joined.trim()].filter(Boolean)
  const newAbc = splicePrimaryVoiceNotes(
    abcString,
    noteLinesOut,
    abcTools,
    header.abcJson.voices
  )

  return { ok: true, abc: newAbc, noteLines: noteLinesOut }
}

/**
 * Transactional merge of all blocks (or wipe+scaffold).
 */
export function mergeAllChordBlocks(abcString, blocks, options) {
  const opts = options || {}
  const abcjsParser = opts.abcjsParser
  const tunebook = opts.tunebook
  const abcTools = tunebook && tunebook.abcTools
  if (!abcjsParser || !abcTools) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Missing ABC tools') }
  }

  const list = Array.isArray(blocks) ? blocks : []
  const grid = rebuildChordGridFromSections(list.map(function(b) {
    // Empty editor slots use `|` as a placeholder; merge needs a real rest bar
    // so we do not corrupt neighbouring scaffold bars.
    const raw = stripMeterMarkers(b && b.chart)
    const chart = String(raw || '').trim() && String(raw).trim() !== '|'
      ? b.chart
      : '. |'
    return {
      chart: chart,
      meter: b.meter,
      tempo: b.tempo,
      chartRevisit: !!b.chartRevisit,
    }
  }))

  if (opts.wipeNotation) {
    const header = headerFromAbc(abcString, abcTools)
    const firstMeter = firstSectionMeter(list, header.meter)
    const firstTempo = firstSectionTempo(list, header.abcJson && header.abcJson.tempo)
    const emptyAbc = [
      'X:1',
      'T:',
      'M:' + firstMeter,
      'L:' + header.noteLength,
      'Q:1/4=' + firstTempo,
      'K:' + header.key,
      'z |',
    ].join('\n')
    try {
      const merged = abcjsParser.mergeChords(grid, emptyAbc, opts.chordSheetAlignment || null)
      const noteLines = noteLinesFromMergedBody(merged, abcTools)
      const spliced = splicePrimaryVoiceNotes(
        abcString,
        noteLines,
        abcTools,
        header.abcJson.voices
      )
      return { ok: true, abc: spliced, wiped: true, noteLines: noteLines }
    } catch (e) {
      return { ok: false, error: mergeFailure('chart_parse_error', e.message || 'Scaffold rebuild failed') }
    }
  }

  let noteLines
  try {
    noteLines = abcTools.justNotes(abcString).split('\n')
  } catch (e) {
    return { ok: false, error: mergeFailure('abc_parse_error', e.message || 'ABC parse failed') }
  }

  let workingBlocks = list
  const expand = autoExpandNoteLinesForBlocks(noteLines, list, opts.defaultMeter)
  if (expand.error) {
    return { ok: false, error: expand.error }
  }
  if (expand.expanded) {
    noteLines = expand.noteLines
    workingBlocks = expand.blocks
    // Write expanded notes into abc snapshot on the primary voice only.
    abcString = splicePrimaryVoiceNotes(
      abcString,
      noteLines,
      abcTools,
      headerFromAbc(abcString, abcTools).abcJson.voices
    )
  }

  const hasTimedMedia = !!(opts.tune && (opts.tune.timedChords || opts.tune.timedLyrics || opts.tune.timedMelody))

  // Pitch or rest/scaffold: merge per strain onto the primary voice.
  // (Full wipe rewrite is reserved for opts.wipeNotation above.)
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const header = headerFromAbc(abcString, abcTools)
  const firstMeter = firstSectionMeter(workingBlocks, opts.defaultMeter || header.meter)
  const hasTimed = hasTimedMedia
  const updatedStrainTexts = strains.map(function(s) { return s.text })

  // Editor blocks from paste/tests may omit melodyStrainIndex — default by order.
  let strainCursor = 0
  workingBlocks = workingBlocks.map(function(b) {
    if (!b || b.chartRevisit) return b
    if (b.melodyStrainIndex == null || b.melodyStrainIndex < 0) {
      const assigned = strainCursor
      strainCursor += 1
      return Object.assign({}, b, { melodyStrainIndex: assigned })
    }
    strainCursor = Math.max(strainCursor, (b.melodyStrainIndex | 0) + 1)
    return b
  })

  for (let i = 0; i < workingBlocks.length; i++) {
    const block = workingBlocks[i]
    if (!block || block.chartRevisit) continue
    // Empty new sections keep expanded rest scaffold; do not run mergeChords on blank chart.
    if (!String(stripMeterMarkers(block.chart) || '').trim()) continue
    const strainIndex = block.melodyStrainIndex
    if (strainIndex == null || strainIndex < 0 || strainIndex >= strains.length) {
      return { ok: false, error: mergeFailure('anchor_missing_range', 'Block has no ABC strain') }
    }

    const strainText = updatedStrainTexts[strainIndex]
    const bars = extractBarsFromMelodyText(strainText)
    const classes = bars.map(classifyBar)
    const mode = blockMergeMode(classes)
    const pitchCount = classes.filter(function(c) { return c === 'pitch' }).length
    const chartBars = countChartBars(block.chart)

    if (hasTimed && chartBars !== bars.length && mode === 'pitch') {
      return { ok: false, error: mergeFailure('timed_media_conflict', 'Bar count change with timed media') }
    }
    if (mode === 'pitch' && chartBars < pitchCount) {
      return {
        ok: false,
        error: mergeFailure(
          'chart_shorter_than_melody',
          'Chart has fewer bars than pitched melody in this section',
          { blockTitle: block.title, blockIndex: strainIndex }
        ),
      }
    }

    let chartForMerge = stripMeterMarkers(block.chart)
    if (mode === 'pitch' && chartBars < bars.length) {
      chartForMerge = padChartToBarCount(chartForMerge, bars.length, block.meter)
    }

    const miniHeader = {
      meter: normalizeMeter(i === 0 ? firstMeter : (block.meter || firstMeter)),
      noteLength: header.noteLength,
      key: header.key,
    }
    const mini = miniAbcForStrain(miniHeader, strainText, strains[strainIndex].startBarline)
    let mergedMini
    try {
      mergedMini = abcjsParser.mergeChords(chartForMerge, mini, null)
    } catch (e) {
      return { ok: false, error: mergeFailure('chart_parse_error', e.message || 'Chord merge failed') }
    }
    const mergedFlat = flattenMelodyText(abcTools.justNotes(mergedMini).split('\n'))
    updatedStrainTexts[strainIndex] = mergedFlat.replace(/^\|:\s*/, '').trim()
  }

  // If expand added strains and no charts needed merging, return expanded ABC as-is.
  const mergedAny = workingBlocks.some(function(b) {
    return b && !b.chartRevisit && String(stripMeterMarkers(b.chart) || '').trim()
  })
  if (!mergedAny) {
    return {
      ok: true,
      abc: abcString,
      blocks: workingBlocks,
      noteLines: noteLines,
    }
  }

  const beforeOutside = strains.map(function(s, i) {
    return stripChordsFromAbcText(s.text).replace(/\s+/g, ' ').trim()
  })

  let joined = ''
  strains.forEach(function(s, i) {
    if (i > 0) {
      joined += s.startBarline === '|:' ? ' |: ' : ' || '
    }
    joined += updatedStrainTexts[i]
  })

  const afterStrains = splitMelodyStrainsWithBarlines([joined.trim()])
  for (let i = 0; i < strains.length; i++) {
    const before = beforeOutside[i]
    const after = afterStrains[i]
      ? stripChordsFromAbcText(afterStrains[i].text).replace(/\s+/g, ' ').trim()
      : ''
    // Allow edited strains to change; non-edited must match pitch content.
    const block = workingBlocks.find(function(b) {
      return b && !b.chartRevisit && b.melodyStrainIndex === i
    })
    const chartChanged = block && stripMeterMarkers(block.chart) !== stripMeterMarkers(
      (function() {
        // original chart unknown here — skip strict check when chart bars imply structure change
        return block.chart
      })()
    )
    void chartChanged
    // Only assert when strain bar pitch skeleton should be unchanged:
    // if chart bar count equals original bar count, pitch notes outside chord marks must match.
    const origBars = extractBarsFromMelodyText(strains[i].text).length
    const newBars = afterStrains[i] ? extractBarsFromMelodyText(afterStrains[i].text).length : 0
    if (block && countChartBars(block.chart) === origBars && newBars === origBars) {
      if (before !== after) {
        // Chord symbols stripped — pitch letters should match
        const beforePitch = before.replace(/[^a-gA-GzZ]/g, '')
        const afterPitch = after.replace(/[^a-gA-GzZ]/g, '')
        if (beforePitch !== afterPitch) {
          return { ok: false, error: mergeFailure('invariant_violation', 'Notes outside chord updates changed') }
        }
      }
    }
  }

  const voiceKey = resolvePrimaryVoiceKey(header.abcJson.voices)
  if (!voiceKey) {
    return { ok: false, error: mergeFailure('no_primary_voice', 'No primary voice') }
  }
  const notesOut = [joined.trim()].filter(Boolean)
  if (notesOut.length === 0 || !String(notesOut[0]).trim()) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Merged notes empty') }
  }
  header.abcJson.voices = Object.assign({}, header.abcJson.voices)
  header.abcJson.voices[voiceKey] = Object.assign(
    {},
    header.abcJson.voices[voiceKey] || { meta: '', notes: [] },
    { notes: notesOut }
  )
  header.abcJson.meter = normalizeMeter(firstMeter)
  const currentAbc = splicePrimaryVoiceNotes(
    abcString,
    notesOut,
    abcTools,
    header.abcJson.voices
  )
  return { ok: true, abc: currentAbc, blocks: workingBlocks, noteLines: notesOut }
}

export function readChordBlockCache(tune) {
  const cache = tune && tune.meta && tune.meta.chordBlockCache
  if (!cache || cache.version !== CACHE_VERSION) return null
  return cache
}

export function writeChordBlockCache(tune, abcHash, blocks) {
  if (!tune) return
  tune.meta = Object.assign({}, tune.meta || {})
  tune.meta.chordBlockCache = {
    version: CACHE_VERSION,
    abcHash: abcHash,
    blocks: (blocks || []).map(function(b) {
      return {
        id: b.id || b.key,
        key: b.key,
        chart: b.chart,
        meter: b.meter,
        abcBarStart: b.abcBarStart,
        abcBarEnd: b.abcBarEnd,
        melodyStrainIndex: b.melodyStrainIndex,
        title: b.title,
        chartRevisit: !!b.chartRevisit,
        sourceTypeKey: b.sourceTypeKey,
        lyricSectionType: b.lyricSectionType,
        lyricSectionHeader: b.lyricSectionHeader,
        strainStartBarline: b.strainStartBarline,
        strainEndBarline: b.strainEndBarline,
      }
    }),
  }
}

export function invalidateChordBlockCache(tune) {
  if (!tune || !tune.meta) return
  delete tune.meta.chordBlockCache
}

/**
 * Apply merged ABC + optional lyrics onto tune; save path helper.
 */
export function applyBlockMergeToTune(tune, options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  const abcjsParser = opts.abcjsParser
  const abcTools = tunebook && tunebook.abcTools
  if (!tune || !abcTools || !abcjsParser) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Missing tools') }
  }

  let abc = opts.abc
  if (!abc) abc = abcTools.json2abc(tune)

  const blocks = opts.blocks
  const result = mergeAllChordBlocks(abc, blocks, {
    abcjsParser: abcjsParser,
    tunebook: tunebook,
    wipeNotation: !!opts.wipeNotation,
    chordSheetAlignment: opts.chordSheetAlignment,
    defaultMeter: opts.defaultMeter || tune.meter,
    tune: tune,
  })
  if (!result.ok) return result

  const abcJson = abcTools.abc2json(result.abc)
  // Always write onto the tune's existing primary voice — never adopt a fresh
  // voice key invented by parsing a notes-only merge body.
  const voiceKey = resolvePrimaryVoiceKey(tune.voices || abcJson.voices)
  const noteLines = Array.isArray(result.noteLines) && result.noteLines.length
    ? result.noteLines
    : noteLinesFromMergedBody(result.abc, abcTools)
  if (!tune.voices) tune.voices = {}
  // Keep any sibling voices; only replace primary notes.
  tune.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey] || { meta: '', notes: [] }, {
    notes: noteLines,
  })
  if (opts.firstMeter) tune.meter = normalizeMeter(opts.firstMeter)
  else if (abcJson.meter) tune.meter = normalizeMeter(abcJson.meter)
  const firstTempo = opts.firstTempo != null
    ? normalizeTempo(opts.firstTempo)
    : firstSectionTempo(blocks, abcJson.tempo || tune.tempo)
  if (firstTempo) tune.tempo = firstTempo

  clearTransientTimedFields(tune)

  if (opts.updateLyrics && Array.isArray(opts.lyricLines)) {
    setPlainLyricLines(tune, opts.lyricLines)
    if (noteLines.length > 0) {
      const spaced = buildNotationWLines(tune)
      if (spaced.some(function(line) { return String(line || '').trim().length > 0 })) {
        setNoteAlignedLyricLines(tune, spaced)
      }
    }
  }

  const extracted = buildUnifiedBlocks({
    noteLines: noteLines,
    chordChart: rebuildChordGridFromSections(blocks || []),
    lyricLines: getPlainLyricLines(tune),
    defaultMeter: tune.meter,
    chordSectionLabels: Array.isArray(opts.chordSectionLabels)
      ? opts.chordSectionLabels
      : (Array.isArray(blocks) ? chordSectionLabelsFromSections(blocks) : tune.chordSectionLabels),
  })
  // Prefer the editor's section list (titles, empty New slots, delete order).
  // Re-extracting from ABC/lyrics drops empty sections and remaps by melody
  // strain count, which made Delete remove the wrong block in the UI.
  const editorBlocks = Array.isArray(blocks) && blocks.length > 0 && opts.keepEditorBlocks !== false
    ? blocks.map(function(b, index) {
      if (!b) return b
      const key = b.key || sectionKeyForIndex(index, b.type || b.lyricSectionType, b.header || b.lyricSectionHeader)
      return Object.assign({}, b, {
        key: key,
        id: b.id || key,
      })
    })
    : extracted.blocks
  if (Array.isArray(editorBlocks)) {
    tune.chordSectionLabels = chordSectionLabelsFromSections(editorBlocks)
  }
  writeChordBlockCache(tune, extracted.abcHash, editorBlocks)
  return { ok: true, tune: tune, blocks: editorBlocks, wiped: !!result.wiped }
}
