/**
 * ABC text transforms for Import Book review (rewrite notation, not sidecars).
 */
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
