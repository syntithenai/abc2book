/**
 * Lossy apply: merge notation/ABC chords onto plain lyrics as ChordPro inline text.
 */
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  hasLyricEmbeddedChords,
  mergeAlignedLyricBlockChords,
  stripChordsFromLyricLines,
} from './chordSheetUtils'
import {
  chordChartBlocksForTuneDisplay,
  chordNoteLinesFromTune,
} from './chordBlockMerge'
import { getPlainLyricLines } from './wLinesUtils'

/**
 * Serialize one ChordProLines token row to a ChordPro inline string.
 */
export function serializeChordProTokenLine(tokens) {
  return (Array.isArray(tokens) ? tokens : []).map(function(token) {
    const chord = String(token && token.chord || '').trim()
    const text = String(token && token.text != null ? token.text : '')
    if (!chord) return text
    const markers = chord.split(/\s+/).filter(Boolean)
      .map(function(c) { return '[' + c + ']' })
      .join('')
    return markers + text
  }).join('').replace(/\s+$/, '')
}

/**
 * Build ChordPro lyric lines from notation chords + lyrics (display merge path).
 * Does not mutate the tune or ABC.
 *
 * @param {object} tune
 * @param {{ chordChart: string, melodyNoteLines?: string[], lyricLines?: string[] }} options
 * @returns {{ ok: boolean, lyricLines?: string[], error?: string }}
 */
export function applyNotationChordsToLyricChordPro(tune, options) {
  const opts = options || {}
  const rawLines = Array.isArray(opts.lyricLines)
    ? opts.lyricLines.slice()
    : getPlainLyricLines(tune)
  if (!rawLines.some(function(line) { return String(line || '').trim() })) {
    return { ok: false, error: 'No lyrics to apply chords onto' }
  }

  const lyricLines = hasLyricEmbeddedChords(rawLines)
    ? stripChordsFromLyricLines(rawLines)
    : rawLines

  const melodyNoteLines = Array.isArray(opts.melodyNoteLines)
    ? opts.melodyNoteLines
    : chordNoteLinesFromTune(tune)
  const chordChart = String(opts.chordChart == null ? '' : opts.chordChart)
  if (!chordChart.trim()) {
    return { ok: false, error: 'No chord chart available from notation' }
  }

  const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, melodyNoteLines)
  if (!chordBlocks.some(chartBlockHasChords)) {
    return { ok: false, error: 'Notation has no chords to apply' }
  }

  const aligned = alignChordBlocksToLyrics(lyricLines, chordBlocks, {
    title: tune && tune.name,
    composer: tune && tune.composer,
    melodyNoteLines: melodyNoteLines,
  })

  const out = []
  aligned.forEach(function(block, bi) {
    if (bi > 0 && out.length > 0 && out[out.length - 1] !== '') {
      out.push('')
    }
    if (Array.isArray(block.prefaceLines) && block.prefaceLines.length) {
      block.prefaceLines.forEach(function(line) { out.push(line) })
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
    }
    if (block.header) out.push(block.header)

    const hasWords = block.lyricLines.some(function(line) {
      return String(line).trim().length > 0
    })
    const tokens = !!(block.inlineChords && block.chart && hasWords)
      ? mergeAlignedLyricBlockChords(block, melodyNoteLines)
      : null

    if (!tokens || !tokens.length) {
      block.lyricLines.forEach(function(line) { out.push(line) })
      return
    }

    let tokenIndex = 0
    block.lyricLines.forEach(function(line) {
      const words = String(line || '').trim().split(/\s+/).filter(Boolean)
      if (!words.length) {
        out.push(line)
        return
      }
      const row = tokens[tokenIndex]
      tokenIndex += 1
      out.push(row ? serializeChordProTokenLine(row) : line)
    })
    while (tokenIndex < tokens.length) {
      const row = tokens[tokenIndex]
      tokenIndex += 1
      if (row && row.some(function(tok) { return String(tok && tok.chord || '').trim() })) {
        out.push(serializeChordProTokenLine(row))
      }
    }
  })

  return { ok: true, lyricLines: out }
}
