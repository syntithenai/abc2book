import { classifyLyricChordLines } from './chordSheetUtils'

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
