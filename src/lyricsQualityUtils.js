/**
 * Detect non-lyric dumps (guitar TAB, Usenet posts, fingering charts) that
 * lyrics APIs sometimes return for instrumental titles.
 */

import {
  hasChordLines,
  isSectionHeader,
  linesHaveChordProInlineChords,
  stripChordsFromLyricLines,
} from './chordSheetUtils'

const TAB_STAFF_LINE_RE = /^[eadgbEADGB]\s*\|[-0-9hpbrx/\\~().=*sS\s|]+$/
const NNTP_HEADER_RE = /^(?:Path|Newsgroups|Message-ID|Xref|NNTP-Posting-Host|Organization|Reply-To|Followup-To|References|X-Newsreader)\s*:/i
const USENET_ARTICLE_RE = /^Article:\s*\d+/i
const TAB_SUBJECT_RE = /\bTAB\s*:/i
const GUITAR_TECH_RE = /\b(?:pull-?offs?|hammer-?ons?|slide|bends?|tremolo|barre|barres|fingering|adagio\s+sostenuto)\b/i
const FINGER_ONLY_RE = /^(?:[1-4]\s*){2,}$/
const ROMAN_BARRE_RE = /^(?:I{1,3}|IV|VI{0,3}|IX|X{0,3})\.{2,}/
const MOSTLY_SYMBOL_RE = /^[\d\s|./\\~\-=*hpbrxX()]+$/

function stripAccents(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * True for site placeholders like letras.mus.br "Música Instrumental /
 * Esta música não possui letra" — not singable lyrics.
 */
export function isNoLyricsPlaceholderLine(line) {
  const collapsed = stripAccents(String(line || '').trim())
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (!collapsed) return false

  if (/^musica instrumental$/.test(collapsed)) return true
  if (/^esta (musica|cancion) (nao possui|no tiene) letra$/.test(collapsed)) return true
  if (/^musica instrumental esta (musica|cancion) (nao possui|no tiene) letra$/.test(collapsed)) {
    return true
  }
  if (/^this (song|track) (has no|does not have) lyrics?$/.test(collapsed)) return true
  if (/^(no lyrics?( available| found| yet)?|lyrics? not available)$/.test(collapsed)) return true
  if (/^there are no lyrics/.test(collapsed)) return true
  if (/^instrumental$/.test(collapsed)) return true

  const flat = collapsed.replace(/\s/g, '')
  if (/musicainstrumental(estamusica|estacancion)/.test(flat)) return true
  if (flat.includes('musicainstrumental') && /naopossuiletra|notieneletra|semletra/.test(flat)) {
    return true
  }

  return false
}

export function looksLikeNoLyricsPlaceholder(linesOrText) {
  const lines = Array.isArray(linesOrText)
    ? nonEmptyLines(linesOrText)
    : nonEmptyLines(String(linesOrText || '').replace(/\r/g, '').split('\n'))
  if (!lines.length) return true
  if (lines.every(isNoLyricsPlaceholderLine)) return true
  if (lines.length <= 2) {
    const content = lines.filter(function(line) {
      return !isNoLyricsPlaceholderLine(line)
    })
    if (!content.length) return true
  }
  return false
}

function nonEmptyLines(lines) {
  return (lines || []).map(function(line) {
    return String(line || '').trim()
  }).filter(Boolean)
}

export function isTabStaffLine(line) {
  return TAB_STAFF_LINE_RE.test(String(line || '').trim())
}

export function isUsenetOrTabMetaLine(line) {
  const text = String(line || '').trim()
  if (!text) return false
  if (NNTP_HEADER_RE.test(text)) return true
  if (USENET_ARTICLE_RE.test(text)) return true
  if (TAB_SUBJECT_RE.test(text)) return true
  if (FINGER_ONLY_RE.test(text)) return true
  if (ROMAN_BARRE_RE.test(text)) return true
  return false
}

/**
 * True when the bulk of the text looks like guitar TAB / Usenet fingering dump
 * rather than singable lyrics.
 */
export function looksLikeNonLyricDump(linesOrText) {
  const lines = Array.isArray(linesOrText)
    ? nonEmptyLines(linesOrText)
    : nonEmptyLines(String(linesOrText || '').replace(/\r/g, '').split('\n'))
  if (lines.length < 4) return false

  let tabStaff = 0
  let meta = 0
  let tech = 0
  let symbolHeavy = 0
  lines.forEach(function(line) {
    if (isTabStaffLine(line)) tabStaff += 1
    else if (isUsenetOrTabMetaLine(line)) meta += 1
    else if (GUITAR_TECH_RE.test(line)) tech += 1
    else if (line.length >= 8 && MOSTLY_SYMBOL_RE.test(line)) symbolHeavy += 1
  })

  if (tabStaff >= 2) return true
  if (meta >= 2) return true
  if (tabStaff >= 1 && (meta >= 1 || tech >= 2)) return true
  if (tech >= 3 && symbolHeavy >= 3) return true

  const dumpish = tabStaff + meta + tech + symbolHeavy
  if (lines.length >= 20 && dumpish / lines.length >= 0.35) return true

  const joined = lines.join('\n')
  if (/Newsgroups\s*:/i.test(joined) && /Message-ID\s*:/i.test(joined)) return true
  if (/\bTAB\s*:/i.test(joined) && tabStaff + tech >= 2) return true

  return false
}

/**
 * True when lines still have sung words after chord rows / ChordPro markers
 * are stripped. Chord-only accompaniment grids fail this check.
 */
export function hasSingableLyricText(linesOrText) {
  const stripped = stripChordsFromLyricLines(linesOrText)
  const wordLines = []
  stripped.forEach(function(line) {
    const text = String(line || '').trim()
    if (!text) return
    if (isSectionHeader(text)) return
    if (!/[A-Za-z]{2,}/.test(text)) return
    wordLines.push(text)
  })
  if (wordLines.length === 0) return false
  if (wordLines.length >= 2) return true
  const tokens = wordLines.join(' ').split(/\s+/).filter(function(token) {
    return /[A-Za-z]{2,}/.test(token)
  })
  if (tokens.length >= 3) return true
  // One short sung line still counts; lone chord leftovers like "Em" do not.
  return tokens.length >= 1 && tokens[0].length >= 3
}

/**
 * Chord chart / ABC accompaniment dump with no (or almost no) sung lyrics.
 */
export function looksLikeChordOnlyContent(linesOrText) {
  const raw = Array.isArray(linesOrText)
    ? linesOrText
    : String(linesOrText || '').replace(/\r/g, '').split('\n')
  if (!raw.some(function(line) { return String(line || '').trim() })) return false
  if (!hasChordLines(raw) && !linesHaveChordProInlineChords(raw)) return false
  return !hasSingableLyricText(raw)
}

/**
 * @returns {{ ok: boolean, reason?: string, lines?: string[] }}
 */
export function isUsableLyricContent(linesOrText) {
  const raw = Array.isArray(linesOrText)
    ? linesOrText
    : String(linesOrText || '').replace(/\r/g, '').split('\n')
  const kept = []
  raw.forEach(function(line) {
    const text = String(line || '')
    const trimmed = text.trim()
    if (!trimmed) {
      if (kept.length && kept[kept.length - 1] !== '') kept.push('')
      return
    }
    if (isTabStaffLine(trimmed) || isUsenetOrTabMetaLine(trimmed)) return
    kept.push(text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
  })
  while (kept.length && kept[kept.length - 1] === '') kept.pop()

  if (!kept.some(function(line) { return String(line || '').trim() })) {
    return { ok: false, reason: 'empty', lines: [] }
  }
  if (looksLikeNoLyricsPlaceholder(kept) || looksLikeNoLyricsPlaceholder(raw)) {
    return { ok: false, reason: 'no_lyrics_placeholder', lines: [] }
  }
  if (looksLikeNonLyricDump(kept) || looksLikeNonLyricDump(raw)) {
    return { ok: false, reason: 'non_lyric_dump', lines: [] }
  }
  if (looksLikeChordOnlyContent(kept) || looksLikeChordOnlyContent(raw)) {
    return { ok: false, reason: 'chord_only', lines: [] }
  }
  return { ok: true, lines: kept }
}
