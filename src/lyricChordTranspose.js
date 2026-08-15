import { applyChordDisplayTranspose } from './chordKeyMergeOptions'
import {
  classifyLyricChordLines,
  lineHasChordProInlineChords,
  parseChordProInlineLyricLine,
} from './chordSheetUtils'

function serializeChordProTokensKeepingChords(tokens) {
  return (Array.isArray(tokens) ? tokens : []).map(function(token) {
    const chord = String(token && token.chord || '').trim()
    const text = String(token && token.text != null ? token.text : '')
    return chord ? ('[' + chord + ']' + text) : text
  }).join('')
}

/**
 * Transpose chord names embedded in lyric text (ChordPro `[Am]` or COW rows).
 * Leaves headers, blank lines, and sung words unchanged.
 *
 * @param {string[]|string} lines
 * @param {number} semitones
 * @param {string} [sourceKey]
 * @returns {string[]}
 */
export function transposeLyricEmbeddedChords(lines, semitones, sourceKey) {
  const amount = Number(semitones) || 0
  const source = Array.isArray(lines) ? lines : String(lines || '').split(/\r?\n/)
  if (!amount) return source.slice()

  return classifyLyricChordLines(source).map(function(item) {
    if (item.type === 'blank') return ''
    if (item.type === 'header') return String(item.text || '')
    if (item.type === 'chord') {
      return applyChordDisplayTranspose(item.text, amount, sourceKey)
    }
    const raw = String(item.text || '')
    if (!lineHasChordProInlineChords(raw)) return raw
    const tokens = parseChordProInlineLyricLine(raw).map(function(token) {
      if (!token || !token.chord) return token
      return Object.assign({}, token, {
        chord: applyChordDisplayTranspose(token.chord, amount, sourceKey),
      })
    })
    return serializeChordProTokensKeepingChords(tokens)
  })
}
