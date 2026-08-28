/**
 * ABC pitch-contour / incipit helpers for melody matching.
 * Port of local-resolver/abc_contour.py — keep algorithms in sync.
 */

export const MIN_CONTOUR_SCORE = 62
export const DEFAULT_QUERY_MAX_NOTES = 48

const NOTE_BASE = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

const HEADER_LINE_RE = /^[A-Za-z]:/
const NOTE_RE = /(?:\^|=|_)?[A-Ga-g][',]*/g
const SKIP_RE = /(?:"[^"]*")|(?:![^!]*!)|(?:\{[^}]*\})|(?:\[[^\]]*\])|(?:%[^\n]*)/g

function stripAbcHeaders(abcText) {
  const lines = String(abcText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let bodyStart = 0
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].toUpperCase().startsWith('K:')) {
      bodyStart = idx + 1
      break
    }
  }
  const bodyLines = []
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]
    if (HEADER_LINE_RE.test(line) && !line.toUpperCase().startsWith('W:')) {
      if (line.toUpperCase().startsWith('K:')) continue
      continue
    }
    bodyLines.push(line)
  }
  return bodyLines.join('\n')
}

function midiFromToken(token) {
  if (!token) return null
  let accidental = 0
  let i = 0
  if (token[0] === '^' || token[0] === '=' || token[0] === '_') {
    accidental = token[0] === '^' ? 1 : (token[0] === '_' ? -1 : 0)
    i = 1
  }
  if (i >= token.length) return null
  const letter = token[i]
  i += 1
  const base = NOTE_BASE[letter.toUpperCase()]
  if (base === undefined) return null
  let octave = letter === letter.toUpperCase() ? 5 : 6
  while (i < token.length) {
    if (token[i] === "'") octave += 1
    else if (token[i] === ',') octave -= 1
    else break
    i += 1
  }
  return (octave * 12) + base + accidental
}

export function extractPitchMidiSequence(abcText, maxNotes) {
  const limit = maxNotes > 0 ? maxNotes : 64
  let body = stripAbcHeaders(abcText)
  body = body.replace(SKIP_RE, ' ')
  body = body.replace(/[|/\\]/g, ' ')
  const pitches = []
  NOTE_RE.lastIndex = 0
  let match
  while ((match = NOTE_RE.exec(body)) !== null) {
    const midi = midiFromToken(match[0])
    if (midi == null) continue
    pitches.push(midi)
    if (pitches.length >= limit) break
  }
  return pitches
}

export function pitchesToIntervalString(pitches, maxIntervals) {
  const limit = maxIntervals > 0 ? maxIntervals : 48
  if (!pitches || pitches.length < 2) return ''
  const chars = []
  for (let i = 0; i < pitches.length - 1; i++) {
    const delta = Math.max(-9, Math.min(9, pitches[i + 1] - pitches[i]))
    chars.push(String.fromCharCode('a'.charCodeAt(0) + delta + 9))
    if (chars.length >= limit) break
  }
  return chars.join('')
}

export function pitchesToParsonsCode(pitches, maxSteps) {
  const limit = maxSteps > 0 ? maxSteps : 48
  if (!pitches || !pitches.length) return ''
  const out = ['*']
  for (let i = 0; i < pitches.length - 1; i++) {
    const prev = pitches[i]
    const cur = pitches[i + 1]
    if (cur > prev) out.push('U')
    else if (cur < prev) out.push('D')
    else out.push('R')
    if (out.length > limit) break
  }
  return out.join('')
}

export function abcToContour(abcText, maxNotes) {
  const pitches = extractPitchMidiSequence(abcText, maxNotes > 0 ? maxNotes : 64)
  return {
    pitches: pitches,
    intervals: pitchesToIntervalString(pitches),
    parsons: pitchesToParsonsCode(pitches),
  }
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  let left = a
  let right = b
  if (left.length < right.length) {
    const tmp = left
    left = right
    right = tmp
  }
  let prev = []
  for (let j = 0; j <= right.length; j++) prev.push(j)
  for (let i = 1; i <= left.length; i++) {
    const cur = [i]
    const ca = left.charAt(i - 1)
    for (let j = 1; j <= right.length; j++) {
      const cb = right.charAt(j - 1)
      const ins = cur[j - 1] + 1
      const del = prev[j] + 1
      const sub = prev[j - 1] + (ca === cb ? 0 : 1)
      cur.push(Math.min(ins, del, sub))
    }
    prev = cur
  }
  return prev[right.length]
}

function contourParts(value) {
  if (typeof value === 'string') {
    return { intervals: value, parsons: '' }
  }
  const obj = value || {}
  return {
    intervals: String(obj.intervals || ''),
    parsons: String(obj.parsons || ''),
  }
}

export function contourSimilarity(query, candidate) {
  const q = contourParts(query)
  const c = contourParts(candidate)
  const qInt = q.intervals
  const qPar = q.parsons
  const cInt = c.intervals
  const cPar = c.parsons

  if (qInt && cInt) {
    const window = Math.min(24, qInt.length, cInt.length)
    if (window < 4) return 0
    const qa = qInt.slice(0, window)
    let best = 0
    const maxOffset = Math.min(6, Math.max(1, cInt.length - window + 1))
    for (let offset = 0; offset < maxOffset; offset++) {
      const ca = cInt.slice(offset, offset + window)
      const dist = levenshtein(qa, ca)
      const score = 100 * (1 - (dist / Math.max(qa.length, 1)))
      if (score > best) best = score
    }
    return best
  }

  if (qPar && cPar) {
    const window = Math.min(24, qPar.length, cPar.length)
    if (window < 5) return 0
    const qa = qPar.slice(0, window)
    const ca = cPar.slice(0, window)
    const dist = levenshtein(qa, ca)
    return 100 * (1 - (dist / Math.max(qa.length, 1)))
  }

  return 0
}

export function hasUsableContour(abcText, maxNotes) {
  const contour = abcToContour(abcText, maxNotes > 0 ? maxNotes : DEFAULT_QUERY_MAX_NOTES)
  const intervals = contour.intervals || ''
  const parsons = contour.parsons || ''
  return intervals.length >= 4 || parsons.length >= 5
}
