/**
 * Lossy apply: merge notation/ABC chords onto plain lyrics as ChordPro inline text.
 */
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  hasLyricEmbeddedChords,
  linesHaveChordProInlineChords,
  mergeAlignedLyricBlockChords,
  stripChordsFromLyricLines,
  tokenIsChord,
} from './chordSheetUtils'
import {
  chordChartBlocksForTuneDisplay,
  chordNoteLinesFromTune,
} from './chordBlockMerge'
import { getPlainLyricLines } from './wLinesUtils'

/**
 * True when ABC note text contains quoted chord symbols (e.g. `"Am"`),
 * ignoring section-label quotes such as `"[Verse 1]"`.
 */
export function abcTextHasQuotedChords(abcText) {
  const text = String(abcText || '')
  const re = /"([^"]*)"/g
  let match
  while ((match = re.exec(text)) !== null) {
    if (tokenIsChord(String(match[1] || '').trim())) return true
  }
  return false
}

/**
 * Offer a prominent copy-from-notation action when ABC has quoted chords and
 * the lyrics are not already a ChordPro chord sheet.
 *
 * @param {object} tune
 * @param {string[]|string} lyricLines
 */
export function shouldOfferChordsFromNotation(tune, lyricLines) {
  const lines = Array.isArray(lyricLines)
    ? lyricLines
    : String(lyricLines == null ? '' : lyricLines).split(/\r?\n/)
  if (linesHaveChordProInlineChords(lines)) return false
  return abcTextHasQuotedChords(chordNoteLinesFromTune(tune).join('\n'))
}

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
 * Build a concert-pitch chord chart from notation for writing into lyrics.
 * Transpose/capo stay display-only so stored lyric chords match ABC.
 *
 * @param {object} tune
 * @param {{ abcjsParser: object, abcTools?: object, tunebook?: object, melodyNoteLines?: string[] }} options
 * @returns {{ chordChart: string, melodyNoteLines: string[] }}
 */
export function buildUntransposedNotationChordChart(tune, options) {
  const opts = options || {}
  const abcjsParser = opts.abcjsParser
  const abcTools = opts.abcTools || (opts.tunebook && opts.tunebook.abcTools)
  const melodyNoteLines = Array.isArray(opts.melodyNoteLines)
    ? opts.melodyNoteLines
    : chordNoteLinesFromTune(tune)
  if (!melodyNoteLines.length || !abcjsParser || typeof abcjsParser.renderChords !== 'function') {
    return { chordChart: '', melodyNoteLines: melodyNoteLines }
  }
  let chordChart = ''
  try {
    const melodyAbc = abcTools && typeof abcTools.emptyABC === 'function'
      ? abcTools.emptyABC(tune && tune.name) + melodyNoteLines.join('\n')
      : melodyNoteLines.join('\n')
    chordChart = melodyAbc
      ? abcjsParser.renderChords(
        melodyAbc,
        false,
        0,
        tune && tune.key,
        tune && tune.noteLength,
        tune && tune.meter
      ) || ''
      : ''
  } catch (e) {
    chordChart = ''
  }
  return { chordChart: chordChart, melodyNoteLines: melodyNoteLines }
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

    block.lyricLines.forEach(function(line, lineIndex) {
      const words = String(line || '').trim().split(/\s+/).filter(Boolean)
      if (!words.length) {
        out.push(line)
        return
      }
      const row = tokens[lineIndex]
      if (row && row.length) {
        out.push(serializeChordProTokenLine(row))
      } else {
        out.push(line)
      }
    })
    for (let ti = block.lyricLines.length; ti < tokens.length; ti += 1) {
      const row = tokens[ti]
      if (row && row.some(function(tok) { return String(tok && tok.chord || '').trim() })) {
        out.push(serializeChordProTokenLine(row))
      }
    }
  })

  return { ok: true, lyricLines: out }
}
