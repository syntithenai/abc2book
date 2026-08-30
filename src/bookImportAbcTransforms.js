import abcjs from 'abcjs'

/**
 * Chromatic transpose of the ABC string via abcjs.strTranspose.
 * @returns {string|null}
 */
export function transposeAbcText(abc, semitones) {
  const amount = Number(semitones) || 0
  const text = String(abc || '')
  if (!text.trim() || !amount) return null
  if (typeof abcjs.strTranspose !== 'function') return null
  try {
    const visualObj = abcjs.renderAbc('*', text)
    const next = abcjs.strTranspose(text, visualObj, amount)
    return next && String(next).trim() ? String(next) : null
  } catch (e) {
    return null
  }
}

/**
 * Halve/double written note lengths by rewriting note durations (not L: alone).
 * Uses abcTools.multiplyAbcTiming on each voice body when available.
 * @returns {string|null}
 */
export function scaleAbcNoteLengths(abc, factor, abcTools) {
  const text = String(abc || '')
  const mult = Number(factor)
  if (!text.trim() || (mult !== 0.5 && mult !== 2)) return null
  if (!abcTools || typeof abcTools.multiplyAbcTiming !== 'function') return null
  if (typeof abcTools.abc2json !== 'function' || typeof abcTools.json2abc !== 'function') {
    try {
      return abcTools.multiplyAbcTiming(mult, text) || null
    } catch (e) {
      return null
    }
  }
  try {
    const parsed = abcTools.abc2json(text)
    if (!parsed || !parsed.voices) return null
    const voices = Object.assign({}, parsed.voices)
    let changed = false
    Object.keys(voices).forEach(function(vk) {
      const voice = voices[vk]
      if (!voice) return
      const notes = Array.isArray(voice.notes)
        ? voice.notes.slice()
        : (voice.notes ? [String(voice.notes)] : [''])
      const body = notes.join('\n')
      if (!String(body || '').trim()) return
      const wrapped = 'X:1\nM:' + (parsed.meter || '4/4')
        + '\nL:' + (parsed.noteLength || '1/8')
        + '\nK:' + (parsed.key || 'C') + '\n' + body
      const scaled = abcTools.multiplyAbcTiming(mult, wrapped)
      if (!scaled) return
      // multiplyAbcTiming returns measure bodies without headers
      const nextNotes = String(scaled).split('\n')
      voices[vk] = Object.assign({}, voice, { notes: nextNotes.length ? nextNotes : [''] })
      changed = true
    })
    if (!changed) return null
    return abcTools.json2abc(Object.assign({}, parsed, { voices: voices }))
  } catch (e) {
    return null
  }
}

/**
 * Rewrite or insert the M: header in ABC text.
 * @returns {string}
 */
export function setAbcMeter(abc, meter) {
  const text = String(abc || '')
  const nextMeter = String(meter || '').trim()
  if (!nextMeter) return text
  const lines = text.split('\n')
  let found = false
  const out = lines.map(function(line) {
    if (/^M:/i.test(line.trim())) {
      found = true
      return 'M:' + nextMeter
    }
    return line
  })
  if (!found) {
    let insertAt = 0
    for (let i = 0; i < out.length; i += 1) {
      const t = out[i].trim()
      if (/^[XTL]:/i.test(t)) insertAt = i + 1
      else if (/^[A-Za-z%]:/.test(t) || t.startsWith('%')) insertAt = i + 1
      else break
    }
    out.splice(insertAt, 0, 'M:' + nextMeter)
  }
  return out.join('\n')
}

export function readAbcMeter(abc) {
  const m = String(abc || '').match(/^M:\s*(.+)$/m)
  return m ? String(m[1]).trim() : ''
}

/**
 * MuseScore score-level default when no real composer was entered.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isGenericComposer(value) {
  const s = String(value || '').trim().replace(/\s+/g, ' ')
  if (!s) return true
  return /^composer\s*\/\s*arranger$/i.test(s)
}

/**
 * Drop C: lines that are MuseScore "Composer / arranger" placeholders.
 * @param {string} abc
 * @returns {string}
 */
export function stripGenericComposerFromAbc(abc) {
  const text = String(abc || '')
  if (!text) return text
  const lines = text.split('\n')
  const out = lines.filter(function(line) {
    const m = /^C:\s*(.*)$/i.exec(line)
    if (!m) return true
    return !isGenericComposer(m[1])
  })
  return out.join('\n')
}

/**
 * Ensure ABC has `% abcbook-repeats N` (playback loop count).
 * Leaves an existing repeats comment unchanged; defaults to 3 when missing.
 * @param {string} abc
 * @param {number|string} [repeats=3]
 * @returns {string}
 */
export function ensureAbcbookRepeats(abc, repeats) {
  let text = String(abc || '')
  if (/%\s*abcbook-repeats\s+\S+/i.test(text)) return text
  const n = parseInt(repeats, 10)
  const value = Number.isFinite(n) && n > 0 ? String(n) : '3'
  const line = '% abcbook-repeats ' + value
  if (/^K:/m.test(text)) {
    return text.replace(/^(K:.*)$/m, line + '\n$1')
  }
  if (text.trim()) return text.replace(/\s*$/, '') + '\n' + line + '\n'
  return line + '\n'
}

function isAbcHeaderOrDirectiveLine(line) {
  const t = String(line || '').trim()
  if (!t) return true
  if (t.charAt(0) === '%') return true
  if (/^[A-Za-z]:/.test(t)) return true
  if (/^\[V:/.test(t)) return true
  return false
}

/**
 * Re-pack music body measures to N bars per line (melody MIDI/OMR tidy).
 * Preserves headers / V: / [V:] lines; only rewrites note lines.
 * @param {string} abc
 * @param {number} [barsPerLine=8]
 * @returns {string}
 */
export function rewrapAbcBarsPerLine(abc, barsPerLine) {
  const text = String(abc || '')
  if (!text.trim()) return text
  const perLine = Math.max(1, parseInt(barsPerLine, 10) || 8)
  let measures = null
  try {
    if (typeof abcjs.extractMeasures !== 'function') return text
    const extracted = abcjs.extractMeasures(text)
    if (extracted && extracted[0] && Array.isArray(extracted[0].measures)) {
      measures = extracted[0].measures
    }
  } catch (e) {
    return text
  }
  if (!measures || !measures.length) return text

  const packed = []
  for (let i = 0; i < measures.length; i += perLine) {
    const chunk = measures.slice(i, i + perLine).map(function(m) {
      return String((m && m.abc) || '').trim()
    }).filter(Boolean)
    if (!chunk.length) continue
    let line = chunk.join(' ')
    if (!/\|\s*$/.test(line)) line += ' |'
    packed.push(line)
  }
  if (!packed.length) return text

  const lines = text.split('\n')
  let firstMusic = -1
  let lastMusic = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (!isAbcHeaderOrDirectiveLine(lines[i])) {
      if (firstMusic < 0) firstMusic = i
      lastMusic = i
    }
  }
  if (firstMusic < 0) {
    return text.replace(/\s*$/, '') + '\n' + packed.join('\n') + '\n'
  }
  const header = lines.slice(0, firstMusic)
  const trailer = lines.slice(lastMusic + 1)
  return header.concat(packed, trailer).join('\n').replace(/\s+$/, '') + '\n'
}
