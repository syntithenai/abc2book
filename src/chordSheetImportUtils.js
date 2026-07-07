import { classifyLyricChordLines, charOffsetToWordIndex } from './chordSheetUtils'

export function buildChordSheetAlignmentFromLines(sheetLines) {
  const classified = classifyLyricChordLines(sheetLines)
  const blocks = []
  let current = null
  let pendingChordLines = []

  function createBlock(header) {
    return {
      header: header || '',
      lines: [],
      linePairs: [],
    }
  }

  function flushBlock() {
    if (current && (current.header || current.lines.length > 0)) {
      blocks.push(current)
    }
    current = null
    pendingChordLines = []
  }

  classified.forEach(function(item) {
    if (item.type === 'blank') {
      flushBlock()
      return
    }
    if (item.type === 'header') {
      if (current && (current.header || current.lines.length > 0)) flushBlock()
      if (!current) current = createBlock(item.text)
      else current.header = item.text
      return
    }
    if (item.type === 'chord') {
      pendingChordLines.push(item)
      if (!current) current = createBlock('')
      return
    }
    if (item.type === 'lyric') {
      if (!current) current = createBlock('')
      const lyricTokens = Array.isArray(item.tokens) ? item.tokens : []
      const anchors = []
      pendingChordLines.forEach(function(chordLine) {
        (Array.isArray(chordLine.tokens) ? chordLine.tokens : []).forEach(function(token) {
          const wordIndex = charOffsetToWordIndex(item.text, token.start)
          anchors.push({
            chord: token.text,
            chordOffset: token.start,
            wordIndex: wordIndex,
            word: lyricTokens[wordIndex] ? lyricTokens[wordIndex].text : '',
            lyricOffset: lyricTokens[wordIndex] ? lyricTokens[wordIndex].start : 0,
          })
        })
      })
      current.lines.push(item.text)
      current.linePairs.push({
        lyricLine: item.text,
        lyricTokens: lyricTokens.map(function(token) {
          return { text: token.text, start: token.start, end: token.end }
        }),
        chordLines: pendingChordLines.map(function(chordLine) { return chordLine.text }),
        anchors: anchors.sort(function(a, b) { return a.chordOffset - b.chordOffset }),
      })
      pendingChordLines = []
    }
  })

  flushBlock()
  return blocks
}

export function sheetLinesToWizardChords(sheetLines) {
  const classified = classifyLyricChordLines(sheetLines)
  const result = []
  let pendingBreak = false

  classified.forEach(function(item) {
    if (item.type === 'header' || item.type === 'blank') {
      pendingBreak = result.length > 0 && result[result.length - 1] !== ''
      return
    }

    if (item.type !== 'chord') {
      return
    }

    if (pendingBreak && result.length > 0 && result[result.length - 1] !== '') {
      result.push('')
    }
    pendingBreak = false

    let text = String(item.text || '').trim()
    if (!text) return
    if (!text.endsWith('|')) text += '|'
    result.push(text)
  })

  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop()
  }
  return result.join('\n')
}

export function sheetLinesToLyricLines(sheetLines) {
  const classified = classifyLyricChordLines(sheetLines)
  const result = []

  classified.forEach(function(item) {
    if (item.type === 'blank') {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      return
    }
    if (item.type === 'header' || item.type === 'lyric') {
      result.push(String(item.text || '').trim())
    }
  })

  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop()
  }
  return result
}
