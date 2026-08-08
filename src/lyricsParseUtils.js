import {
  isTabStaffLine,
  isUsenetOrTabMetaLine,
  isNoLyricsPlaceholderLine,
  isUsableLyricContent,
} from './lyricsQualityUtils'

const NOISE_LINE_RE = /^(?:\d+\s+contributors?|contributors?|translations?|embed|share|writer(?:\(s\))?:.*|thanks to .*|submit corrections?|correct these lyrics|you might also like|advertisement|recommended|if\s*\(\s*\/android|document\.write|navigator\.useragent)$/i

const TRANSLATION_LANGUAGE_RE = /^(?:türkçe|español|português|deutsch|polski|українська|srpski|italiano|česky|français|nederlands|русский|日本語|中文|한국어|العربية|english|translation[s]?)$/i

export function cleanLyricsLine(line) {
  const cleaned = String(line || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ')
  return cleaned
}

export function isNoiseLine(line) {
  if (!line) return true
  if (isNoLyricsPlaceholderLine(line)) return true
  if (NOISE_LINE_RE.test(line)) return true
  if (TRANSLATION_LANGUAGE_RE.test(line)) return true
  if (line.length > 180 && line.indexOf(' ') === -1) return true
  const lower = line.toLowerCase()
  if (lower.indexOf('document.write') !== -1 || lower.indexOf('navigator.useragent') !== -1) {
    return true
  }
  return false
}

function linesToStanzas(lines) {
  const stanzas = []
  let current = []
  lines.forEach(function(line) {
    if (!line) {
      if (current.length) {
        stanzas.push(current)
        current = []
      }
      return
    }
    current.push(line)
  })
  if (current.length) stanzas.push(current)
  return stanzas
}

export function finalizeLyricsLines(rawLines) {
  const lines = []
  ;(rawLines || []).forEach(function(rawLine) {
    const line = cleanLyricsLine(rawLine)
    if (!line) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('')
      return
    }
    if (isNoiseLine(line)) return
    if (isTabStaffLine(line) || isUsenetOrTabMetaLine(line)) return
    lines.push(line)
  })

  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop()
  }

  // Reject guitar TAB / Usenet dumps that lyrics APIs sometimes return for instrumentals.
  if (!isUsableLyricContent(rawLines).ok || !isUsableLyricContent(lines).ok) {
    return [[], [], '']
  }

  const stanzas = linesToStanzas(lines)
  if (!stanzas.length) return [[], [], '']

  const flatLines = []
  stanzas.forEach(function(stanza, index) {
    if (index > 0) flatLines.push('')
    flatLines.push.apply(flatLines, stanza)
  })

  return [stanzas, flatLines, flatLines.join('\n')]
}

export function parsePlainLyricsText(text) {
  const rawLines = String(text || '').replace(/\r/g, '').split('\n')
  return finalizeLyricsLines(rawLines)
}

export function lyricsPreview(lines, maxLines) {
  const meaningful = (lines || []).filter(function(line) { return String(line || '').trim() })
  return meaningful.slice(0, maxLines || 3).join('\n')
}
