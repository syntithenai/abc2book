/**
 * Letter-level ChordPro align model: drag chords onto any character in a lyric
 * line, persist as inline ChordPro (`Ama[G]zing`).
 */
import {
  classifyLyricChordLines,
  isSectionHeader,
  isLeadingTitleComposerLine,
  lineHasChordProInlineChords,
  parseChordProInlineLyricLine,
} from './chordSheetUtils'
import { formatLyricSectionHeader } from './lyricStructureUtils'

/** Extra start-of-line drop slots so a couple of chords can sit before the first word. */
export const ALIGN_LEADING_PAD_SLOTS = 2

/** Extra end-of-line drop slots so a few chords can sit after the last word. */
export const ALIGN_TRAILING_PAD_SLOTS = 4

export function alignDisplayIndexToOffset(displayIndex) {
  return Number(displayIndex) - ALIGN_LEADING_PAD_SLOTS
}

/**
 * Map a click on a displayed letter onto a caret in the stored lyric text.
 * Leading/trailing pads go to the start/end; a click on the right half of a
 * letter places the caret after that character.
 */
export function alignLetterClickToCaret(text, offset, clientX, rect) {
  const raw = String(text == null ? '' : text)
  const len = raw.length
  let o = Number(offset)
  if (!Number.isFinite(o)) o = 0
  if (o < 0) return 0
  if (o >= len) return len
  const left = rect ? Number(rect.left) : NaN
  const right = rect ? Number(rect.right) : NaN
  const x = Number(clientX)
  if (!Number.isFinite(left) || !Number.isFinite(right) || !(right > left) || !Number.isFinite(x)) {
    return o
  }
  return x >= left + ((right - left) / 2) ? o + 1 : o
}

export function isAlignPadOffset(text, offset) {
  const o = Number(offset)
  if (!Number.isFinite(o)) return false
  if (o < 0) return true
  return o >= String(text == null ? '' : text).length
}

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
 * Used when importing COW chord columns onto words.
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
 * Snap to a droppable Align slot: any character except `/`, a leading pad
 * index before the stored line, or a trailing pad index at or after the end.
 */
export function snapAlignOffset(text, offset) {
  const raw = String(text == null ? '' : text)
  let o = Number(offset)
  if (!Number.isFinite(o)) o = 0
  if (o < 0) return Math.max(-ALIGN_LEADING_PAD_SLOTS, Math.trunc(o))
  if (!raw.length) return o
  if (o >= raw.length) return o
  if (raw.charAt(o) !== '/') return o
  for (let i = o + 1; i < raw.length; i += 1) {
    if (raw.charAt(i) !== '/') return i
  }
  for (let i = o - 1; i >= 0; i -= 1) {
    if (raw.charAt(i) !== '/') return i
  }
  return raw.length
}

/**
 * Ensure `offset` is a valid index by prepending or appending spaces.
 */
export function padAlignLineToOffset(text, offset) {
  const raw = String(text == null ? '' : text)
  const o = Number(offset)
  if (!Number.isFinite(o)) return raw
  if (o < 0) return ' '.repeat(-o) + raw
  if (o < raw.length) return raw
  return raw + ' '.repeat(o + 1 - raw.length)
}

function alignPaddingRange(text, anchors) {
  const raw = String(text == null ? '' : text)
  let last = -1
  let first = raw.length
  for (let i = 0; i < raw.length; i += 1) {
    if (!/\s/.test(raw.charAt(i))) {
      last = i
      if (i < first) first = i
    }
  }
  ;(Array.isArray(anchors) ? anchors : []).forEach(function(anchor) {
    const o = Number(anchor && anchor.offset)
    if (!Number.isFinite(o)) return
    if (o > last) last = o
    if (o < first) first = o
  })
  if (last < 0) return { start: 0, end: 0 }
  return { start: Math.max(0, first), end: last + 1 }
}

/**
 * Drop unused leading/trailing spaces that have no chord on them.
 */
export function trimAlignLinePadding(text, anchors) {
  const raw = String(text == null ? '' : text)
  const range = alignPaddingRange(raw, anchors)
  return raw.slice(range.start, range.end)
}

/**
 * Stored characters plus leading and trailing pad spaces used as drop targets.
 */
export function alignLineDisplayChars(text) {
  const raw = String(text == null ? '' : text)
  const chars = []
  for (let i = 0; i < ALIGN_LEADING_PAD_SLOTS; i += 1) chars.push(' ')
  if (raw.length) chars.push.apply(chars, raw.split(''))
  for (let i = 0; i < ALIGN_TRAILING_PAD_SLOTS; i += 1) chars.push(' ')
  return chars
}

export function padAlignRowToOffset(row, offset) {
  const rawText = String(row && row.text || '')
  const o = Number(offset)
  const shift = Number.isFinite(o) && o < 0 ? -o : 0
  const text = padAlignLineToOffset(rawText, o)
  const added = text.length - rawText.length
  let sourceText = row && row.sourceText != null ? String(row.sourceText) : rawText
  if (sourceText === rawText || sourceText.indexOf('/') < 0) {
    sourceText = text
  } else if (added > 0) {
    sourceText = shift > 0
      ? ' '.repeat(shift) + sourceText
      : sourceText + ' '.repeat(added)
  }
  const anchors = cloneAnchors(row && row.anchors).map(function(anchor) {
    return { chord: anchor.chord, offset: anchor.offset + shift }
  })
  return {
    text: text,
    sourceText: sourceText,
    anchors: anchors,
    offset: shift > 0 ? 0 : o,
  }
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

    if (pendingChords.length) {
      const offset = text.length
      let placeAt = offset
      const leadingSpace = fragment.match(/^\s+/)
      const rest = leadingSpace ? fragment.slice(leadingSpace[0].length) : fragment
      // ChordPro `[C]word` sits on the word; `[C] ` (spaces only) sits on the space.
      // Keep chords on leading padding spaces so Align can store pickup chords
      // before the first letter (`[C]  Amazing`).
      if (leadingSpace && rest && /\S/.test(text)) placeAt = offset + leadingSpace[0].length
      placeAt = snapAlignOffset(text + fragment, placeAt)
      pendingChords.forEach(function(c) {
        anchors.push({ chord: c, offset: placeAt })
      })
      pendingChords = []
    }
    text += fragment
  })

  if (pendingChords.length) {
    const placeAt = snapAlignOffset(text, text.length)
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
 * When `sourceText` still contains `/` beat markers, those are restored and
 * chords are never written onto the slash characters.
 */
export function serializeAnchorsToChordProLine(text, anchors, sourceText) {
  const display = String(text == null ? '' : text)
  const source = sourceText != null ? String(sourceText) : display
  if (source !== display && source.indexOf('/') >= 0) {
    return serializeAnchorsIntoBeatMarkedSource(source, anchors)
  }
  const list = cloneAnchors(anchors)
  let raw = display
  list.forEach(function(anchor) {
    const o = Math.max(0, Number(anchor.offset) || 0)
    if (o >= raw.length) raw = padAlignLineToOffset(raw, o)
  })
  const byOffset = Object.create(null)
  list.forEach(function(anchor) {
    let offset = snapAlignOffset(raw, Number(anchor.offset) || 0)
    if (offset < 0) offset = 0
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

function serializeAnchorsIntoBeatMarkedSource(sourceText, anchors) {
  const source = String(sourceText == null ? '' : sourceText)
  const list = cloneAnchors(anchors)
  const byDisplay = Object.create(null)
  list.forEach(function(anchor) {
    const offset = Math.max(0, Number(anchor.offset) || 0)
    if (!byDisplay[offset]) byDisplay[offset] = []
    byDisplay[offset].push(anchor.chord)
  })

  function emitChords(out, displayOffset) {
    const at = byDisplay[displayOffset]
    if (!at) return out
    at.forEach(function(chord) {
      out += '[' + chord + ']'
    })
    return out
  }

  let out = ''
  let displayOffset = 0
  let i = 0
  while (i < source.length) {
    if (source.charAt(i) === '/') {
      let k = i
      while (k < source.length && source.charAt(k) === '/') k += 1
      const attachedLetter = k < source.length && !/\s/.test(source.charAt(k))
      if (attachedLetter) {
        out = emitChords(out, displayOffset)
        out += source.slice(i, k) + source.charAt(k)
        displayOffset += 1
        i = k + 1
        continue
      }
      out += source.slice(i, k)
      i = k
      continue
    }
    out = emitChords(out, displayOffset)
    out += source.charAt(i)
    displayOffset += 1
    i += 1
  }
  out = emitChords(out, displayOffset)
  Object.keys(byDisplay).map(function(key) { return Number(key) }).sort(function(a, b) { return a - b }).forEach(function(offset) {
    if (offset <= displayOffset) return
    while (displayOffset < offset) {
      out += ' '
      displayOffset += 1
    }
    out = emitChords(out, displayOffset)
  })
  return out
}

/**
 * Strip `/` beat markers from align display text and remap chord offsets onto
 * letters. `sourceText` keeps the slashes for serialize.
 */
export function hideLyricBeatMarkersForAlign(text, anchors) {
  const source = String(text == null ? '' : text)
  let display = ''
  const sourceToDisplay = new Array(source.length)
  for (let i = 0; i < source.length; i += 1) {
    if (source.charAt(i) === '/') {
      sourceToDisplay[i] = -1
    } else {
      sourceToDisplay[i] = display.length
      display += source.charAt(i)
    }
  }

  function displayOffsetFromSource(src) {
    if (!source.length || !display.length) return 0
    let o = Math.max(0, Math.min(source.length - 1, Number(src) || 0))
    if (sourceToDisplay[o] >= 0) return sourceToDisplay[o]
    for (let i = o + 1; i < source.length; i += 1) {
      if (sourceToDisplay[i] >= 0) return sourceToDisplay[i]
    }
    for (let i = o - 1; i >= 0; i -= 1) {
      if (sourceToDisplay[i] >= 0) return sourceToDisplay[i]
    }
    return 0
  }

  const nextAnchors = cloneAnchors(anchors).map(function(anchor) {
    return {
      chord: anchor.chord,
      offset: displayOffsetFromSource(anchor.offset),
    }
  })
  return { text: display, sourceText: source, anchors: nextAnchors }
}

function applyAlignDisplay(text, anchors) {
  return hideLyricBeatMarkersForAlign(text, anchors)
}

/**
 * Move one anchor to a new character offset. If another anchor already sits on
 * that offset, swap offsets.
 */
export function moveChordAnchor(anchors, fromIndex, toOffset, text) {
  const next = cloneAnchors(anchors)
  const from = Number(fromIndex)
  if (!Number.isFinite(from) || from < 0 || from >= next.length) return next
  const target = snapAlignOffset(String(text == null ? '' : text), toOffset)
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
 * True when `offset` is the first letter of a word (or the only slot on an
 * empty line). Used to show add-chord buttons.
 */
export function isWordStartOffset(text, offset) {
  const raw = String(text == null ? '' : text)
  const o = Number(offset)
  if (!Number.isFinite(o) || o < 0) return false
  if (!raw.length) return o === 0
  if (o >= raw.length) return false
  if (/\s/.test(raw.charAt(o)) || raw.charAt(o) === '/') return false
  if (o === 0) return true
  const prev = raw.charAt(o - 1)
  return /\s/.test(prev) || prev === '/'
}

/**
 * Add or replace a chord at a letter offset. Empty `chord` removes any anchor
 * already at that offset.
 */
export function upsertChordAnchor(anchors, offset, chord, text) {
  const next = cloneAnchors(anchors)
  const raw = padAlignLineToOffset(text, offset)
  const target = snapAlignOffset(raw, offset)
  const chordText = String(chord || '').trim()
  const existing = next.findIndex(function(anchor) {
    return Number(anchor.offset) === target
  })
  if (!chordText) {
    if (existing >= 0) next.splice(existing, 1)
    return next
  }
  if (existing >= 0) {
    next[existing] = { chord: chordText, offset: target }
    return next
  }
  next.push({ chord: chordText, offset: target })
  next.sort(function(a, b) { return a.offset - b.offset })
  return next
}

export function removeChordAnchor(anchors, index) {
  const next = cloneAnchors(anchors)
  const i = Number(index)
  if (!Number.isFinite(i) || i < 0 || i >= next.length) return next
  next.splice(i, 1)
  return next
}

/**
 * Leading song-title / bibliographic line plus following blanks, if present.
 * Kept on serialize so Align does not delete it from the lyrics field.
 */
export function splitAlignPrefaceLines(lines, options) {
  const source = Array.isArray(lines) ? lines : String(lines == null ? '' : lines).split(/\r?\n/)
  let start = 0
  while (start < source.length && !String(source[start] || '').trim()) start += 1
  if (start >= source.length) return { preface: [], rest: source }

  const firstLine = source[start]
  let next = start + 1
  while (next < source.length && !String(source[next] || '').trim()) next += 1
  const nextLine = next < source.length ? source[next] : ''
  const blankAfter = next > start + 1
  const nextIsHeader = !!nextLine && isSectionHeader(nextLine)
  const hasMore = next < source.length

  let firstBlockLineCount = 1
  if (hasMore && !blankAfter && !nextIsHeader) {
    let count = 1
    let k = start + 1
    while (k < source.length && String(source[k] || '').trim()) {
      count += 1
      k += 1
    }
    firstBlockLineCount = count
  }

  if (!hasMore) return { preface: [], rest: source }

  if (!isLeadingTitleComposerLine(firstLine, {
    title: options && options.title,
    composer: options && options.composer,
    firstBlockLineCount: firstBlockLineCount,
  })) {
    return { preface: [], rest: source }
  }

  const cut = blankAfter ? next : start + 1
  return { preface: source.slice(0, cut), rest: source.slice(cut) }
}

/**
 * Build Align rows from lyric text (ChordPro and/or COW).
 * Lyric rows: `{ type:'lyric', text, sourceText, anchors }`.
 */
export function lyricLinesToAlignRows(lines, options) {
  const split = splitAlignPrefaceLines(lines, options)
  const classified = classifyLyricChordLines(split.rest)
  const rows = split.preface.map(function(line) {
    return { type: 'preface', text: line }
  })
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
        const display = applyAlignDisplay(parsed.text, parsed.anchors)
        rows.push({
          type: 'lyric',
          text: display.text,
          sourceText: display.sourceText,
          anchors: display.anchors,
        })
        i = j + 1
        continue
      }
      i += 1
      continue
    }
    if (item.type === 'lyric') {
      if (lineHasChordProInlineChords(item.text)) {
        const parsed = parseChordProLineToAnchors(item.text)
        const display = applyAlignDisplay(parsed.text, parsed.anchors)
        rows.push({
          type: 'lyric',
          text: display.text,
          sourceText: display.sourceText,
          anchors: display.anchors,
        })
      } else {
        const display = applyAlignDisplay(String(item.text || ''), [])
        rows.push({
          type: 'lyric',
          text: display.text,
          sourceText: display.sourceText,
          anchors: display.anchors,
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
    if (row.type === 'header' || row.type === 'preface') return String(row.text || '')
    const trimmed = trimAlignRowPadding(row)
    return serializeAnchorsToChordProLine(trimmed.text, trimmed.anchors, trimmed.sourceText)
  })
}

export function alignRowsHaveChords(rows) {
  return (Array.isArray(rows) ? rows : []).some(function(row) {
    return !!(row && row.type === 'lyric' && Array.isArray(row.anchors) && row.anchors.length)
  })
}

function emptyAlignLyricRow() {
  return { type: 'lyric', text: '', sourceText: '', anchors: [] }
}

export function trimAlignRowPadding(row) {
  const anchors = cloneAnchors(row && row.anchors)
  const raw = String(row && row.text || '')
  const range = alignPaddingRange(raw, anchors)
  const text = raw.slice(range.start, range.end)
  const start = range.start
  const nextAnchors = start > 0
    ? anchors.map(function(anchor) {
      return { chord: anchor.chord, offset: anchor.offset - start }
    })
    : anchors
  let sourceText = row && row.sourceText != null ? String(row.sourceText) : raw
  if (sourceText === raw || sourceText.indexOf('/') < 0) {
    sourceText = text
  } else {
    const endRemoved = raw.length - range.end
    if (endRemoved > 0 && sourceText.length >= endRemoved) {
      const tail = sourceText.slice(sourceText.length - endRemoved)
      if (/^\s+$/.test(tail)) sourceText = sourceText.slice(0, sourceText.length - endRemoved)
    }
    if (start > 0 && sourceText.length >= start) {
      const head = sourceText.slice(0, start)
      if (/^\s+$/.test(head)) sourceText = sourceText.slice(start)
    }
  }
  return Object.assign({}, row, { text: text, sourceText: sourceText, anchors: nextAnchors })
}

/**
 * Place or move chords at `offset`, growing leading or trailing spaces as needed.
 */
export function applyAlignChordAnchors(row, offset, makeAnchors) {
  const padded = padAlignRowToOffset(row, offset)
  const anchors = makeAnchors(padded.text, padded.anchors, padded.offset)
  return trimAlignRowPadding(Object.assign({}, row, {
    text: padded.text,
    sourceText: padded.sourceText,
    anchors: anchors,
  }))
}

export function remapAnchorsToNewText(anchors, newText) {
  const raw = String(newText == null ? '' : newText)
  return cloneAnchors(anchors).map(function(anchor) {
    return {
      chord: anchor.chord,
      offset: snapAlignOffset(raw, Math.min(anchor.offset, Math.max(0, raw.length))),
    }
  }).filter(function(anchor) {
    return !!anchor.chord && anchor.offset >= 0
  })
}

export function setAlignLyricText(rows, index, newText) {
  const text = String(newText == null ? '' : newText)
  return (Array.isArray(rows) ? rows : []).map(function(row, i) {
    if (i !== index || !row || row.type !== 'lyric') return row
    const anchors = remapAnchorsToNewText(row.anchors, text)
    return trimAlignRowPadding(Object.assign({}, row, {
      text: text,
      sourceText: text,
      anchors: anchors,
    }))
  })
}

export function setAlignHeaderText(rows, index, name) {
  const header = formatLyricSectionHeader(name)
  if (!header) return Array.isArray(rows) ? rows.slice() : []
  return (Array.isArray(rows) ? rows : []).map(function(row, i) {
    if (i !== index || !row || row.type !== 'header') return row
    return Object.assign({}, row, { text: header })
  })
}

export function insertAlignLyricRow(rows, afterIndex) {
  const next = (Array.isArray(rows) ? rows : []).slice()
  const row = emptyAlignLyricRow()
  const at = Number(afterIndex)
  if (!Number.isFinite(at) || at < 0 || at >= next.length) {
    next.push(row)
  } else {
    next.splice(at + 1, 0, row)
  }
  return next
}

function sectionEndIndex(rows, headerIndex) {
  let end = headerIndex + 1
  while (end < rows.length && rows[end] && rows[end].type !== 'header') end += 1
  return end - 1
}

export function insertAlignSectionAfter(rows, afterIndex, name) {
  const header = formatLyricSectionHeader(name)
  if (!header) return Array.isArray(rows) ? rows.slice() : []
  const next = (Array.isArray(rows) ? rows : []).slice()
  let insertAt
  const at = Number(afterIndex)
  if (!Number.isFinite(at) || at < 0 || at >= next.length) {
    insertAt = next.length
  } else if (next[at] && next[at].type === 'header') {
    insertAt = sectionEndIndex(next, at) + 1
  } else {
    insertAt = at + 1
  }
  const items = [
    { type: 'header', text: header },
    emptyAlignLyricRow(),
  ]
  if (insertAt > 0 && next[insertAt - 1] && next[insertAt - 1].type !== 'blank') {
    items.unshift({ type: 'blank' })
  }
  next.splice.apply(next, [insertAt, 0].concat(items))
  return next
}

export function deleteAlignRow(rows, index) {
  const next = (Array.isArray(rows) ? rows : []).slice()
  const i = Number(index)
  if (!Number.isFinite(i) || i < 0 || i >= next.length) return next
  if (next[i] && next[i].type === 'preface') return next
  next.splice(i, 1)
  return next
}

export function deleteAlignSection(rows, headerIndex) {
  const next = (Array.isArray(rows) ? rows : []).slice()
  const i = Number(headerIndex)
  if (!Number.isFinite(i) || i < 0 || i >= next.length) return next
  if (!next[i] || next[i].type !== 'header') return next
  const end = sectionEndIndex(next, i) + 1
  next.splice(i, end - i)
  return next
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
 * @param {string} text - skip `/` beat-marker slots
 */
export function letterIndexNearestClientX(rects, clientX, text) {
  const list = Array.isArray(rects) ? rects : []
  const raw = String(text == null ? '' : text)
  if (!list.length) return -1
  const x = Number(clientX)
  if (!Number.isFinite(x)) return 0

  let bestIndex = -1
  let bestDistance = Infinity
  const display = text == null ? null : alignLineDisplayChars(raw)
  list.forEach(function(rect, index) {
    if (!rect) return
    if (display && index < display.length && display[index] === '/') return
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
