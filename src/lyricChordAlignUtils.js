/**
 * Letter-level ChordPro align model: drag chords onto any character in a lyric
 * line, persist as inline ChordPro (`Ama[G]zing`).
 */
import {
  classifyLyricChordLines,
  isSectionHeader,
  lineHasChordProInlineChords,
  parseChordProInlineLyricLine,
} from './chordSheetUtils'

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

function cloneAnchors(anchors) {
  return (Array.isArray(anchors) ? anchors : []).map(function(anchor) {
    return {
      chord: String(anchor && anchor.chord || '').trim(),
      offset: Number(anchor && anchor.offset) || 0,
    }
  }).filter(function(anchor) { return !!anchor.chord })
}

/**
 * Snap an offset onto a letter (non-whitespace). Prefers forward, then backward.
 */
export function snapOffsetToLetter(text, offset) {
  const raw = String(text == null ? '' : text)
  if (!raw.length) return 0
  let o = Math.max(0, Math.min(raw.length - 1, Number(offset) || 0))
  if (!/\s/.test(raw.charAt(o))) return o
  for (let i = o + 1; i < raw.length; i += 1) {
    if (!/\s/.test(raw.charAt(i))) return i
  }
  for (let i = o - 1; i >= 0; i -= 1) {
    if (!/\s/.test(raw.charAt(i))) return i
  }
  return o
}

/**
 * Parse ChordPro inline line → plain text + chord anchors at character offsets.
 * Mid-word example: `[G]Ama[C]zing` → text `Amazing`, anchors at 0 and 3.
 *
 * @returns {{ text: string, anchors: Array<{ chord: string, offset: number }> }}
 */
export function parseChordProLineToAnchors(line) {
  const raw = String(line == null ? '' : line)
  if (!raw.trim() || isSectionHeader(raw.trim())) {
    return { text: '', anchors: [] }
  }

  const tokens = parseChordProInlineLyricLine(raw)
  let text = ''
  const anchors = []
  let pendingChords = []

  tokens.forEach(function(token) {
    const chord = String(token.chord || '').trim()
    const fragment = String(token.text != null ? token.text : '')
    if (chord) pendingChords.push(chord)

    if (!fragment) return

    // Preserve interior spacing from ChordPro fragments; only skip pure empty.
    if (pendingChords.length) {
      const offset = text.length
      // If fragment starts with spaces, place chord on first letter after spaces.
      let placeAt = offset
      const leadingSpace = fragment.match(/^\s+/)
      if (leadingSpace) {
        const afterSpaces = offset + leadingSpace[0].length
        placeAt = afterSpaces < offset + fragment.length ? afterSpaces : offset
      }
      placeAt = snapOffsetToLetter(text + fragment, placeAt)
      pendingChords.forEach(function(c) {
        anchors.push({ chord: c, offset: placeAt })
      })
      pendingChords = []
    }
    text += fragment
  })

  if (pendingChords.length) {
    const placeAt = text.length > 0 ? snapOffsetToLetter(text, text.length - 1) : 0
    pendingChords.forEach(function(c) {
      anchors.push({ chord: c, offset: placeAt })
    })
  }

  return { text: text, anchors: anchors }
}

/**
 * Place COW chord tokens onto lyric letters by column offset.
 */
export function anchorsFromCowPair(chordLine, lyricLine) {
  const lyricText = String(lyricLine == null ? '' : lyricLine)
  const anchors = []
  tokenizeCowChordLine(chordLine).forEach(function(token) {
    const offset = snapOffsetToLetter(lyricText, token.start)
    anchors.push({ chord: token.text, offset: offset })
  })
  return { text: lyricText, anchors: anchors }
}

/**
 * Serialize plain text + anchors to ChordPro inline (supports mid-word chords).
 */
export function serializeAnchorsToChordProLine(text, anchors) {
  const raw = String(text == null ? '' : text)
  const list = cloneAnchors(anchors)
  const byOffset = Object.create(null)
  list.forEach(function(anchor) {
    let offset = Number(anchor.offset) || 0
    if (offset < 0) offset = 0
    if (offset > raw.length) offset = raw.length
    if (raw.length && offset < raw.length && /\s/.test(raw.charAt(offset))) {
      offset = snapOffsetToLetter(raw, offset)
    }
    if (!byOffset[offset]) byOffset[offset] = []
    byOffset[offset].push(anchor.chord)
  })

  let out = ''
  for (let i = 0; i <= raw.length; i += 1) {
    const at = byOffset[i]
    if (at) {
      at.forEach(function(chord) {
        out += '[' + chord + ']'
      })
    }
    if (i < raw.length) out += raw.charAt(i)
  }
  return out
}

/**
 * Move one anchor to a new character offset. If another anchor already sits on
 * that offset, swap offsets.
 */
export function moveChordAnchor(anchors, fromIndex, toOffset, text) {
  const next = cloneAnchors(anchors)
  const from = Number(fromIndex)
  if (!Number.isFinite(from) || from < 0 || from >= next.length) return next
  const target = snapOffsetToLetter(String(text == null ? '' : text), toOffset)
  const moving = next[from]
  if (moving.offset === target) return next

  const occupant = next.findIndex(function(anchor, index) {
    return index !== from && anchor.offset === target
  })
  if (occupant >= 0) {
    next[occupant] = Object.assign({}, next[occupant], { offset: moving.offset })
  }
  next[from] = Object.assign({}, moving, { offset: target })
  return next
}

/**
 * Build Align rows from lyric text (ChordPro and/or COW).
 * Lyric rows: `{ type:'lyric', text, anchors }`.
 */
export function lyricLinesToAlignRows(lines) {
  const classified = classifyLyricChordLines(lines)
  const rows = []
  let i = 0

  while (i < classified.length) {
    const item = classified[i]
    if (item.type === 'blank') {
      rows.push({ type: 'blank' })
      i += 1
      continue
    }
    if (item.type === 'header') {
      rows.push({ type: 'header', text: item.text })
      i += 1
      continue
    }
    if (item.type === 'chord') {
      let j = i + 1
      while (j < classified.length && classified[j].type === 'blank') j += 1
      if (j < classified.length && classified[j].type === 'lyric') {
        const parsed = anchorsFromCowPair(item.text, classified[j].text)
        rows.push({ type: 'lyric', text: parsed.text, anchors: parsed.anchors })
        i = j + 1
        continue
      }
      i += 1
      continue
    }
    if (item.type === 'lyric') {
      if (lineHasChordProInlineChords(item.text)) {
        const parsed = parseChordProLineToAnchors(item.text)
        rows.push({ type: 'lyric', text: parsed.text, anchors: parsed.anchors })
      } else {
        rows.push({
          type: 'lyric',
          text: String(item.text || ''),
          anchors: [],
        })
      }
      i += 1
      continue
    }
    i += 1
  }

  return rows
}

export function alignRowsToChordProLines(rows) {
  return (Array.isArray(rows) ? rows : []).map(function(row) {
    if (!row || row.type === 'blank') return ''
    if (row.type === 'header') return String(row.text || '')
    return serializeAnchorsToChordProLine(row.text || '', row.anchors || [])
  })
}

export function alignRowsHaveChords(rows) {
  return (Array.isArray(rows) ? rows : []).some(function(row) {
    return !!(row && row.type === 'lyric' && Array.isArray(row.anchors) && row.anchors.length)
  })
}

/**
 * Chord at a given character offset (first if several stacked).
 */
export function chordAtOffset(anchors, offset) {
  const list = Array.isArray(anchors) ? anchors : []
  for (let i = 0; i < list.length; i += 1) {
    if (Number(list[i].offset) === Number(offset)) return list[i].chord || ''
  }
  return ''
}

export function anchorIndexAtOffset(anchors, offset) {
  const list = Array.isArray(anchors) ? anchors : []
  for (let i = 0; i < list.length; i += 1) {
    if (Number(list[i].offset) === Number(offset)) return i
  }
  return -1
}

/**
 * Nearest letter index for a horizontal drag position.
 * @param {Array<{left:number,right:number}|null>} rects - per character
 * @param {number} clientX
 * @param {string} text - skip whitespace targets
 */
export function letterIndexNearestClientX(rects, clientX, text) {
  const list = Array.isArray(rects) ? rects : []
  const raw = String(text == null ? '' : text)
  if (!list.length) return -1
  const x = Number(clientX)
  if (!Number.isFinite(x)) return 0

  let bestIndex = -1
  let bestDistance = Infinity
  list.forEach(function(rect, index) {
    if (!rect) return
    if (index < raw.length && /\s/.test(raw.charAt(index))) return
    if (index >= raw.length) return
    const left = Number(rect.left)
    const right = Number(rect.right)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return
    const mid = left + ((right - left) / 2)
    const distance = Math.abs(x - mid)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  if (bestIndex >= 0) return bestIndex

  // Fallback: any rect (including spaces) if line had only whitespace.
  list.forEach(function(rect, index) {
    if (!rect) return
    const left = Number(rect.left)
    const right = Number(rect.right)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return
    const mid = left + ((right - left) / 2)
    const distance = Math.abs(x - mid)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

// --- Backward-compatible word-slot helpers (word-start only) ---

/**
 * @deprecated Prefer parseChordProLineToAnchors for letter-level align.
 */
export function parseChordProLineToWordSlots(line) {
  const parsed = parseChordProLineToAnchors(line)
  const words = parsed.text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    if (parsed.anchors.length) {
      return [{ word: '', chord: parsed.anchors.map(function(a) { return a.chord }).join(' ') }]
    }
    return []
  }
  // Map anchors to word that contains the offset.
  const slots = words.map(function(word) { return { word: word, chord: '' } })
  let cursor = 0
  const trimmed = parsed.text
  const starts = words.map(function(word) {
    const idx = trimmed.indexOf(word, cursor)
    const start = idx >= 0 ? idx : cursor
    cursor = start + word.length
    return start
  })
  parsed.anchors.forEach(function(anchor) {
    let wordIndex = 0
    for (let i = 0; i < starts.length; i += 1) {
      if (anchor.offset >= starts[i]) wordIndex = i
    }
    if (slots[wordIndex].chord) {
      slots[wordIndex].chord += ' ' + anchor.chord
    } else {
      slots[wordIndex].chord = anchor.chord
    }
  })
  return slots
}

export function serializeWordSlotsToChordProLine(slots) {
  const source = Array.isArray(slots) ? slots : []
  if (!source.length) return ''
  return source.map(function(slot) {
    const chord = String(slot && slot.chord || '').trim()
    const word = String(slot && slot.word != null ? slot.word : '')
    const chordPart = chord
      ? chord.split(/\s+/).filter(Boolean).map(function(c) { return '[' + c + ']' }).join('')
      : ''
    return chordPart + word
  }).join(' ')
}

export function moveChordBetweenWordSlots(slots, fromIndex, toIndex) {
  const next = (Array.isArray(slots) ? slots : []).map(function(slot) {
    return {
      word: slot && slot.word != null ? String(slot.word) : '',
      chord: slot && slot.chord ? String(slot.chord) : '',
    }
  })
  const from = Number(fromIndex)
  const to = Number(toIndex)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return next
  if (from === to) return next
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  if (!next[from].chord) return next
  const moving = next[from].chord
  next[from].chord = next[to].chord
  next[to].chord = moving
  return next
}

export function wordSlotsFromCowPair(chordLine, lyricLine) {
  const parsed = anchorsFromCowPair(chordLine, lyricLine)
  return parseChordProLineToWordSlots(serializeAnchorsToChordProLine(parsed.text, parsed.anchors))
}

/** @deprecated Use letterIndexNearestClientX */
export function wordIndexNearestClientX(rects, clientX) {
  return letterIndexNearestClientX(rects, clientX, null)
}
