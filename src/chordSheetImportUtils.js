import {
  classifyLyricChordLines,
  charOffsetToWordIndex,
  wrapChordGridBars,
  lineHasChordProInlineChords,
} from './chordSheetUtils'
import { normalizeLyricStructure } from './lyricStructureUtils'
import { anchorsFromCowPair, anchorsFromChordProLine } from './inlineChordTimingUtils'

function mapLyricTokens(lyricTokens) {
  return (Array.isArray(lyricTokens) ? lyricTokens : []).map(function(token) {
    return { text: token.text, start: token.start, end: token.end }
  })
}

function anchorsFromChordOffsets(pendingChordLines, lyricItem) {
  const lyricTokens = Array.isArray(lyricItem.tokens) ? lyricItem.tokens : []
  const anchors = []
  pendingChordLines.forEach(function(chordLine) {
    (Array.isArray(chordLine.tokens) ? chordLine.tokens : []).forEach(function(token) {
      const wordIndex = charOffsetToWordIndex(lyricItem.text, token.start)
      anchors.push({
        chord: token.text,
        chordOffset: token.start,
        wordIndex: wordIndex,
        word: lyricTokens[wordIndex] ? lyricTokens[wordIndex].text : '',
        lyricOffset: lyricTokens[wordIndex] ? lyricTokens[wordIndex].start : 0,
      })
    })
  })
  return anchors.sort(function(a, b) { return a.chordOffset - b.chordOffset })
}

function flattenChordTokens(pendingChordLines) {
  const tokens = []
  pendingChordLines.forEach(function(chordLine) {
    (Array.isArray(chordLine.tokens) ? chordLine.tokens : []).forEach(function(token) {
      tokens.push(token)
    })
  })
  return tokens
}

function wordIndexForSlicePosition(sliceIndex, sliceLength, wordCount) {
  if (wordCount <= 0) return -1
  if (sliceLength <= 1) return 0
  return Math.min(wordCount - 1, Math.round(sliceIndex * (wordCount - 1) / (sliceLength - 1)))
}

/**
 * Distribute pending chord tokens across consecutive lyric lines that share one
 * harmonic span (no new chord/header/blank between them).
 */
function distributeAnchorsAcrossLyrics(pendingChordLines, lyricItems) {
  const chordLineTexts = pendingChordLines.map(function(chordLine) { return chordLine.text })
  if (lyricItems.length <= 1) {
    const lyricItem = lyricItems[0]
    return [{
      lyricLine: lyricItem.text,
      lyricTokens: mapLyricTokens(lyricItem.tokens),
      chordLines: chordLineTexts,
      anchors: anchorsFromChordOffsets(pendingChordLines, lyricItem),
    }]
  }

  const allTokens = flattenChordTokens(pendingChordLines)
  const n = lyricItems.length
  return lyricItems.map(function(lyricItem, lineIndex) {
    const start = Math.floor(lineIndex * allTokens.length / n)
    const end = Math.floor((lineIndex + 1) * allTokens.length / n)
    const slice = allTokens.slice(start, end)
    const lyricTokens = Array.isArray(lyricItem.tokens) ? lyricItem.tokens : []
    const wordCount = lyricTokens.length
    const anchors = slice.map(function(token, sliceIndex) {
      const wordIndex = wordIndexForSlicePosition(sliceIndex, slice.length, wordCount)
      return {
        chord: token.text,
        chordOffset: token.start,
        wordIndex: wordIndex,
        word: wordIndex >= 0 && lyricTokens[wordIndex] ? lyricTokens[wordIndex].text : '',
        lyricOffset: wordIndex >= 0 && lyricTokens[wordIndex] ? lyricTokens[wordIndex].start : 0,
      }
    })
    return {
      lyricLine: lyricItem.text,
      lyricTokens: mapLyricTokens(lyricTokens),
      chordLines: lineIndex === 0 ? chordLineTexts : [],
      anchors: anchors,
    }
  })
}

function collectLyricRun(classified, startIndex) {
  const run = []
  for (let i = startIndex; i < classified.length; i += 1) {
    const item = classified[i]
    if (item.type === 'lyric') {
      run.push(item)
      continue
    }
    break
  }
  return run
}

export function buildChordSheetAlignmentFromLines(sheetLines) {
  const classified = classifyLyricChordLines(sheetLines)
  const structureBlocks = normalizeLyricStructure(
    classified
      .filter(function(item) { return item.type === 'header' || item.type === 'lyric' || item.type === 'blank' })
      .map(function(item) { return item.type === 'blank' ? '' : item.text })
  )
  const structureByHeader = {}
  structureBlocks.forEach(function(block) {
    if (block.header) structureByHeader[block.header] = block.type
  })

  const blocks = []
  let current = null
  let pendingChordLines = []
  let skipUntil = -1

  function createBlock(header) {
    return {
      header: header || '',
      type: header && structureByHeader[header] ? structureByHeader[header] : null,
      lines: [],
      linePairs: [],
    }
  }

  /**
   * Instrumental / trailing chord rows (Intro, Outro, turnaround after a chorus)
   * have no lyric line. Keep them as chord-only pairs so they are not dropped
   * when a blank line or section boundary arrives.
   */
  function emitPendingChordOnly() {
    if (!current || pendingChordLines.length === 0) return
    pendingChordLines.forEach(function(chordLine) {
      current.linePairs.push({
        lyricLine: '',
        lyricTokens: [],
        chordLines: [chordLine.text],
        anchors: [],
      })
    })
    pendingChordLines = []
  }

  function flushBlock() {
    emitPendingChordOnly()
    if (current && (current.header || current.lines.length > 0 || current.linePairs.length > 0)) {
      if (current.header && !current.type) {
        const structured = normalizeLyricStructure([current.header].concat(current.lines))
        current.type = structured[0] ? structured[0].type : null
      }
      blocks.push(current)
    }
    current = null
    pendingChordLines = []
  }

  for (let index = 0; index < classified.length; index += 1) {
    if (index <= skipUntil) continue
    const item = classified[index]

    if (item.type === 'blank') {
      // Keep section-header blocks open across blank lines (UG-style spacing).
      // Without a header, blank lines still separate positional chord blocks.
      if (pendingChordLines.length > 0) {
        if (!current) current = createBlock('')
        emitPendingChordOnly()
      }
      if (current && !current.header) flushBlock()
      continue
    }
    if (item.type === 'header') {
      flushBlock()
      current = createBlock(item.text)
      continue
    }
    if (item.type === 'chord') {
      // A new chord row after lyrics (no blank) ends the previous lyric span;
      // keep pending chords that have not been paired yet.
      pendingChordLines.push(item)
      if (!current) current = createBlock('')
      continue
    }
    if (item.type === 'lyric') {
      if (!current) current = createBlock('')

      if (pendingChordLines.length > 0) {
        const lyricRun = collectLyricRun(classified, index)
        let pairs
        if (pendingChordLines.length === lyricRun.length) {
          pairs = lyricRun.map(function(lyricItem, lineIndex) {
            const chordLine = pendingChordLines[lineIndex]
            return {
              lyricLine: lyricItem.text,
              lyricTokens: mapLyricTokens(lyricItem.tokens),
              chordLines: [chordLine.text],
              anchors: anchorsFromCowPair(chordLine.text, lyricItem.text),
            }
          })
        } else {
          pairs = distributeAnchorsAcrossLyrics(pendingChordLines, lyricRun)
        }
        pairs.forEach(function(pair) {
          current.lines.push(pair.lyricLine)
          current.linePairs.push(pair)
        })
        pendingChordLines = []
        skipUntil = index + lyricRun.length - 1
      } else {
        // ChordPro inline `[C]words` — extract anchors into chordLines so paste
        // / From Lyrics can build one chart bar per lyric line.
        const chordProAnchors = lineHasChordProInlineChords(item.text)
          ? anchorsFromChordProLine(item.text)
          : []
        const chordLine = chordProAnchors.length
          ? chordProAnchors.map(function(anchor) { return anchor.chord; }).join(' ')
          : ''
        current.lines.push(item.text)
        current.linePairs.push({
          lyricLine: item.text,
          lyricTokens: mapLyricTokens(item.tokens),
          chordLines: chordLine ? [chordLine] : [],
          anchors: chordProAnchors,
        })
      }
    }
  }

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
  return wrapChordGridBars(result.join('\n'), 8)
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
