/**
 * High-resolution inline chord anchor extraction from COW / ChordPro rows.
 */
import { parseChordProInlineLyricLine, classifyLyricChordLines } from './chordSheetUtils'

function tokenizeCowChordLine(line) {
  const text = String(line || '')
  const tokens = []
  const re = /\S+/g
  let match
  while ((match = re.exec(text)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  return tokens
}

/**
 * Extract word-index anchors from a chords-over-words row pair.
 */
export function anchorsFromCowPair(chordLine, lyricLine) {
  const chordTokens = tokenizeCowChordLine(chordLine)
  const lyricText = String(lyricLine || '')
  const lyricWords = lyricText.trim().split(/\s+/).filter(Boolean)
  if (!chordTokens.length || !lyricWords.length) return []

  const lyricStarts = []
  let cursor = 0
  lyricWords.forEach(function(word) {
    const idx = lyricText.indexOf(word, cursor)
    lyricStarts.push(idx >= 0 ? idx : cursor)
    cursor = idx >= 0 ? idx + word.length : cursor + word.length
  })

  const anchors = []
  chordTokens.forEach(function(token, chordIndex) {
    const ratio = chordTokens.length <= 1 ? 0 : chordIndex / (chordTokens.length - 1)
    const wordIndex = Math.min(lyricWords.length - 1, Math.round(ratio * (lyricWords.length - 1)))
    anchors.push({
      chord: token.text,
      chordOffset: token.start,
      wordIndex: wordIndex,
      word: lyricWords[wordIndex] || '',
      lyricOffset: lyricStarts[wordIndex] || 0,
      confidence: 0.9,
    })
  })
  return anchors
}

/**
 * Extract anchors from ChordPro inline lyric line.
 */
export function anchorsFromChordProLine(line) {
  const parsed = parseChordProInlineLyricLine(line)
  const raw = String(line || '')
  const anchors = []
  let searchFrom = 0
  ;(Array.isArray(parsed) ? parsed : []).forEach(function(token) {
    const chord = String(token.chord || '').trim()
    const text = String(token.text || '')
    if (!chord) {
      searchFrom += text.length
      return
    }
    const lyricOffset = searchFrom
    const wordMatch = text.trim().match(/\S+/)
    const word = wordMatch ? wordMatch[0] : ''
    const wordIndex = anchors.length
    anchors.push({
      chord: chord,
      chordOffset: lyricOffset,
      wordIndex: wordIndex,
      word: word,
      lyricOffset: lyricOffset + (wordMatch ? text.indexOf(wordMatch[0]) : 0),
      confidence: 0.95,
    })
    searchFrom = lyricOffset + text.length
  })
  if (!anchors.length && raw.indexOf('[') >= 0) {
    const re = /\[([^\]]+)\]/g
    let match
    while ((match = re.exec(raw)) !== null) {
      const chord = String(match[1] || '').trim()
      if (!chord) continue
      anchors.push({
        chord: chord,
        chordOffset: match.index,
        wordIndex: anchors.length,
        word: '',
        lyricOffset: match.index,
        confidence: 0.85,
      })
    }
  }
  return anchors
}

/**
 * Walk classified lines and build inline timing anchors.
 */
export function extractInlineChordAnchors(lines) {
  const classified = classifyLyricChordLines(lines || [])
  const blocks = []
  let pendingChordLines = []
  let pendingLyricItems = []

  function flushBlock() {
    if (!pendingLyricItems.length) {
      pendingChordLines = []
      return
    }
    const linePairs = pendingLyricItems.map(function(lyricItem, index) {
      const chordLine = pendingChordLines[index] || pendingChordLines[0] || ''
      let anchors = []
      if (String(chordLine).trim() && lyricItem.text.indexOf('[') >= 0) {
        anchors = anchorsFromChordProLine(lyricItem.text)
      } else if (String(chordLine).trim()) {
        anchors = anchorsFromCowPair(chordLine, lyricItem.text)
      }
      return {
        lyricLine: lyricItem.text,
        chordLine: chordLine,
        anchors: anchors,
      }
    })
    blocks.push({ linePairs: linePairs })
    pendingChordLines = []
    pendingLyricItems = []
  }

  classified.forEach(function(item) {
    if (item.type === 'blank') {
      flushBlock()
      return
    }
    if (item.type === 'header') {
      flushBlock()
      blocks.push({ header: item.text, linePairs: [] })
      return
    }
    if (item.type === 'chord') {
      pendingChordLines.push(item.text)
      return
    }
    pendingLyricItems.push({ text: item.text })
  })
  flushBlock()
  return blocks
}

/**
 * Map word-index anchors to beat times when timed lyrics are available.
 */
export function mapAnchorsToBeatTimes(anchors, timedLyrics) {
  const lines = Array.isArray(timedLyrics) ? timedLyrics : []
  const singable = lines.filter(function(line) {
    return line && String(line.text || '').trim() && !line.stanzaBreak
  })
  return (Array.isArray(anchors) ? anchors : []).map(function(anchor) {
    const wordIndex = anchor.wordIndex
    const timed = wordIndex >= 0 && wordIndex < singable.length ? singable[wordIndex] : null
    return Object.assign({}, anchor, {
      startTime: timed && timed.start != null ? timed.start : null,
      endTime: timed && timed.end != null ? timed.end : null,
    })
  })
}
