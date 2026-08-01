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

export function sectionTextFromItem(item, sectionIndex) {
  if (!item || item.type !== 'text' || !item.text) return ''
  const sections = listLyricSections(item.text.body || '')
  const section = sections[sectionIndex != null ? sectionIndex : 0]
  if (!section) return String(item.text.body || '')
  const lines = []
  if (section.header) lines.push(section.header)
  section.lines.forEach(function(line) { lines.push(String(line || '')) })
  const bodyText = lines.join('\n')
  const chordPro = String(item.text.chordProSource || '').trim()
  if (chordPro && !sectionHasImportableChordContent(bodyText) && sectionHasImportableChordContent(chordPro)) {
    return chordPro
  }
  return bodyText
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
    return sectionTextFromItem(item, chunk.sectionIndex)
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
