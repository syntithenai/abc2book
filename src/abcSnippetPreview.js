/**
 * Clip ABC to a short staff preview: headers + first music line, at most maxBars bars.
 */
import { normalizeMelodyBarlines } from './melodyBarlineNormalize';

function isHeaderLine(line) {
  return /^[A-Za-z]:/.test(String(line || '').trim())
}

function isMusicLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed) return false
  if (isHeaderLine(trimmed)) return false
  if (trimmed.charAt(0) === '%') return false
  return true
}

/**
 * Count barlines in a music line, treating || :| |: as single boundaries where possible.
 */
export function countBarsInMusicLine(line) {
  const text = normalizeMelodyBarlines(String(line || ''))
  if (!text.trim()) return 0
  // Split on barline tokens; content segments between bars.
  const parts = text.split(/\|+/)
  const nonempty = parts.filter(function(part, index) {
    if (String(part || '').trim()) return true
    // Trailing empty after final | does not add a bar.
    return index < parts.length - 1 && index > 0
  })
  // "CDEF|GABc|cdef|" → parts ['CDEF','GABc','cdef',''] → 3 bars
  return Math.max(1, parts.filter(function(part, index) {
    return index < parts.length - 1 || String(part || '').trim()
  }).length - (String(parts[parts.length - 1] || '').trim() ? 0 : 1))
}

/**
 * Keep at most maxBars measures from a single music line.
 */
export function clipMusicLineToBars(line, maxBars) {
  const limit = maxBars > 0 ? maxBars : 8
  const text = normalizeMelodyBarlines(String(line || ''))
  if (!text.trim()) return ''

  let bars = 0
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text.charAt(i)
    if (ch === '|') {
      // Consume a whole barline token (| || |: :| etc. starting at |)
      let j = i
      while (j < text.length && (text.charAt(j) === '|' || text.charAt(j) === ':')) j += 1
      out += text.slice(i, j)
      bars += 1
      i = j
      if (bars >= limit) break
      continue
    }
    out += ch
    i += 1
  }
  return out.replace(/\s+$/, '')
}

/**
 * Build a renderable ABC snippet: preserve key headers, first music line clipped to maxBars.
 */
export function buildAbcSnippet(abc, options) {
  const opts = options || {}
  const maxBars = opts.maxBars > 0 ? opts.maxBars : 8
  const fallbackMeta = opts.metadata || {}
  const raw = String(abc || '').trim()
  if (!raw) return ''

  const lines = raw.split(/\r?\n/)
  const headers = []
  let firstMusic = ''
  let seenK = false

  lines.forEach(function(line) {
    const trimmed = String(line || '').trim()
    if (!trimmed) return
    if (isHeaderLine(trimmed)) {
      if (/^[XMLKQ]:/i.test(trimmed) || /^T:/i.test(trimmed)) {
        headers.push(trimmed)
      }
      if (/^K:/i.test(trimmed)) seenK = true
      return
    }
    if (!firstMusic && isMusicLine(trimmed)) {
      firstMusic = trimmed
    }
  })

  if (!firstMusic) {
    // Whole string may be a bare music line / preview.
    if (!isHeaderLine(raw) && raw.indexOf('\n') < 0) {
      firstMusic = raw
    } else {
      return ''
    }
  }

  const clipped = clipMusicLineToBars(firstMusic, maxBars)
  if (!clipped) return ''

  const hasX = headers.some(function(h) { return /^X:/i.test(h) })
  const hasM = headers.some(function(h) { return /^M:/i.test(h) })
  const hasL = headers.some(function(h) { return /^L:/i.test(h) })
  const hasK = headers.some(function(h) { return /^K:/i.test(h) }) || seenK

  const out = []
  if (!hasX) out.push('X:1')
  headers.forEach(function(h) {
    if (/^T:/i.test(h)) return // title clutters tiny previews
    out.push(h)
  })
  if (!hasM) out.push('M:' + (fallbackMeta.meter || '4/4'))
  if (!hasL) out.push('L:' + (fallbackMeta.noteLength || '1/8'))
  if (!hasK) out.push('K:' + (fallbackMeta.key || 'C'))
  out.push(clipped)
  return out.join('\n')
}

export function abcFromPickerItem(item, metadata) {
  if (!item) return ''
  if (typeof item.abc === 'string' && item.abc.trim()) {
    return buildAbcSnippet(item.abc, { metadata: metadata })
  }
  if (typeof item.preview === 'string' && item.preview.trim()) {
    // preview may be full abc or a music line
    return buildAbcSnippet(item.preview, { metadata: metadata })
  }
  return ''
}
