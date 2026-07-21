/**
 * Detect non-lyric dumps (guitar TAB, Usenet posts, fingering charts) that
 * lyrics APIs sometimes return for instrumental titles.
 */

const TAB_STAFF_LINE_RE = /^[eadgbEADGB]\s*\|[-0-9hpbrx/\\~().=*sS\s|]+$/
const NNTP_HEADER_RE = /^(?:Path|Newsgroups|Message-ID|Xref|NNTP-Posting-Host|Organization|Reply-To|Followup-To|References|X-Newsreader)\s*:/i
const USENET_ARTICLE_RE = /^Article:\s*\d+/i
const TAB_SUBJECT_RE = /\bTAB\s*:/i
const GUITAR_TECH_RE = /\b(?:pull-?offs?|hammer-?ons?|slide|bends?|tremolo|barre|barres|fingering|adagio\s+sostenuto)\b/i
const FINGER_ONLY_RE = /^(?:[1-4]\s*){2,}$/
const ROMAN_BARRE_RE = /^(?:I{1,3}|IV|VI{0,3}|IX|X{0,3})\.{2,}/
const MOSTLY_SYMBOL_RE = /^[\d\s|./\\~\-=*hpbrxX()]+$/

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
  if (looksLikeNonLyricDump(kept) || looksLikeNonLyricDump(raw)) {
    return { ok: false, reason: 'non_lyric_dump', lines: [] }
  }
  return { ok: true, lines: kept }
}
