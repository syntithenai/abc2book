import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  normalizeSectionType,
  splitChordChartIntoBlocks,
} from './chordSheetUtils'
import {
  formatLyricSectionHeader,
  listLyricSections,
  sectionDisplayTitle,
} from './lyricStructureUtils'
import { normalizeMeter } from './barModel'

const METER_TOKEN_RE = /\[M:\s*([^\]]+)\]/gi

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
 * Remove [M:…] tokens from chord chart text (keeps chord/bar content).
 */
export function stripMeterMarkers(chart) {
  return String(chart == null ? '' : chart)
    .replace(METER_TOKEN_RE, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/**
 * Ensure a chart block begins with [M:…] when meter is set and differs from previous.
 */
export function prependMeterMarker(chart, meter, previousMeter) {
  const clean = stripMeterMarkers(chart)
  const nextMeter = normalizeMeter(meter)
  const prev = previousMeter ? normalizeMeter(previousMeter) : null
  // First sounding section uses ABC header M:; only later changes get [M:].
  if (!nextMeter || !prev || nextMeter === prev) {
    return clean
  }
  if (!clean) return '[M:' + nextMeter + ']'
  return '[M:' + nextMeter + '] ' + clean
}

function lyricsHaveContent(lyricLines) {
  if (!Array.isArray(lyricLines)) return false
  return lyricLines.some(function(line) {
    return String(line == null ? '' : line).trim().length > 0
  })
}

function sectionKeyForIndex(index, type, header) {
  const base = type || (header ? String(header).replace(/\W+/g, '-').toLowerCase() : 'section')
  return base + '-' + index
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
  const lyricLines = Array.isArray(opts.lyricLines) ? opts.lyricLines : []
  const fullChart = String(opts.chordChart == null ? '' : opts.chordChart)
  const blocks = splitChordChartIntoBlocks(fullChart)

  if (!lyricsHaveContent(lyricLines)) {
    const meter = extractMeterFromChartBlock(fullChart) || defaultMeter
    return [{
      key: 'chords-0',
      title: 'Chords',
      header: '',
      type: null,
      lyricLines: [],
      chart: stripMeterMarkers(fullChart),
      chartRevisit: false,
      sourceTypeKey: null,
      meter: meter,
      startLine: 0,
    }]
  }

  const aligned = alignChordBlocksToLyrics(lyricLines, blocks, Object.assign({}, opts.alignOptions || null, {
    chordSectionLabels: Array.isArray(opts.chordSectionLabels)
      ? opts.chordSectionLabels
      : (opts.alignOptions && opts.alignOptions.chordSectionLabels) || null,
  }))
  const lyricSections = listLyricSections(lyricLines)
  let previousMeter = null

  return aligned.map(function(block, index) {
    const lyricSection = lyricSections[index] || null
    const rawChart = String(block.chart || '')
    const blockMeter = extractMeterFromChartBlock(rawChart)
      || extractMeterFromChartBlock(block.extraChart)
      || (index === 0 ? defaultMeter : previousMeter)
      || defaultMeter
    const meter = normalizeMeter(blockMeter)
    if (!block.chartRevisit) previousMeter = meter

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
      chart: stripMeterMarkers(rawChart),
      chartRevisit: !!block.chartRevisit,
      sourceTypeKey: type || null,
      meter: meter,
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
export function reconcileChordSectionsFromGrid(sections, gridText, defaultMeter) {
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
  const meterFallback = normalizeMeter(defaultMeter || '4/4')

  for (let i = 0; i < Math.max(editable.length, blocks.length); i++) {
    const chartRaw = i < blocks.length ? blocks[i] : ''
    const blockMeter = extractMeterFromChartBlock(chartRaw)
      || previousMeter
      || meterFallback
    const meter = normalizeMeter(blockMeter)
    const chart = stripMeterMarkers(chartRaw)
    previousMeter = meter

    if (i < editable.length) {
      const idx = editable[i]
      const section = list[idx]
      list[idx] = Object.assign({}, section, {
        chart: chart,
        meter: meter,
      })
      const typeKey = section.sourceTypeKey || section.type
      if (typeKey) {
        list.forEach(function(sib, si) {
          if (!sib || si === idx) return
          if ((sib.sourceTypeKey || sib.type) !== typeKey) return
          if (!sib.chartRevisit) return
          list[si] = Object.assign({}, sib, { chart: chart, meter: meter })
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
        startLine: index,
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
 * Emits [M:…] when a section’s meter differs from the previous emitted meter.
 * Empty sections emit a single bar `|` so the slot survives blank-line splitting.
 */
export function rebuildChordGridFromSections(sections) {
  const parts = []
  let previousMeter = null
  ;(Array.isArray(sections) ? sections : []).forEach(function(section) {
    if (!section || section.chartRevisit) return
    const meter = normalizeMeter(section.meter || previousMeter || '4/4')
    const chart = prependMeterMarker(section.chart || '', meter, previousMeter)
    previousMeter = meter
    const trimmed = String(chart).trim()
    parts.push(trimmed || '|')
  })
  return parts.join('\n\n')
}

/**
 * Update chart (and optional meter) for a section. When the section shares a
 * type with others, the first source of that type is updated and revisits follow.
 */
export function replaceSectionChart(sections, sectionKey, newChart, newMeter) {
  const list = Array.isArray(sections) ? sections.slice() : []
  const index = list.findIndex(function(s) { return s && s.key === sectionKey })
  if (index < 0) return list
  const target = list[index]
  const chart = stripMeterMarkers(newChart)
  const meter = newMeter != null ? normalizeMeter(newMeter) : target.meter
  const typeKey = target.sourceTypeKey || target.type

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
        return Object.assign({}, section, { chart: chart, meter: meter, chartRevisit: false })
      }
      return Object.assign({}, section, {
        chart: chart,
        meter: meter,
        chartRevisit: true,
      })
    })
  }

  return list.map(function(section, i) {
    if (i !== index) return section
    return Object.assign({}, section, { chart: chart, meter: meter })
  })
}

/**
 * Update only the meter on a section (and shared type siblings).
 */
export function replaceSectionMeter(sections, sectionKey, newMeter) {
  const list = Array.isArray(sections) ? sections : []
  const found = list.find(function(s) { return s && s.key === sectionKey })
  if (!found) return list.slice()
  return replaceSectionChart(sections, sectionKey, found.chart, newMeter)
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
export function appendChordsEditorSection(sections, name, defaultMeter) {
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
  list.push({
    key: sectionKeyForIndex(index, type, header),
    title: title || 'Untitled section',
    header: header,
    type: type,
    lyricLines: [],
    chart: '',
    chartRevisit: false,
    sourceTypeKey: type,
    meter: normalizeMeter(defaultMeter || (list[0] && list[0].meter) || '4/4'),
    startLine: index,
  })
  return list
}

/**
 * Insert a new empty chord section after the section with afterKey.
 * If afterKey is missing, appends at the end.
 */
export function insertChordsEditorSectionAfter(sections, afterKey, name, defaultMeter) {
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
  list.splice(insertAt, 0, {
    key: 'tmp-insert',
    title: title || 'Untitled section',
    header: header,
    type: type,
    lyricLines: [],
    chart: '',
    chartRevisit: false,
    sourceTypeKey: type,
    meter: normalizeMeter(
      defaultMeter || (neighbour && neighbour.meter) || (list[0] && list[0].meter) || '4/4'
    ),
    startLine: insertAt,
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
 * Paste sheet → section list for review (chords only; lyrics used for labels/match).
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
        ;(Array.isArray(pair.chordLines) ? pair.chordLines : []).forEach(function(line) {
          let text = String(line || '').trim()
          if (!text) return
          if (!text.endsWith('|')) text += '|'
          chordLines.push(text)
        })
      })
      const chart = chordLines.join('\n')
      return {
        key: 'paste-' + index,
        title: sectionDisplayTitle({ header: header, lines: block.lines || [] }),
        header: header,
        type: type,
        lyricLines: Array.isArray(block.lines) ? block.lines.slice() : [],
        chart: chart,
        meter: normalizeMeter(parsed.meter || '4/4'),
      }
    }).filter(function(section) {
      return chartBlockHasChords(section.chart) || (section.lyricLines && section.lyricLines.length)
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
      chart: stripMeterMarkers(chart),
      meter: normalizeMeter(parsed.meter || '4/4'),
    }]
  }
  return blocks.map(function(block, index) {
    return {
      key: 'paste-' + index,
      title: 'Section ' + (index + 1),
      header: '',
      type: null,
      lyricLines: [],
      chart: stripMeterMarkers(block),
      meter: extractMeterFromChartBlock(block) || normalizeMeter(parsed.meter || '4/4'),
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
    return replaceSectionChart(list, match.key, pasteSection.chart, pasteSection.meter || match.meter)
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
        chart: stripMeterMarkers(pasteSection.chart || ''),
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
    const chart = stripMeterMarkers(pasteSection.chart || '')
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
      startLine: index,
    })
  })
  return list
}

/**
 * Normalize a stanza name for conflict checks (case/bracket insensitive).
 */
export function normalizeStanzaNameKey(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-–—−•*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
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
 * Rename a chord-editor section. Refuses when the name conflicts with another
 * section. Does not rewrite lyrics text.
 *
 * @returns {{ ok: true, sections: array } | { ok: false, error: string, conflict: object }}
 */
export function renameChordsEditorSection(sections, sectionKey, newName) {
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
