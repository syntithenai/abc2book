/** Minimum extra characters of space after a chord before the next chord. */
export const MIN_CHORD_LABEL_GAP_CHARS = 1

function chordText(value) {
  return String(value == null ? '' : value).trim()
}

function followingTokens(following) {
  if (Array.isArray(following)) return following
  if (following && typeof following === 'object') return [following]
  return []
}

/**
 * True when the lyric fragment is empty or only spaces (pickup/trailing pad).
 */
export function chordTokenLyricIsPad(token) {
  return !/\S/.test(String(token && token.text != null ? token.text : ''))
}

/**
 * Split pickup chords off the first word so `[G]  Amazing` renders as a chord
 * column before the lyrics instead of overflowing across the leading spaces.
 */
export function splitLeadingPickupChordTokens(tokens) {
  const source = Array.isArray(tokens) ? tokens : []
  const out = []
  let leading = true
  source.forEach(function(token) {
    if (!token) return
    const text = token.text != null ? String(token.text) : ''
    const chord = String(token.chord || '')
    if (!leading) {
      out.push(token)
      return
    }
    if (chordTokenLyricIsPad(token)) {
      out.push(token)
      return
    }
    const spaces = text.match(/^\s+/)
    if (spaces && chord.trim()) {
      out.push({ chord: chord, text: spaces[0] })
      out.push({ chord: '', text: text.slice(spaces[0].length) })
    } else {
      out.push(token)
    }
    leading = false
  })
  return out
}

/**
 * Isolated chords overflow the lyric column except when the lyric is only
 * padding spaces (pickup/trailing slots), which must keep the chord's width.
 */
export function chordTokenShouldOverflow(token, following) {
  const chord = chordText(token && token.chord)
  if (!chord) return false
  if (chordTokenLyricIsPad(token)) return false
  return !chordTokenNeedsDisplayGap(token, following)
}

/**
 * True when this token must reserve extra width so the next chord label on the
 * line cannot sit flush against it.
 *
 * Consecutive chorded tokens always keep a gap. Isolated chords (no later
 * chord, or enough lyric in between) must not stretch the words.
 *
 * @param {{chord?: string, text?: string}} token
 * @param {{chord?: string, text?: string}|Array<{chord?: string, text?: string}>|null} following
 */
export function chordTokenNeedsDisplayGap(token, following) {
  const chord = chordText(token && token.chord)
  if (!chord) return false
  const rest = followingTokens(following)
  if (rest.length === 0) return false
  if (chordText(rest[0] && rest[0].chord)) return true
  let intervening = String(token && token.text != null ? token.text : '')
  for (let i = 0; i < rest.length; i += 1) {
    const nextChord = chordText(rest[i] && rest[i].chord)
    if (nextChord) {
      return intervening.length < chord.length + MIN_CHORD_LABEL_GAP_CHARS
    }
    intervening += String(rest[i] && rest[i].text != null ? rest[i].text : '')
  }
  return false
}

/**
 * First chord anchor strictly after `offset`, or null.
 */
export function nextAnchorAfterOffset(anchors, offset) {
  const list = Array.isArray(anchors) ? anchors : []
  const from = Number(offset)
  let best = null
  for (let i = 0; i < list.length; i += 1) {
    const at = Number(list[i] && list[i].offset)
    if (!Number.isFinite(at) || at <= from) continue
    if (!chordText(list[i].chord)) continue
    if (!best || at < Number(best.offset)) best = list[i]
  }
  return best
}

/**
 * Character-widths the letter at `offset` must occupy so `chord` does not
 * collide with the next chord. 0 means keep the natural letter width.
 */
export function chordLetterGapSlotChars(chord, offset, nextOffset) {
  const label = chordText(chord)
  if (!label) return 0
  if (nextOffset == null || nextOffset === '') return 0
  const next = Number(nextOffset)
  const from = Number(offset) || 0
  if (!Number.isFinite(next) || next <= from) return 0
  const intervening = next - from - 1
  const needed = label.length + MIN_CHORD_LABEL_GAP_CHARS
  const slotChars = needed - intervening
  return slotChars > 1 ? slotChars : 0
}
