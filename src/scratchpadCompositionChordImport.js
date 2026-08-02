import { fillEmptyTuneFieldsFromMeta } from './applyChordSheetToTune'
import {
  parseChordSheetText,
  extractPreservedChordProLyricLines,
  createTuneFromChordSheet,
  lineHasChordProInlineChords,
} from './chordProFormatUtils'
import { listPasteChordSections } from './chordsEditorSections'
import { listLyricSections } from './lyricStructureUtils'
import {
  hasLyricEmbeddedChords,
  classifyLyricChordLines,
  splitChordChartIntoBlocks,
  extractChordSequence,
  normalizeStanzaNameKey,
  isSectionHeader,
} from './chordSheetUtils'
import { setPlainLyricLines } from './wLinesUtils'
import utilsFunctions from './utilsFunctions'

const utils = utilsFunctions()

export function generateCompositionChunkId() {
  return utils.generateObjectId()
}

function textBlockHasRecognizedChords(text) {
  const raw = String(text || '').trim()
  if (!raw) return false
  if (extractChordSequence(raw).length > 0) return true
  const lines = raw.split(/\r?\n/)
  if (hasLyricEmbeddedChords(lines)) return true
  for (let i = 0; i < lines.length; i += 1) {
    if (lineHasChordProInlineChords(lines[i])) return true
  }
  return false
}

/**
 * Detect chord content using the same signals as import / paste chord sheet flows.
 */
export function sectionHasImportableChordContent(text) {
  const raw = String(text || '').trim()
  if (!raw) return false
  const lines = raw.split(/\r?\n/)
  if (hasLyricEmbeddedChords(lines)) return true

  for (let i = 0; i < lines.length; i += 1) {
    if (lineHasChordProInlineChords(lines[i])) return true
  }

  const chartBlocks = splitChordChartIntoBlocks(raw)
  for (let i = 0; i < chartBlocks.length; i += 1) {
    if (textBlockHasRecognizedChords(chartBlocks[i])) return true
  }

  try {
    const parsed = parseChordSheetText(raw, {
      preservePlacement: true,
      fallbackTitle: 'Section',
    })
    const chordText = String(parsed.chordText || '').trim()
    if (chordText && textBlockHasRecognizedChords(chordText)) return true
    const sections = listPasteChordSections(parsed)
    if (sections.some(function(section) {
      return textBlockHasRecognizedChords(section.chart)
    })) return true
  } catch (e) {
    // not a chord sheet
  }

  return false
}

export function detectEmbeddedChordsInText(text) {
  return sectionHasImportableChordContent(text)
}

export function lyricSectionHasMarkerHeader(section) {
  const header = String(section && section.header || '').trim()
  if (!header) return false
  return /^#+\s+/.test(header) || /^\[.+\]$/.test(header) || isSectionHeader(header)
}

export function analyzeTextForCompositionSelect(text) {
  const raw = String(text || '')
  const lines = raw.split(/\r?\n/)
  const classified = classifyLyricChordLines(lines)
  let hasChordLines = false
  let hasLyricLines = false
  let hasEmbeddedChords = false

  classified.forEach(function(item) {
    if (item.type === 'chord') hasChordLines = true
    if (item.type === 'lyric' && String(item.text || '').trim()) hasLyricLines = true
  })
  for (let i = 0; i < lines.length; i += 1) {
    if (lineHasChordProInlineChords(lines[i])) hasEmbeddedChords = true
  }

  const hasChords = hasChordLines || hasEmbeddedChords || sectionHasImportableChordContent(raw)
  const contentLines = classified.filter(function(item) {
    return item.type !== 'blank' && item.type !== 'header'
  })
  const isChordOnly = contentLines.length > 0 && contentLines.every(function(item) {
    return item.type === 'chord'
  })
  const sections = listLyricSections(raw)
  const markedSections = sections.filter(function(section) {
    return lyricSectionHasMarkerHeader(section)
  })

  return {
    hasLyrics: hasLyricLines || (!hasChords && contentLines.length > 0),
    hasChords: hasChords,
    isChordOnly: isChordOnly,
    sections: sections,
    markedSections: markedSections,
  }
}

export function plainLyricsTextForCompositionImport(text) {
  const raw = String(text || '')
  const analysis = analyzeTextForCompositionSelect(raw)
  if (!analysis.hasChords) return raw
  return plainLyricLinesFromText(raw).join('\n').trim()
}

export function findLyricSectionIndexByMarker(sections, marker) {
  const list = Array.isArray(sections) ? sections : []
  const rawMarker = String(marker || '').trim()
  if (!rawMarker || !list.length) return -1
  const want = normalizeStanzaNameKey(rawMarker)
  for (let i = 0; i < list.length; i += 1) {
    const section = list[i]
    if (!section || !section.header) continue
    const header = String(section.header).trim()
    if (header === rawMarker) return i
    if (want && normalizeStanzaNameKey(header) === want) return i
  }
  return -1
}

function sectionLinesToText(section, item) {
  if (!section) return ''
  const lines = []
  if (section.header) lines.push(section.header)
  ;(section.lines || []).forEach(function(line) { lines.push(String(line || '')) })
  const bodyText = lines.join('\n')
  const chordPro = item && item.text
    ? String(item.text.chordProSource || '').trim()
    : ''
  if (chordPro && !sectionHasImportableChordContent(bodyText) && sectionHasImportableChordContent(chordPro)) {
    return chordPro
  }
  return bodyText
}

export function resolveTextSectionChunk(item, chunk) {
  if (!item || item.type !== 'text' || !item.text || !chunk) {
    return { resolved: false, text: '', sectionIndex: -1 }
  }
  if (chunk.wholeItem) {
    return {
      resolved: true,
      text: sectionTextForChunk(item, chunk),
      sectionIndex: null,
      sectionMarker: null,
    }
  }
  const sections = listLyricSections(item.text.body || '')
  const marker = String(chunk.sectionMarker || '').trim()
  if (marker) {
    const idx = findLyricSectionIndexByMarker(sections, marker)
    if (idx < 0) {
      return {
        resolved: false,
        text: '',
        sectionIndex: -1,
        sectionMarker: marker,
      }
    }
    const section = sections[idx]
    return {
      resolved: true,
      text: sectionLinesToText(section, item),
      sectionIndex: idx,
      sectionMarker: section.header || marker,
    }
  }
  const idx = chunk.sectionIndex != null ? chunk.sectionIndex : 0
  if (idx < 0 || idx >= sections.length) {
    return { resolved: false, text: '', sectionIndex: idx }
  }
  const section = sections[idx]
  return {
    resolved: true,
    text: sectionLinesToText(section, item),
    sectionIndex: idx,
    sectionMarker: section.header || '',
  }
}

export function isLyricsChunkSourceResolved(item, chunk) {
  if (!chunk) return false
  if (chunk.sourceKind !== 'text-section') return true
  if (chunk.wholeItem) return true
  if (!item || item.type !== 'text') return false
  return resolveTextSectionChunk(item, chunk).resolved
}

export function sectionTextFromItem(item, sectionIndex) {
  if (!item || item.type !== 'text' || !item.text) return ''
  const sections = listLyricSections(item.text.body || '')
  const section = sections[sectionIndex != null ? sectionIndex : 0]
  if (!section) return String(item.text.body || '')
  return sectionLinesToText(section, item)
}

export function imageBlockText(item, blockId) {
  if (!item || item.type !== 'image' || !item.image) return ''
  const blocks = Array.isArray(item.image.textBlocks) ? item.image.textBlocks : []
  const block = blocks.find(function(entry) { return entry && entry.id === blockId })
  return block ? String(block.text || '') : ''
}

export function sectionTextForChunk(item, chunk) {
  if (!item || !chunk) return ''
  if (chunk.sourceKind === 'image-text-block') {
    return imageBlockText(item, chunk.sourceBlockId)
  }
  if (item.type === 'text') {
    if (chunk.wholeItem) {
      const body = String(item.text.body || '')
      const chordPro = String(item.text.chordProSource || '').trim()
      if (chordPro && !sectionHasImportableChordContent(body) && sectionHasImportableChordContent(chordPro)) {
        return chordPro
      }
      return body
    }
    const resolved = resolveTextSectionChunk(item, chunk)
    return resolved.resolved ? resolved.text : ''
  }
  if (item.type === 'image' && chunk.sourceBlockId) {
    return imageBlockText(item, chunk.sourceBlockId)
  }
  return ''
}

/**
 * Apply ChordPro / chord-sheet parsing to a composition working tune (local only).
 */
export function standardizeTextToChordProOnTune(tune, text, options) {
  const opts = options || {}
  const sourceText = String(text || '').trim()
  if (!tune || !sourceText) {
    return { ok: false, error: { message: 'Missing tune or text' } }
  }

  let parsed
  try {
    parsed = parseChordSheetText(sourceText, {
      fallbackTitle: tune.name,
      preservePlacement: true,
    })
  } catch (e) {
    return { ok: false, error: { message: (e && e.message) ? e.message : 'Could not parse chord sheet' } }
  }

  const next = Object.assign({}, tune)
  next.meta = Object.assign({}, next.meta || {})
  next.meta.chordProSource = parsed.chordProSource || sourceText
  if (parsed.chordSheetAlignment !== undefined) {
    next.meta.chordSheetAlignment = parsed.chordSheetAlignment
  }

  fillEmptyTuneFieldsFromMeta(next, {
    title: parsed.title,
    name: parsed.title,
    composer: parsed.composer,
    key: parsed.key,
    capo: parsed.capo,
    tempo: parsed.tempo,
    meter: parsed.meter,
  })

  let lyricLines = Array.isArray(parsed.lyricLines) ? parsed.lyricLines.slice() : []
  const preserved = extractPreservedChordProLyricLines(sourceText)
  if (preserved.length) {
    lyricLines = preserved
  }
  if (!opts.skipLyrics) {
    setPlainLyricLines(next, lyricLines)
  }

  return { ok: true, tune: next, parsed: parsed, lyricLines: lyricLines }
}

/**
 * Build a chord-sheet notation chunk from text (skeleton ABC + chord grid).
 */
export function createChordSheetNotationChunk(text, options) {
  const opts = options || {}
  const sourceText = String(text || '').trim()
  const chordMode = opts.chordMode === 'chords-and-lyrics' ? 'chords-and-lyrics' : 'chords-only'
  if (!sourceText) {
    return { ok: false, error: { message: 'Text is empty' } }
  }

  let parsed
  try {
    parsed = parseChordSheetText(sourceText, {
      fallbackTitle: opts.title || 'Chord sheet',
      preservePlacement: true,
    })
  } catch (e) {
    return { ok: false, error: { message: (e && e.message) ? e.message : 'Could not parse chord sheet' } }
  }

  let derivedTuneSnapshot = null
  if (opts.tunebook && opts.abcjsParser) {
    try {
      derivedTuneSnapshot = createTuneFromChordSheet({
        draft: parsed,
        tunebook: opts.tunebook,
        abcjsParser: opts.abcjsParser,
      })
      if (chordMode === 'chords-only') {
        setPlainLyricLines(derivedTuneSnapshot, [])
      }
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) ? e.message : 'Could not build chord scaffold' } }
    }
  }

  const chunkId = generateCompositionChunkId()
  const label = opts.label || parsed.title || 'Chord sheet'
  const chunk = {
    id: chunkId,
    sourceKind: 'chord-sheet',
    sourceItemId: opts.sourceItemId || '',
    sourceBlockId: opts.sourceBlockId || '',
    sectionIndex: opts.sectionIndex != null ? opts.sectionIndex : undefined,
    wholeItem: opts.wholeItem || false,
    chordMode: chordMode,
    label: label,
    order: opts.order != null ? opts.order : 0,
    enabled: true,
    derivedTuneSnapshot: derivedTuneSnapshot,
    sourceText: sourceText,
    parsed: {
      chordProSource: parsed.chordProSource || sourceText,
      chordSheetAlignment: parsed.chordSheetAlignment,
      lyricLines: parsed.lyricLines || [],
      title: parsed.title,
    },
  }

  return { ok: true, chunk: chunk, parsed: parsed, derivedTuneSnapshot: derivedTuneSnapshot }
}

/**
 * Strip chord-only lines from text for plain-lyrics import.
 */
export function plainLyricLinesFromText(text) {
  const lines = String(text || '').split(/\r?\n/)
  const classified = classifyLyricChordLines(lines)
  return classified
    .filter(function(item) { return item.type !== 'chord' })
    .map(function(item) { return item.text })
}
