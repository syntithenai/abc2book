#!/usr/bin/env node
/**
 * Convert Brooke Marshal intermediate JSON into final ABC notation.
 * Chord lines are written as standard ABC chord annotations on the scaffold
 * bar (e.g. | "Am" z2 "G" z2 |) with an empty w: field, not as w: lyrics.
 */

const fs = require('fs')
const path = require('path')
const { chordParserFactory, chordRendererFactory } = require('chord-symbol')

const JSON_DIR = path.join(__dirname, 'brooke-marshal-output', 'json')
const OUT_FILE = path.join(__dirname, 'brooke-marshal-output', 'brooke-marshal.abc')

const parseChord = chordParserFactory()
const renderChord = chordRendererFactory({ useShortNamings: true })

const SECTION_RE = /^(#+\s*)?(verse|chorus|bridge|intro|outro|pre-?chorus|refrain|coda|tag|instrumental|solo|interlude|hook|break|echo|guitar)(\s*\d+)?/i

function normalizeChordToken(token) {
  return String(token).replace(/[(),.:|]/g, '').trim()
    .replace(/^([A-G])flat/i, '$1b')
    .replace(/^([A-G])sharp/i, '$1#')
}

function tokenIsChord(token) {
  const cleaned = normalizeChordToken(token)
  if (!cleaned) return false
  if (/^[a-g]$/.test(cleaned)) return false
  try {
    return renderChord(parseChord(cleaned)) !== null
  } catch (e) {
    return false
  }
}

function isSectionHeader(line) {
  const t = String(line || '').trim()
  if (!t) return false
  if (/^\[.+\]$/.test(t)) return true
  const stripped = t.replace(/^#+\s*/, '').trim()
  return SECTION_RE.test(stripped)
}

function chordTokensAllParse(tokens) {
  return tokens.length > 0 && tokens.every(tokenIsChord)
}

function isChordLine(line) {
  const t = splitChordBlob(String(line || '').trim())
  if (!t || isSectionHeader(t)) return false
  const barRepeat = t.match(/^\(([^)]+)\)\s*x\s*\d+$/i)
  if (barRepeat) {
    return chordTokensAllParse(barRepeat[1].trim().split(/\s+/))
  }
  const trailingRepeat = t.match(/^(.+?)\s+x\s+\d+$/i)
  if (trailingRepeat) {
    return chordTokensAllParse(trailingRepeat[1].trim().split(/\s+/))
  }
  return chordTokensAllParse(t.split(/\s+/))
}

function normalizeChordLine(line) {
  let t = String(line || '').trim()
  if (!t) return t
  t = splitChordBlob(t)
  const barRepeat = t.match(/^\(([^)]+)\)\s*x\s*\d+$/i)
  if (barRepeat) {
    return barRepeat[1].trim().split(/\s+/).map(normalizeChordToken).join(' ')
  }
  const trailingRepeat = t.match(/^(.+?)\s+[xX]\s*\d+$/i)
  if (trailingRepeat) {
    const parts = trailingRepeat[1].trim().split(/\s+/)
    if (chordTokensAllParse(parts)) {
      return parts.map(normalizeChordToken).join(' ')
    }
  }
  if (isChordLine(t)) {
    return t.split(/\s+/).map(normalizeChordToken).join(' ')
  }
  return t
}

function splitChordBlob(text) {
  const t = String(text || '').trim()
  if (!t || t.includes(' ')) return t.replace(/\s+/g, ' ')
  const parts = t.match(/[A-G](?:#|b|flat)?(?:maj|min|m|dim|aug|sus|add)?[0-9]*/gi)
  if (parts && parts.length >= 2) {
    const compact = t.replace(/[^A-Ga-g#b]/g, '')
    const joined = parts.join('')
    if (joined.replace(/b/g, '').replace(/#/g, '') === compact.replace(/b/g, '').replace(/#/g, '')) {
      return parts.join(' ')
    }
  }
  return t
}

function classifyLines(lines) {
  return (lines || []).map(function(raw) {
    const line = raw == null ? '' : String(raw)
    if (!line.trim()) return { type: 'blank', text: '' }
    if (isSectionHeader(line)) return { type: 'header', text: line.trim() }
    const chord = normalizeChordLine(line)
    if (isChordLine(chord)) return { type: 'chord', text: chord }
    return { type: 'lyric', text: line }
  })
}

function escapeAbcChord(chord) {
  return String(chord || '').replace(/"/g, '').trim()
}

/** One 4/4 bar (L:1/4) carrying one or more chord symbols over rests. */
function chordLineToNoteLine(chordText) {
  const chords = String(chordText || '').trim().split(/\s+/).filter(Boolean)
  if (!chords.length) return '|z4 z4 z4 z4|'
  const barBeats = 4
  const base = Math.floor(barBeats / chords.length)
  let remainder = barBeats - base * chords.length
  const segments = []
  chords.forEach(function(chord) {
    let beats = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder--
    segments.push('"' + escapeAbcChord(chord) + '"')
    segments.push(beats === 1 ? 'z' : ('z' + beats))
  })
  return '| ' + segments.join(' ') + ' |'
}

function appendDoubleBar(noteLine) {
  return String(noteLine || '|').replace(/\|(?!\|)\s*$/, '||')
}

function buildInterleavedLines(sheetLines) {
  const classified = classifyLines(sheetLines)
  const noteLines = []
  const wLines = []

  classified.forEach(function(item) {
    if (item.type === 'blank') {
      if (noteLines.length > 0) {
        noteLines[noteLines.length - 1] = appendDoubleBar(noteLines[noteLines.length - 1])
      }
      noteLines.push('|')
      wLines.push('')
      return
    }
    if (item.type === 'chord') {
      noteLines.push(chordLineToNoteLine(item.text))
      wLines.push('')
      return
    }
    noteLines.push('|z4 z4 z4 z4|')
    wLines.push(item.text)
  })

  if (!noteLines.length) {
    noteLines.push('|z4 z4 z4 z4|')
    wLines.push('')
  }

  return { noteLines: noteLines, wLines: wLines }
}

function ensureText(value) {
  return value == null ? '' : String(value)
}

function tuneToAbc(tune, tuneNumber) {
  const built = buildInterleavedLines(tune.sheetLines)
  const noteLines = built.noteLines
  const wLines = built.wLines

  const books = (tune.books || []).map(function(book) {
    return 'B: ' + ensureText(book).toLowerCase()
  }).join('\n')

  const tempo = parseInt(tune.tempo, 10)
  const tempoLine = tempo > 0 ? 'Q: 1/4=' + tempo + '\n' : ''
  const capo = tune.capo != null ? parseInt(tune.capo, 10) : 0
  const tags = Array.isArray(tune.tags) ? tune.tags.join(',') : ''

  const voices = ['V:1']
  for (let i = 0; i < noteLines.length; i++) {
    voices.push(noteLines[i])
    const wText = wLines[i]
    if (wText != null && String(wText).length > 0) {
      voices.push('w: ' + wText)
    } else {
      voices.push('w:')
    }
  }

  return [
    'X: ' + tuneNumber,
    'T: ' + ensureText(tune.name),
    'C:' + ensureText(tune.composer),
    books,
    'M:4/4',
    'L:1/4',
    'K:C',
    tempoLine.trim(),
    voices.join('\n'),
    '% abcbook-timing-scaffold true',
    '% abcbook-tags ' + tags,
    '% abcbook-capo ' + capo,
    '% abcbook-boost 0',
    '% abcbook-difficulty 0',
    '',
  ].filter(function(line) { return line !== '' }).join('\n')
}

function main() {
  const summaryPath = path.join(JSON_DIR, '_summary.json')
  if (!fs.existsSync(summaryPath)) {
    console.error('Summary not found:', summaryPath)
    console.error('Run scripts/importBrookeMarshalPdf.py first.')
    process.exit(1)
  }

  const tunes = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  const abcParts = tunes.map(function(tune, index) {
    return tuneToAbc(tune, index + 1)
  })

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, abcParts.join('\n'), 'utf8')
  console.log('Wrote', tunes.length, 'tunes to', OUT_FILE)
}

main()
