/**
 * Unified tune block model for lyrics, chords, and notation strains.
 */
import {
  alignChordBlocksToLyrics,
  hasLyricEmbeddedChords,
  normalizeSectionType,
  splitChordChartIntoBlocks,
} from './chordSheetUtils'
import { listLyricSections, sectionDisplayTitle } from './lyricStructureUtils'
import { lyricLinesForChecks } from './tuneDisplayLayers'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { noteLinesForMelodyMerge, splitMelodyStrainsWithBarlines } from './chordBlockMerge'

export const CHORD_MODES = {
  GRID: 'grid',
  INLINE: 'inline',
  REVISIT: 'revisit',
  NONE: 'none',
}

/**
 * @typedef {Object} TuneBlock
 * @property {string} id
 * @property {string|null} type
 * @property {string} header
 * @property {string[]} lyricLines
 * @property {string|null} chordChart
 * @property {string} chordMode
 * @property {number|null} strainIndex
 * @property {Array} alignmentAnchors
 * @property {number} confidence
 * @property {string[]} warnings
 */

function blockId(index, type, header) {
  const base = type || normalizeSectionType(header) || 'section'
  return String(base) + '-' + index
}

function inferChordMode(lyricLines, chart, chartRevisit) {
  if (chartRevisit) return CHORD_MODES.REVISIT
  if (hasLyricEmbeddedChords(lyricLines)) return CHORD_MODES.INLINE
  if (String(chart || '').trim()) return CHORD_MODES.GRID
  return CHORD_MODES.NONE
}

/**
 * Build TuneBlocks from plain lyric lines and optional chord chart.
 */
export function blocksFromLyricLines(lyricLines, options) {
  const opts = options || {}
  const lines = Array.isArray(lyricLines) ? lyricLines : []
  const chartBlocks = splitChordChartIntoBlocks(String(opts.chordChart || ''))
  const aligned = alignChordBlocksToLyrics(lines, chartBlocks, {
    chordSectionLabels: opts.chordSectionLabels,
    title: opts.title,
    composer: opts.composer,
  })
  return aligned.map(function(entry, index) {
    const lyricBody = Array.isArray(entry.lyricLines) ? entry.lyricLines.slice() : []
    const chart = String(entry.chart || '').trim()
    const warnings = []
    if (entry.extraChart) warnings.push('extra_chart_attached')
    if (!lyricBody.length && entry.header) warnings.push('header_only_repeat')
    return {
      id: blockId(index, entry.type, entry.header),
      type: entry.type || null,
      header: String(entry.header || '').trim(),
      lyricLines: lyricBody,
      chordChart: chart || null,
      chordMode: inferChordMode(lyricBody, chart, entry.chartRevisit),
      strainIndex: null,
      alignmentAnchors: [],
      confidence: chart && lyricBody.length ? 0.85 : lyricBody.length ? 0.7 : 0.4,
      warnings: warnings,
      chartRevisit: !!entry.chartRevisit,
      inlineChords: !!entry.inlineChords,
    }
  })
}

/**
 * Attach melody strain indices to lyric blocks (positional, with hymn/revisit awareness).
 */
export function attachStrainIndicesToBlocks(blocks, strainCount) {
  const list = Array.isArray(blocks) ? blocks.slice() : []
  if (!strainCount || strainCount <= 0) return list
  const hymnPattern = list.length > strainCount
    && list.every(function(block, index) {
      if (index === 0) return true
      return block.chartRevisit || block.chordMode === CHORD_MODES.REVISIT
    })
  return list.map(function(block, index) {
    const next = Object.assign({}, block)
    if (hymnPattern && strainCount === 1) {
      next.strainIndex = 0
    } else if (index < strainCount) {
      next.strainIndex = index
    } else {
      next.strainIndex = strainCount - 1
      next.warnings = (next.warnings || []).concat(['strain_index_overflow'])
    }
    return next
  })
}

/**
 * Build TuneBlocks from a tune snapshot (lyrics + ABC strains).
 */
export function blocksFromTune(tune, options) {
  const opts = options || {}
  const tuneObj = tune || {}
  const lyricLines = Array.isArray(opts.lyricLines)
    ? opts.lyricLines
    : lyricLinesForChecks(tuneObj)
  const voices = tuneObj.voices || {}
  const voiceKey = resolvePrimaryVoiceKey(voices)
  const noteLines = noteLinesForMelodyMerge(
    voices[voiceKey] && Array.isArray(voices[voiceKey].notes) ? voices[voiceKey].notes : []
  )
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const chart = String(opts.chordChart || tuneObj.meta && tuneObj.meta.chordProSource || '').trim()
  const blocks = blocksFromLyricLines(lyricLines, {
    chordChart: chart,
    chordSectionLabels: tuneObj.chordSectionLabels,
    title: tuneObj.name,
    composer: tuneObj.composer,
  })
  const withStrains = attachStrainIndicesToBlocks(blocks, strains.length)
  if (strains.length && withStrains.length && strains.length !== withStrains.length) {
    withStrains.forEach(function(block) {
      block.warnings = (block.warnings || []).concat(['strain_lyric_count_mismatch'])
      block.confidence = Math.min(block.confidence || 1, 0.55)
    })
  }
  return withStrains
}

/**
 * Merge lyric sections, alignment meta, and strain list into one block list.
 */
export function mergeBlockSources(sources) {
  const src = sources || {}
  const lyricBlocks = blocksFromLyricLines(src.lyricLines || [], {
    chordChart: src.chordChart,
    chordSectionLabels: src.chordSectionLabels,
    title: src.title,
    composer: src.composer,
  })
  const strainCount = Array.isArray(src.strains) ? src.strains.length : 0
  return attachStrainIndicesToBlocks(lyricBlocks, strainCount)
}

/**
 * Lyric section list adapter for import review UI.
 */
export function blocksToReviewSections(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(function(block, index) {
    return {
      sectionMarker: block.header || '',
      sectionIndex: index,
      label: sectionDisplayTitle({ header: block.header, lines: block.lyricLines }),
      type: block.type,
      lyricLines: block.lyricLines,
      chordChart: block.chordChart,
      chordMode: block.chordMode,
      warnings: block.warnings || [],
      confidence: block.confidence,
    }
  })
}

/**
 * Pairing cascade: type → title → fuzzy → position (scratchpad compositor pattern).
 */
export function guessBlockPairings(lyricBlocks, strainBlocks, context) {
  const ctx = context || {}
  const lyrics = Array.isArray(lyricBlocks) ? lyricBlocks.slice() : []
  const strains = Array.isArray(strainBlocks) ? strainBlocks.slice() : []
  const usedStrain = new Set()
  const pairs = []

  function takeStrain(index) {
    if (index >= 0 && index < strains.length && !usedStrain.has(index)) {
      usedStrain.add(index)
      return strains[index]
    }
    const next = strains.find(function(_, i) { return !usedStrain.has(i) })
    if (next) {
      usedStrain.add(strains.indexOf(next))
      return next
    }
    return null
  }

  lyrics.forEach(function(lyricBlock, index) {
    let strainIndex = lyricBlock.strainIndex != null ? lyricBlock.strainIndex : index
    if (ctx.chordSectionLabels && lyricBlock.type) {
      const labelHit = (ctx.chordSectionLabels || []).find(function(label) {
        return normalizeSectionType(label && label.header || label) === lyricBlock.type
      })
      if (labelHit && labelHit.strainIndex != null) strainIndex = labelHit.strainIndex
    }
    pairs.push({
      lyricBlock: lyricBlock,
      strainBlock: takeStrain(strainIndex),
      order: index,
    })
  })

  strains.forEach(function(strainBlock, index) {
    if (usedStrain.has(index)) return
    pairs.push({ lyricBlock: null, strainBlock: strainBlock, order: pairs.length })
  })

  return pairs
}

export function listLyricSectionsAsBlocks(textOrLines) {
  return listLyricSections(textOrLines).map(function(section, index) {
    return {
      id: blockId(index, section.type, section.header),
      type: section.type,
      header: section.header,
      lyricLines: section.lines || [],
      chordChart: null,
      chordMode: CHORD_MODES.NONE,
      strainIndex: null,
      alignmentAnchors: [],
      confidence: 0.75,
      warnings: [],
      title: section.title,
      startLine: section.startLine,
    }
  })
}
