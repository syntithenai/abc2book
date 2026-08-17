import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  normalizeSectionType,
  splitChordChartIntoBlocks,
  splitChartHeaderAndBody,
  sectionMarkerChartLine,
  joinChartHeaderAndBody,
  rebalanceChartPulseSlots,
  bestStanzaNameMatch,
  expandLegacyBeatSlotsInChart,
  isSectionMarkerToken,
  isInlineSignatureToken,
  dedupeLeadingInlineSignatureDuplicates,
  inlineMeterSignatureChanged,
  normalizeStanzaNameKey as stanzaNameKeyFromChordSheet,
  formatSectionChartForEditor,
  parseSectionChartFromEditor,
  parseChartStructureMarkers,
  stripChartStructureMarkers,
  wrapChordGridBars,
  lineHasChordProInlineChords,
} from './chordSheetUtils'
import { anchorsFromChordProLine } from './inlineChordTimingUtils'
import {
  formatLyricSectionHeader,
  listLyricSections,
  sectionDisplayTitle,
} from './lyricStructureUtils'
import { normalizeMeter } from './barModel'
import { normalizeKeySignature } from './keySignatureNormalize'

const KEY_TOKEN_RE = /\[K:\s*([^\]]+)\]/gi
const METER_TOKEN_RE = /\[M:\s*([^\]]+)\]/gi
const TEMPO_TOKEN_RE = /\[Q:\s*([^\]]+)\]/gi

/**
 * Normalize a BPM value for chord-section tempo (20–300), or null if invalid.
 */
export function normalizeTempo(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const afterEq = raw.indexOf('=') >= 0 ? raw.split('=').pop() : raw
  const n = parseInt(String(afterEq || '').trim(), 10)
  if (!n || n < 20 || n > 300) return null
  return n
}

/**
 * Pull the first [K:…] marker from chord chart or ABC text, if any.
 */
export function extractKeyFromChartBlock(chart) {
  const text = String(chart == null ? '' : chart)
  const match = /\[K:\s*([^\]]+)\]/i.exec(text)
  if (!match) return null
  return normalizeKeySignature(match[1])
}

/**
 * Pull the first [M:x/y] marker from a chord chart block, if any.
 */
export function extractMeterFromChartBlock(chart) {
  const text = String(chart == null ? '' : chart)
  const match = /\[M:\s*([^\]]+)\]/i.exec(text)
  if (!match) return null
  return normalizeMeter(match[1])
}

/**
 * Pull the first [Q:…] marker from a chord chart block (BPM), if any.
 */
export function extractTempoFromChartBlock(chart) {
  const text = String(chart == null ? '' : chart)
  const match = /\[Q:\s*([^\]]+)\]/i.exec(text)
  if (!match) return null
  return normalizeTempo(match[1])
}

/**
 * Remove inline [K:…] / [M:…] / [Q:…] tokens from chord chart text.
 */
export function stripInlineSignatureMarkers(chart) {
  return String(chart == null ? '' : chart)
    .replace(KEY_TOKEN_RE, ' ')
    .replace(METER_TOKEN_RE, ' ')
    .replace(TEMPO_TOKEN_RE, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** @deprecated alias — strips key, meter, and tempo inline tokens. */
export function stripMeterMarkers(chart) {
  return stripInlineSignatureMarkers(chart)
}

function peelLeadingInlineSignatureTokens(text) {
  const parts = String(text || '').trim().split(/\s+/)
  const leading = []
  while (parts.length && isInlineSignatureToken(parts[0])) {
    leading.push(parts.shift())
  }
  return { leading: leading, rest: parts.join(' ') }
}

function inlineSignatureTokenType(token) {
  const t = String(token || '').trim()
  if (/^\[K:/i.test(t)) return 'key'
  if (/^\[M:/i.test(t)) return 'meter'
  if (/^\[Q:/i.test(t)) return 'tempo'
  return null
}

/**
 * Prepend inline [K:…] / [M:…] / [Q:…] when key, meter, or tempo changes from
 * the previous sounding section. First section uses ABC headers only.
 * Mid-chart inline tokens are preserved (not stripped).
 */
export function prependInlineSignatureMarkers(chart, next, previous) {
  const text = String(chart == null ? '' : chart).trim()
  const split = splitChartHeaderAndBody(text)
  const bodyText = String(split.body || '').trim()
  const peeled = peelLeadingInlineSignatureTokens(bodyText)
  const n = next || {}
  const p = previous || {}
  const nextKey = n.key ? normalizeKeySignature(n.key) : null
  const prevKey = p.key ? normalizeKeySignature(p.key) : null
  const nextMeter = n.meter ? normalizeMeter(n.meter) : null
  const prevMeter = p.meter ? normalizeMeter(p.meter) : null
  const nextTempo = normalizeTempo(n.tempo)
  const prevTempo = p.tempo != null ? normalizeTempo(p.tempo) : null
  const tokens = []
  if (nextKey && prevKey && nextKey !== prevKey) {
    tokens.push('[K:' + nextKey + ']')
  }
  if (nextMeter && prevMeter && nextMeter !== prevMeter) {
    tokens.push('[M:' + nextMeter + ']')
  }
  if (nextTempo && prevTempo != null && nextTempo !== prevTempo) {
    tokens.push('[Q:' + nextTempo + ']')
  }
  if (!tokens.length) return text
  const leadingTypes = peeled.leading.map(inlineSignatureTokenType)
  const toPrepend = tokens.filter(function(token) {
    const type = inlineSignatureTokenType(token)
    return type && leadingTypes.indexOf(type) < 0
  })
  if (!toPrepend.length) return text
  const newBodyParts = toPrepend.concat(peeled.leading)
  if (peeled.rest) newBodyParts.push(peeled.rest)
  const newBody = newBodyParts.join(' ').trim()
  if (!split.headerLine) return newBody
  return joinChartHeaderAndBody(split.headerLine, newBody)
}

/**
 * Ensure a chart block begins with [M:…] / [Q:…] when meter or tempo changes
 * from the previous sounding section. First section uses ABC headers.
 */
export function prependMeterMarker(chart, meter, previousMeter, tempo, previousTempo) {
  return prependInlineSignatureMarkers(
    chart,
    { meter: meter, tempo: tempo },
    { meter: previousMeter, tempo: previousTempo }
  )
}

/**
 * Prepend inline signatures but skip types already present in melody ABC text.
 */
export function prependInlineSignatureMarkersRespectingMelody(chart, next, previous, strainText) {
  const text = String(strainText == null ? '' : strainText)
  const n = Object.assign({}, next || {})
  if (/\[M:\s*[^\]]+\]/i.test(text)) delete n.meter
  if (/\[K:\s*[^\]]+\]/i.test(text)) delete n.key
  if (/\[Q:\s*[^\]]+\]/i.test(text)) delete n.tempo
  return dedupeLeadingInlineSignatureDuplicates(
    prependInlineSignatureMarkers(chart, n, previous)
  )
}

function lyricsHaveContent(lyricLines) {
  if (!Array.isArray(lyricLines)) return false
  return lyricLines.some(function(line) {
    return String(line == null ? '' : line).trim().length > 0
  })
}

/** Last section in the list — default source for contiguous key/meter/tempo on append. */
function previousChordSectionForContiguity(sections, neighbour) {
  if (neighbour) return neighbour
  const list = Array.isArray(sections) ? sections : []
  return list.length ? list[list.length - 1] : null
}

function sectionKeyForIndex(index, type, header) {
  const base = type || (header ? String(header).replace(/\W+/g, '-').toLowerCase() : 'section')
  return base + '-' + index
}

/** Reassign positional section keys after header/type edits. */
export function reindexChordsEditorSectionKeys(sections) {
  return (Array.isArray(sections) ? sections : []).map(function(section, index) {
    if (!section) return section
    return Object.assign({}, section, {
      key: sectionKeyForIndex(index, section.type, section.header),
      startLine: index,
    })
  })
}

/**
 * Build chords-editor sections from read-only lyrics + a renderChords chart.
 *
 * @returns {Array<{
 *   key: string,
 *   title: string,
 *   header: string,
 *   type: string|null,
 *   lyricLines: string[],
 *   chart: string,
 *   chartRevisit: boolean,
 *   sourceTypeKey: string|null,
 *   meter: string,
 *   startLine: number,
 * }>}
 */
export function listChordsEditorSections(options) {
  const opts = options || {}
  const defaultMeter = normalizeMeter(opts.defaultMeter || '4/4')
  const defaultKey = normalizeKeySignature(opts.defaultKey || 'C')
  const defaultTempo = normalizeTempo(opts.defaultTempo) || normalizeTempo(opts.tuneTempo) || 120
  const defaultNoteLength = opts.defaultNoteLength || opts.noteLength || null
  const lyricLines = Array.isArray(opts.lyricLines) ? opts.lyricLines : []
  const fullChart = String(opts.chordChart == null ? '' : opts.chordChart)
  const blocks = splitChordChartIntoBlocks(fullChart)

  if (!lyricsHaveContent(lyricLines)) {
    const meter = extractMeterFromChartBlock(fullChart) || defaultMeter
    const key = extractKeyFromChartBlock(fullChart) || defaultKey
    const tempo = extractTempoFromChartBlock(fullChart) || defaultTempo
    return [{
      key: 'chords-0',
      title: 'Chords',
      header: '',
      type: null,
      lyricLines: [],
      chart: expandLegacyBeatSlotsInChart(
        fullChart,
        meter,
        defaultNoteLength
      ),
      chartRevisit: false,
      sourceTypeKey: null,
      meter: meter,
      abcKey: key,
      tempo: tempo,
      startLine: 0,
    }]
  }

  const aligned = alignChordBlocksToLyrics(lyricLines, blocks, Object.assign({}, opts.alignOptions || null, {
    title: opts.title || (opts.alignOptions && opts.alignOptions.title) || null,
    composer: opts.composer || (opts.alignOptions && opts.alignOptions.composer) || null,
    chordSectionLabels: Array.isArray(opts.chordSectionLabels)
      ? opts.chordSectionLabels
      : (opts.alignOptions && opts.alignOptions.chordSectionLabels) || null,
  }))
  const lyricSections = listLyricSections(lyricLines, {
    title: opts.title || (opts.alignOptions && opts.alignOptions.title) || null,
    composer: opts.composer || (opts.alignOptions && opts.alignOptions.composer) || null,
  })
  let previousMeter = null
  let previousTempo = null
  let previousKey = null

  return aligned.map(function(block, index) {
    const lyricSection = lyricSections[index] || null
    const rawChart = String(block.chart || '')
    const blockMeter = extractMeterFromChartBlock(rawChart)
      || extractMeterFromChartBlock(block.extraChart)
      || (index === 0 ? defaultMeter : previousMeter)
      || defaultMeter
    const meter = normalizeMeter(blockMeter)
    const blockKey = extractKeyFromChartBlock(rawChart)
      || extractKeyFromChartBlock(block.extraChart)
      || (index === 0 ? defaultKey : previousKey)
      || defaultKey
    const key = normalizeKeySignature(blockKey)
    const blockTempo = extractTempoFromChartBlock(rawChart)
      || extractTempoFromChartBlock(block.extraChart)
      || (index === 0 ? defaultTempo : previousTempo)
      || defaultTempo
    const tempo = normalizeTempo(blockTempo) || defaultTempo
    if (!block.chartRevisit) {
      previousMeter = meter
      previousTempo = tempo
      previousKey = key
    }

    const header = block.header || (lyricSection && lyricSection.header) || ''
    const type = block.type != null
      ? block.type
      : (header ? normalizeSectionType(header) : null)
    const title = lyricSection
      ? lyricSection.title
      : sectionDisplayTitle({ header: header, lines: block.lyricLines || [] })

    return {
      key: sectionKeyForIndex(index, type, header),
      title: title,
      header: header || '',
      type: type,
      lyricLines: Array.isArray(block.lyricLines) ? block.lyricLines.slice() : [],
      chart: expandLegacyBeatSlotsInChart(
        rawChart,
        meter,
        defaultNoteLength
      ),
      chartRevisit: !!block.chartRevisit,
      sourceTypeKey: type || null,
      meter: meter,
      abcKey: key,
      tempo: tempo,
      startLine: lyricSection ? lyricSection.startLine : index,
    }
  })
}

/**
 * Positional reconcile: update existing section charts from a blank-line-split
 * grid without lyric realignment. Used for hide-sections save so inserting
 * `\n\n` does not rematch charts to lyric sections.
 *
 * - Same count → update chart/meter by index (skip chartRevisit slots when
 *   assigning from grid blocks; grid blocks map to non-revisit sections).
 * - More blocks → append new sections for extras.
 * - Fewer blocks → clear charts on trailing non-revisit sections (keep slots).
 */
export function reconcileChordSectionsFromGrid(sections, gridText, defaultMeter, defaultTempo, defaultKey) {
  const list = Array.isArray(sections) ? sections.map(function(s) {
    return s ? Object.assign({}, s) : s
  }) : []
  const blocks = splitChordChartIntoBlocks(String(gridText == null ? '' : gridText))
  const editable = []
  list.forEach(function(section, index) {
    if (section && !section.chartRevisit) editable.push(index)
  })

  if (editable.length === 0 && blocks.length === 0) return list

  let previousMeter = null
  let previousTempo = null
  let previousKey = null
  const meterFallback = normalizeMeter(defaultMeter || '4/4')
  const keyFallback = normalizeKeySignature(
    defaultKey || (list[0] && list[0].abcKey) || 'C'
  )
  const tempoFallback = normalizeTempo(defaultTempo)
    || normalizeTempo(list[0] && list[0].tempo)
    || 120

  for (let i = 0; i < Math.max(editable.length, blocks.length); i++) {
    const chartRaw = i < blocks.length ? blocks[i] : ''
    const blockMeter = extractMeterFromChartBlock(chartRaw)
      || previousMeter
      || meterFallback
    const meter = normalizeMeter(blockMeter)
    const blockTempo = extractTempoFromChartBlock(chartRaw)
      || previousTempo
      || tempoFallback
    const tempo = normalizeTempo(blockTempo) || tempoFallback
    const blockKey = extractKeyFromChartBlock(chartRaw)
      || previousKey
      || keyFallback
    const key = normalizeKeySignature(blockKey)
    const split = splitChartHeaderAndBody(chartRaw)
    const chart = split.headerLine
      ? joinChartHeaderAndBody(split.headerLine, String(split.body || '').trim())
      : String(split.body || '').trim()
    const structure = parseChartStructureMarkers(chartRaw)
    previousMeter = meter
    previousTempo = tempo
    previousKey = key

    if (i < editable.length) {
      const idx = editable[i]
      const section = list[idx]
      let sectionPatch = {}
      if (split.headerLine && (
        isSectionMarkerToken(split.headerLine)
        || /^#+\s+/.test(String(split.headerLine).trim())
      )) {
        // Notation marker flag only — do not retitle from chart # headers.
        sectionPatch.writeNotationMarker = true
      }
      list[idx] = Object.assign({}, section, sectionPatch, {
        chart: chart,
        meter: meter,
        abcKey: key,
        tempo: tempo,
        strainStartBarline: structure.strainStartBarline || section.strainStartBarline || null,
        strainEndBarline: structure.strainEndBarline || section.strainEndBarline || null,
        endingMarkers: structure.endingMarkers && structure.endingMarkers.length
          ? structure.endingMarkers
          : (section.endingMarkers || []),
      })
      const typeKey = section.sourceTypeKey || section.type
      if (typeKey) {
        list.forEach(function(sib, si) {
          if (!sib || si === idx) return
          if ((sib.sourceTypeKey || sib.type) !== typeKey) return
          if (!sib.chartRevisit) return
          list[si] = Object.assign({}, sib, { chart: chart, meter: meter, abcKey: key, tempo: tempo })
        })
      }
    } else {
      const index = list.length
      list.push({
        key: sectionKeyForIndex(index, null, ''),
        title: 'Section ' + (index + 1),
        header: '',
        type: null,
        lyricLines: [],
        chart: chart,
        chartRevisit: false,
        sourceTypeKey: null,
        meter: meter,
        abcKey: key,
        tempo: tempo,
        startLine: index,
        strainStartBarline: structure.strainStartBarline || null,
        strainEndBarline: structure.strainEndBarline || null,
        endingMarkers: structure.endingMarkers || [],
      })
    }
  }

  if (blocks.length < editable.length) {
    for (let i = blocks.length; i < editable.length; i++) {
      const idx = editable[i]
      const section = list[idx]
      list[idx] = Object.assign({}, section, { chart: '' })
    }
  }

  return list
}

/**
 * Rebuild a blank-line-separated chord grid from editor sections.
 * Revisit sections are skipped (their chart was already emitted on first type).
 * Emits [M:…] / [Q:…] when a section’s meter or tempo differs from the previous.
 * Empty sections emit a single bar `|` so the slot survives blank-line splitting.
 */
export function rebuildChordGridFromSections(sections) {
  const parts = []
  let previousMeter = null
  let previousTempo = null
  let previousKey = null
  ;(Array.isArray(sections) ? sections : []).forEach(function(section) {
    if (!section || section.chartRevisit) return
    const meter = normalizeMeter(section.meter || previousMeter || '4/4')
    const key = normalizeKeySignature(section.abcKey || previousKey || 'C')
    const tempo = normalizeTempo(section.tempo) || previousTempo
    let chartPart = formatSectionChartForEditor(
      Object.assign({}, section, {
        notationMarkerWritten: false,
        writeNotationMarker: false,
      })
    ).trim()
    const header = section.header || section.lyricSectionHeader || ''
    if (header && (section.notationMarkerWritten || section.writeNotationMarker)) {
      chartPart = joinChartHeaderAndBody(sectionMarkerChartLine(header), chartPart)
    }
    const chart = prependInlineSignatureMarkers(
      chartPart,
      { meter: meter, key: key, tempo: tempo },
      { meter: previousMeter, key: previousKey, tempo: previousTempo }
    )
    previousMeter = meter
    previousKey = key
    if (tempo != null) previousTempo = tempo
    const trimmed = String(chart).trim()
    parts.push(trimmed || '|')
  })
  return parts.join('\n\n')
}

/**
 * Update chart (and optional meter/tempo) for a section. When the section shares a
 * type with others, the first source of that type is updated and revisits follow.
 */
export function replaceSectionChart(sections, sectionKey, newChart, newMeter, newTempo, newAbcKey, options) {
  const list = Array.isArray(sections) ? sections.slice() : []
  const index = list.findIndex(function(s) { return s && s.key === sectionKey })
  if (index < 0) return list
  const target = list[index]
  const opts = options || {}
  const split = splitChartHeaderAndBody(newChart)
  const chart = String(split.body || '').trim()
  const meter = newMeter != null ? normalizeMeter(newMeter) : target.meter
  const key = newAbcKey != null ? normalizeKeySignature(newAbcKey) : target.abcKey
  const tempo = newTempo != null
    ? (normalizeTempo(newTempo) || target.tempo)
    : target.tempo
  const typeKey = target.sourceTypeKey || target.type
  const patch = { chart: chart, meter: meter, abcKey: key, tempo: tempo }
  if (opts.writeNotationMarker) {
    patch.writeNotationMarker = true
  }

  if (typeKey) {
    let sourceIndex = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i] && (list[i].sourceTypeKey || list[i].type) === typeKey && !list[i].chartRevisit) {
        sourceIndex = i
        break
      }
    }
    if (sourceIndex < 0) sourceIndex = index
    return list.map(function(section, i) {
      if (!section) return section
      const sameType = (section.sourceTypeKey || section.type) === typeKey
      if (!sameType) return section
      if (i === sourceIndex) {
        return Object.assign({}, section, patch, { chartRevisit: false })
      }
      return Object.assign({}, section, patch, { chartRevisit: true })
    })
  }

  return list.map(function(section, i) {
    if (i !== index) return section
    return Object.assign({}, section, patch)
  })
}

/**
 * Update only the meter on a section (and shared type siblings).
 */
export function replaceSectionMeter(sections, sectionKey, newMeter, noteLength) {
  const list = Array.isArray(sections) ? sections : []
  const found = list.find(function(s) { return s && s.key === sectionKey })
  if (!found) {
    return { ok: true, sections: list.slice() }
  }
  const meter = normalizeMeter(newMeter)
  const previousMeter = normalizeMeter(found.meter || '4/4')
  const rebalanced = rebalanceChartPulseSlots(found.chart || '', meter, noteLength)
  if (rebalanced.droppedChords && rebalanced.droppedChords.length > 0) {
    return {
      ok: false,
      droppedChords: rebalanced.droppedChords.slice(),
      error: 'Changing meter would drop chords: ' + rebalanced.droppedChords.join(', '),
    }
  }
  const chartWithMeter = prependMeterMarker(
    rebalanced.chart,
    meter,
    previousMeter,
    found.tempo,
    null
  )
  return {
    ok: true,
    sections: replaceSectionChart(
      sections,
      sectionKey,
      chartWithMeter,
      meter,
      found.tempo,
      found.abcKey
    ),
  }
}

/**
 * Build section metadata patch when chart # header line name differs from section.
 */
export function sectionPatchFromChartHeaderLine(section, headerLine) {
  if (!section) return { changed: false, patch: null }
  const raw = String(headerLine == null ? '' : headerLine).trim()
  if (!raw || (!isSectionMarkerToken(raw) && !/^#+\s+/.test(raw))) {
    return { changed: false, patch: null }
  }
  const trimmed = raw.replace(/^#+\s*/, '').trim()
  if (!trimmed) return { changed: false, patch: null }
  const wantKey = stanzaNameKeyFromChordSheet(trimmed)
  const currentKey = stanzaNameKeyFromChordSheet(section.header || section.title || '')
  if (!wantKey || wantKey === currentKey) return { changed: false, patch: null }
  const header = formatLyricSectionHeader(trimmed)
  const type = normalizeSectionType(header)
  return {
    changed: true,
    patch: {
      header: header,
      title: sectionDisplayTitle({ header: header, lines: section.lyricLines || [] }) || trimmed,
      type: type,
      sourceTypeKey: type,
      lyricSectionHeader: header,
      lyricSectionType: type,
      writeNotationMarker: true,
    },
  }
}

/**
 * Normalize a section chart draft for save: rebalance pulse slots when inline [M:…]
 * changes, detect # header edits, block when rebalance would drop chords.
 */
export function prepareSectionChartDraft(section, draftChart, noteLength) {
  if (!section) {
    return { ok: false, error: 'Section not found' }
  }
  const chart = String(draftChart == null ? '' : draftChart)
  const split = splitChartHeaderAndBody(chart)
  const meter = normalizeMeter(section.meter || '4/4')
  let outChart = chart
  if (inlineMeterSignatureChanged(section.chart || '', split.body || '')) {
    const rebalanced = rebalanceChartPulseSlots(
      joinChartHeaderAndBody(split.headerLine, split.body),
      meter,
      noteLength
    )
    if (rebalanced.droppedChords && rebalanced.droppedChords.length > 0) {
      return {
        ok: false,
        droppedChords: rebalanced.droppedChords.slice(),
        error: 'Meter change would drop chords: ' + rebalanced.droppedChords.join(', '),
      }
    }
    outChart = rebalanced.chart
  }
  const headerPatch = sectionPatchFromChartHeaderLine(section, split.headerLine)
  const writeNotationMarker = (split.headerLine && (
    isSectionMarkerToken(split.headerLine) || /^#+\s+/.test(String(split.headerLine).trim())
  )) || (headerPatch.patch && headerPatch.patch.writeNotationMarker)
  return {
    ok: true,
    chart: outChart,
    writeNotationMarker: !!writeNotationMarker,
    headerPatch: headerPatch.changed ? headerPatch.patch : null,
  }
}

/**
 * Prepare each non-revisit block in a whole-grid draft (rebalance, # headers).
 */
export function prepareChordGridDraft(sections, gridText, noteLength) {
  const chartBlocks = splitChordChartIntoBlocks(String(gridText == null ? '' : gridText))
  const list = Array.isArray(sections) ? sections : []
  let blockCursor = 0
  const preparedBlocks = []
  const headerPatches = []

  for (let index = 0; index < list.length; index += 1) {
    const section = list[index]
    if (!section || section.chartRevisit) continue
    const draftBlock = blockCursor < chartBlocks.length ? chartBlocks[blockCursor] : ''
    blockCursor += 1
    const parsed = parseSectionChartFromEditor(draftBlock)
    const prep = prepareSectionChartDraft(section, parsed.cleanChart, noteLength)
    if (!prep.ok) return prep
    const prepSplit = splitChartHeaderAndBody(prep.chart)
    const cleanBody = stripChartStructureMarkers(prepSplit.body || prep.chart)
    preparedBlocks.push(
      prepSplit.headerLine
        ? joinChartHeaderAndBody(prepSplit.headerLine, cleanBody)
        : cleanBody
    )
    if (prep.headerPatch) {
      headerPatches.push({ index: index, patch: prep.headerPatch })
    }
  }

  while (blockCursor < chartBlocks.length) {
    preparedBlocks.push(chartBlocks[blockCursor])
    blockCursor += 1
  }

  return {
    ok: true,
    grid: preparedBlocks.join('\n\n'),
    headerPatches: headerPatches,
  }
}

/**
 * Update only the key on a section (and shared type siblings).
 */
export function replaceSectionKey(sections, sectionKey, newAbcKey) {
  const list = Array.isArray(sections) ? sections : []
  const found = list.find(function(s) { return s && s.key === sectionKey })
  if (!found) return list.slice()
  return replaceSectionChart(sections, sectionKey, found.chart, found.meter, found.tempo, newAbcKey)
}

/**
 * Update only the tempo on a section (and shared type siblings).
 */
export function replaceSectionTempo(sections, sectionKey, newTempo) {
  const list = Array.isArray(sections) ? sections : []
  const found = list.find(function(s) { return s && s.key === sectionKey })
  if (!found) return list.slice()
  return replaceSectionChart(sections, sectionKey, found.chart, found.meter, newTempo, found.abcKey)
}

/**
 * Reorder editor sections (insert-before slot semantics, same as lyrics).
 */
export function reorderChordsEditorSections(sections, fromIndex, toIndex) {
  const list = Array.isArray(sections) ? sections.slice() : []
  const from = Number(fromIndex)
  let insertBefore = Number(toIndex)
  if (
    !Number.isFinite(from)
    || !Number.isFinite(insertBefore)
    || from < 0
    || from >= list.length
    || insertBefore < 0
    || insertBefore > list.length
  ) {
    return list
  }
  if (insertBefore === from || insertBefore === from + 1) return list
  const moved = list.splice(from, 1)[0]
  if (insertBefore > from) insertBefore -= 1
  list.splice(insertBefore, 0, moved)
  return list.map(function(section, index) {
    if (!section) return section
    return Object.assign({}, section, {
      key: sectionKeyForIndex(index, section.type, section.header),
    })
  })
}

/**
 * Append an empty chord section (does not touch lyrics).
 */
export function appendChordsEditorSection(sections, name, defaultMeter, defaultTempo) {
  const list = Array.isArray(sections) ? sections.slice() : []
  const trimmed = String(name == null ? '' : name).trim()
  const header = trimmed
    ? (/^\[.+\]$/.test(trimmed) ? trimmed : '[' + trimmed + ']')
    : ''
  const type = header ? normalizeSectionType(header) : null
  const title = trimmed
    ? trimmed.replace(/^\[/, '').replace(/\]$/, '')
    : 'Untitled section'
  const index = list.length
  const previous = previousChordSectionForContiguity(list)
  list.push({
    key: sectionKeyForIndex(index, type, header),
    title: title || 'Untitled section',
    header: header,
    type: type,
    lyricLines: [],
    chart: '',
    chartRevisit: false,
    sourceTypeKey: type,
    meter: normalizeMeter((previous && previous.meter) || defaultMeter || '4/4'),
    abcKey: normalizeKeySignature((previous && previous.abcKey) || 'C'),
    tempo: normalizeTempo(defaultTempo)
      || normalizeTempo(previous && previous.tempo)
      || 120,
    startLine: index,
    // New sections need a rest strain on the existing primary voice (||),
    // not a separate ABC voice / wipe rewrite.
    needsAbcExpand: true,
    melodyStrainIndex: -1,
    abcBarStart: -1,
    abcBarEnd: -1,
  })
  return list
}

/**
 * Insert a new empty chord section after the section with afterKey.
 * If afterKey is missing, appends at the end.
 */
export function insertChordsEditorSectionAfter(sections, afterKey, name, defaultMeter, defaultTempo) {
  const list = Array.isArray(sections) ? sections.slice() : []
  const afterIndex = list.findIndex(function(s) { return s && s.key === afterKey })
  const insertAt = afterIndex >= 0 ? afterIndex + 1 : list.length
  const trimmed = String(name == null ? '' : name).trim()
  const header = trimmed
    ? (/^\[.+\]$/.test(trimmed) ? trimmed : '[' + trimmed + ']')
    : ''
  const type = header ? normalizeSectionType(header) : null
  const title = trimmed
    ? trimmed.replace(/^\[/, '').replace(/\]$/, '')
    : 'Untitled section'
  const neighbour = afterIndex >= 0 ? list[afterIndex] : list[list.length - 1]
  const previous = previousChordSectionForContiguity(list, neighbour)
  list.splice(insertAt, 0, {
    key: 'tmp-insert',
    title: title || 'Untitled section',
    header: header,
    type: type,
    lyricLines: [],
    chart: '',
    chartRevisit: false,
    sourceTypeKey: type,
    meter: normalizeMeter((previous && previous.meter) || defaultMeter || '4/4'),
    abcKey: normalizeKeySignature((previous && previous.abcKey) || 'C'),
    tempo: normalizeTempo(defaultTempo)
      || normalizeTempo(previous && previous.tempo)
      || 120,
    startLine: insertAt,
    needsAbcExpand: true,
    melodyStrainIndex: -1,
    abcBarStart: -1,
    abcBarEnd: -1,
  })
  return list.map(function(section, index) {
    if (!section) return section
    return Object.assign({}, section, {
      key: sectionKeyForIndex(index, section.type, section.header),
      startLine: index,
    })
  })
}

/**
 * Remove a chord section by key. If the removed section was the chart source
 * for a type, promote the next revisit of that type to editable source.
 */
export function removeChordsEditorSection(sections, sectionKey) {
  const list = Array.isArray(sections) ? sections.slice() : []
  const index = list.findIndex(function(s) { return s && s.key === sectionKey })
  if (index < 0) return list
  const removed = list[index]
  list.splice(index, 1)
  const typeKey = removed && (removed.sourceTypeKey || removed.type)
  if (typeKey && removed && !removed.chartRevisit) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      if (!s) continue
      if ((s.sourceTypeKey || s.type) !== typeKey) continue
      if (!s.chartRevisit) break
      list[i] = Object.assign({}, s, { chartRevisit: false })
      break
    }
  }
  return list.map(function(section, i) {
    if (!section) return section
    return Object.assign({}, section, {
      key: sectionKeyForIndex(i, section.type, section.header),
      startLine: i,
    })
  })
}

/**
 * First sounding section meter (for ABC header M:).
 */
export function firstSectionMeter(sections, fallback) {
  const list = Array.isArray(sections) ? sections : []
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].meter) return normalizeMeter(list[i].meter)
  }
  return normalizeMeter(fallback || '4/4')
}

/**
 * First sounding section key (for ABC header K:).
 */
export function firstSectionKey(sections, fallback) {
  const list = Array.isArray(sections) ? sections : []
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].abcKey) return normalizeKeySignature(list[i].abcKey)
  }
  return normalizeKeySignature(fallback || 'C')
}

/**
 * First sounding section tempo (for ABC header Q:).
 */
export function firstSectionTempo(sections, fallback) {
  const list = Array.isArray(sections) ? sections : []
  for (let i = 0; i < list.length; i++) {
    const tempo = normalizeTempo(list[i] && list[i].tempo)
    if (tempo) return tempo
  }
  return normalizeTempo(fallback) || 120
}

/**
 * Compact a COW / ChordPro chord row into one chart bar (tokens + trailing |).
 * Space-padded COW rows collapse to "C G Am F |" so lyric lines map 1:1 to bars.
 */
function chordRowToChartBar(line) {
  const tokens = String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return ''
  return tokens.join(' ') + ' |'
}

/**
 * Chord rows for one lyric/chord pair: prefer chordLines, else ChordPro anchors
 * on the lyric line, else anchors[].chord.
 */
function chartBarsFromLinePair(pair) {
  const bars = []
  const chordLines = Array.isArray(pair && pair.chordLines) ? pair.chordLines : []
  chordLines.forEach(function(line) {
    const bar = chordRowToChartBar(line)
    if (bar) bars.push(bar)
  })
  if (bars.length) return bars

  let anchors = Array.isArray(pair && pair.anchors) ? pair.anchors : []
  if (!anchors.length && pair && lineHasChordProInlineChords(pair.lyricLine)) {
    anchors = anchorsFromChordProLine(pair.lyricLine)
  }
  if (anchors.length) {
    const bar = chordRowToChartBar(anchors.map(function(a) { return a.chord; }).join(' '))
    if (bar) bars.push(bar)
  }
  return bars
}

/**
 * Paste sheet → section list for review (chords only; lyrics used for labels/match).
 * Alignment path: one chart bar per lyric line (and wrap within the section).
 */
export function listPasteChordSections(parsedSheet) {
  const parsed = parsedSheet || {}
  const alignment = Array.isArray(parsed.chordSheetAlignment) ? parsed.chordSheetAlignment : null
  if (alignment && alignment.length > 0) {
    return alignment.map(function(block, index) {
      const header = block.header || ''
      const type = block.type != null ? block.type : (header ? normalizeSectionType(header) : null)
      const chordLines = []
      ;(Array.isArray(block.linePairs) ? block.linePairs : []).forEach(function(pair) {
        chartBarsFromLinePair(pair).forEach(function(bar) {
          chordLines.push(bar)
        })
      })
      // One lyric line → one chart line. Only wrap a line that already has >8 bars.
      const chart = chordLines.map(function(line) {
        const barCount = String(line).split('|').filter(function(part) {
          return String(part || '').trim()
        }).length
        if (barCount > 8) return wrapChordGridBars(line, 8)
        return line
      }).join('\n')
      return {
        key: 'paste-' + index,
        title: sectionDisplayTitle({ header: header, lines: block.lines || [] }),
        header: header,
        type: type,
        lyricLines: Array.isArray(block.lines) ? block.lines.slice() : [],
        chart: chart,
        meter: normalizeMeter(parsed.meter || '4/4'),
        abcKey: normalizeKeySignature(parsed.key || 'C'),
        tempo: extractTempoFromChartBlock(chart)
          || normalizeTempo(parsed.tempo)
          || 120,
      }
    }).filter(function(section) {
      return chartBlockHasChords(section.chart)
        || (section.lyricLines && section.lyricLines.length)
        || !!(section.header && String(section.header).trim())
    })
  }

  const chart = String(parsed.chordText || '')
  const blocks = splitChordChartIntoBlocks(chart)
  if (blocks.length === 0 && chart.trim()) {
    return [{
      key: 'paste-0',
      title: 'Chords',
      header: '',
      type: null,
      lyricLines: Array.isArray(parsed.lyricLines) ? parsed.lyricLines : [],
      chart: chart,
      meter: normalizeMeter(parsed.meter || '4/4'),
      abcKey: normalizeKeySignature(parsed.key || 'C'),
      tempo: extractTempoFromChartBlock(chart) || normalizeTempo(parsed.tempo) || 120,
    }]
  }
  return blocks.map(function(block, index) {
    return {
      key: 'paste-' + index,
      title: 'Section ' + (index + 1),
      header: '',
      type: null,
      lyricLines: [],
      chart: block,
      meter: extractMeterFromChartBlock(block) || normalizeMeter(parsed.meter || '4/4'),
      abcKey: extractKeyFromChartBlock(block) || normalizeKeySignature(parsed.key || 'C'),
      tempo: extractTempoFromChartBlock(block) || normalizeTempo(parsed.tempo) || 120,
    }
  })
}

/**
 * Match a pasted section to a tune section by type, else normalized header/title.
 */
export function matchPasteSectionToTune(pasteSection, tuneSections) {
  const list = Array.isArray(tuneSections) ? tuneSections : []
  if (!pasteSection) return null
  if (pasteSection.type) {
    const byType = list.find(function(s) {
      return s && !s.chartRevisit && (s.type === pasteSection.type || s.sourceTypeKey === pasteSection.type)
    })
    if (byType) return byType
  }
  const pasteTitle = String(pasteSection.title || '').trim().toLowerCase()
  const pasteHeader = String(pasteSection.header || '')
    .replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase()
  const needle = pasteHeader || pasteTitle
  if (!needle) return null
  return list.find(function(s) {
    if (!s || s.chartRevisit) return false
    const title = String(s.title || '').trim().toLowerCase()
    const header = String(s.header || '')
      .replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase()
    return title === needle || header === needle
  }) || null
}

/**
 * Apply one paste section onto tune sections (replace matched, or append).
 */
export function applyPasteSectionToTuneSections(tuneSections, pasteSection, mode) {
  const list = Array.isArray(tuneSections) ? tuneSections.slice() : []
  const match = matchPasteSectionToTune(pasteSection, list)
  if (mode === 'save' || mode === 'merge') {
    if (!match) return list
    return replaceSectionChart(
      list,
      match.key,
      pasteSection.chart,
      pasteSection.meter || match.meter,
      pasteSection.tempo != null ? pasteSection.tempo : match.tempo
    )
  }
  if (mode === 'add') {
    if (match) return list
    return appendChordsEditorSection(
      list,
      pasteSection.title || pasteSection.header || 'Section',
      pasteSection.meter
    ).map(function(section, index, arr) {
      if (index !== arr.length - 1) return section
      return Object.assign({}, section, {
        chart: String(pasteSection.chart || '').trim(),
        meter: normalizeMeter(pasteSection.meter || section.meter),
      })
    })
  }
  return list
}

/**
 * Build a full chords-editor section list from a paste (wipe import).
 * Repeated section types reuse the first chart via chartRevisit.
 */
export function buildTuneSectionsFromPaste(pasteSections, defaultMeter) {
  const source = Array.isArray(pasteSections) ? pasteSections : []
  const list = []
  const firstIndexByType = {}
  source.forEach(function(pasteSection) {
    if (!pasteSection) return
    const type = pasteSection.type || null
    const header = pasteSection.header || ''
    const meter = normalizeMeter(pasteSection.meter || defaultMeter || '4/4')
    const tempo = normalizeTempo(pasteSection.tempo) || 120
    const chart = String(pasteSection.chart || '').trim()
    let chartRevisit = false
    let resolvedChart = chart
    if (type && Object.prototype.hasOwnProperty.call(firstIndexByType, type)) {
      chartRevisit = true
      resolvedChart = list[firstIndexByType[type]].chart
    } else if (type) {
      firstIndexByType[type] = list.length
    }
    const index = list.length
    list.push({
      key: sectionKeyForIndex(index, type, header),
      title: pasteSection.title
        || sectionDisplayTitle({ header: header, lines: pasteSection.lyricLines || [] }),
      header: header,
      type: type,
      lyricLines: Array.isArray(pasteSection.lyricLines) ? pasteSection.lyricLines.slice() : [],
      chart: resolvedChart,
      chartRevisit: chartRevisit,
      sourceTypeKey: type,
      meter: meter,
      tempo: tempo,
      startLine: index,
    })
  })
  return list
}

/**
 * Normalize a stanza name for conflict checks (case/bracket insensitive).
 */
export function normalizeStanzaNameKey(name) {
  return stanzaNameKeyFromChordSheet(name)
}

/**
 * Find another chord section already using this stanza name.
 * Only non-revisit (chart source) sections conflict — repeated choruses may
 * share a name with their source via chartRevisit.
 */
export function findStanzaNameConflict(sections, sectionKey, newName) {
  const needle = normalizeStanzaNameKey(newName)
  if (!needle) return null
  const list = Array.isArray(sections) ? sections : []
  const target = list.find(function(s) { return s && s.key === sectionKey })
  for (let i = 0; i < list.length; i++) {
    const section = list[i]
    if (!section || section.key === sectionKey) continue
    if (section.chartRevisit) continue
    if (target && target.chartRevisit) continue
    const existing = normalizeStanzaNameKey(section.title || section.header || '')
    if (existing && existing === needle) return section
  }
  return null
}

/**
 * Rewrite lyric section headers when chord chart # headers are edited in bulk.
 * Deprecated: chord edits must not rewrite lyric markers. Always a no-op.
 * @returns {{ lines: string[], updated: boolean }}
 */
export function lyricLinesAfterHeaderPatches(sections, headerPatches, lyricLines) {
  void sections
  void headerPatches
  return {
    lines: Array.isArray(lyricLines)
      ? lyricLines.map(function(line) { return String(line == null ? '' : line) })
      : [],
    updated: false,
  }
}

/**
 * Rename a chord-editor section. Refuses when the name conflicts with another
 * section. Does not rewrite lyrics — lyric markers are the source of truth.
 *
 * @returns {{ ok: true, sections: array, updateLyrics: false, lyricLines } | { ok: false, error: string, conflict: object }}
 */
export function renameChordsEditorSection(sections, sectionKey, newName, lyricLines) {
  const list = Array.isArray(sections) ? sections.map(function(s) {
    return s ? Object.assign({}, s) : s
  }) : []
  const index = list.findIndex(function(s) { return s && s.key === sectionKey })
  if (index < 0) {
    return { ok: false, error: 'Section not found', conflict: null }
  }
  const trimmed = String(newName == null ? '' : newName).trim()
  if (!trimmed) {
    return { ok: false, error: 'Stanza name is required', conflict: null }
  }
  const conflict = findStanzaNameConflict(list, sectionKey, trimmed)
  if (conflict) {
    return {
      ok: false,
      error: 'Another block is already named "' + (conflict.title || conflict.header || trimmed) + '"',
      conflict: conflict,
    }
  }
  const header = formatLyricSectionHeader(trimmed)
  const type = normalizeSectionType(header)
  const title = sectionDisplayTitle({ header: header, lines: list[index].lyricLines || [] })
  list[index] = Object.assign({}, list[index], {
    header: header,
    title: title || trimmed,
    type: type,
    sourceTypeKey: type,
    lyricSectionHeader: header,
    lyricSectionType: type,
    writeNotationMarker: true,
  })
  return {
    ok: true,
    sections: list.map(function(section, i) {
      if (!section) return section
      return Object.assign({}, section, {
        key: sectionKeyForIndex(i, section.type, section.header),
        startLine: i,
      })
    }),
    updateLyrics: false,
    lyricLines: lyricLines,
  }
}

/**
 * Serialize editor sections to ABC-persisted chordSectionLabels.
 */
export function chordSectionLabelsFromSections(sections) {
  return (Array.isArray(sections) ? sections : []).map(function(section) {
    if (!section) {
      return { header: '', title: '', type: null, chartRevisit: false }
    }
    return {
      header: section.header || '',
      title: section.title || '',
      type: section.type || null,
      chartRevisit: !!section.chartRevisit,
    }
  })
}

function lyricSectionMatchesLabel(lyricSection, header, title) {
  if (!lyricSection) return false
  const want = normalizeStanzaNameKey(header || title)
  if (!want) return false
  const lyricKey = normalizeStanzaNameKey(lyricSection.header || lyricSection.title || '')
  return !!lyricKey && lyricKey === want
}

/**
 * Apply persisted stanza labels onto unified chord blocks, matching lyric body
 * by name instead of positional index when possible.
 */
export function applyChordSectionLabels(blocks, labels, lyricLines) {
  const list = Array.isArray(blocks) ? blocks : []
  const labelList = Array.isArray(labels) ? labels : []
  if (!labelList.length) return list
  const lyricSections = listLyricSections(lyricLines || [])
  const usedLyricIndexes = {}

  return list.map(function(block, index) {
    if (!block) return block
    const label = labelList[index]
    if (!label) return block
    const hasLabelContent = label.type != null
      || String(label.header || '').trim()
      || String(label.title || '').trim()
    if (!hasLabelContent) return block
    const header = label.header
      ? String(label.header)
      : formatLyricSectionHeader(label.title || '')
    const type = label.type != null
      ? label.type
      : (header ? normalizeSectionType(header) : null)
    const title = label.title
      || sectionDisplayTitle({ header: header, lines: [] })
      || (block.title || ('Section ' + (index + 1)))

    let matched = null
    let matchedIndex = -1
    for (let i = 0; i < lyricSections.length; i++) {
      if (usedLyricIndexes[i]) continue
      if (lyricSectionMatchesLabel(lyricSections[i], header, title)) {
        matched = lyricSections[i]
        matchedIndex = i
        break
      }
    }
    if (!matched && header) {
      const candidates = lyricSections.map(function(sec, i) {
        return {
          index: i,
          label: sec.header || sec.title || '',
        }
      }).filter(function(c) { return !usedLyricIndexes[c.index] })
      const fuzzy = bestStanzaNameMatch(header, candidates, { minScore: 0.85 })
      if (fuzzy && lyricSections[fuzzy.candidate.index]) {
        matched = lyricSections[fuzzy.candidate.index]
        matchedIndex = fuzzy.candidate.index
      }
    }
    if (matchedIndex >= 0) usedLyricIndexes[matchedIndex] = true

    return Object.assign({}, block, {
      header: header,
      title: title,
      type: type,
      sourceTypeKey: type,
      lyricSectionHeader: header,
      lyricSectionType: type,
      chartRevisit: label.chartRevisit != null ? !!label.chartRevisit : !!block.chartRevisit,
      lyricLines: matched
        ? matched.lines.slice()
        : (Array.isArray(block.lyricLines) ? block.lyricLines.slice() : []),
      key: sectionKeyForIndex(index, type, header),
      id: sectionKeyForIndex(index, type, header),
    })
  })
}
