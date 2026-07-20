#!/usr/bin/env node
/**
 * Convert the personal ChordPro archive under Documents into one multi-tune ABC
 * for in-app import.
 *
 * All sources → B: songs and % abcbook-tags chordpro (plus file metadata).
 * Original .pro archives are never modified.
 *
 * Usage:
 *   node scripts/import_chordpro_archives_to_abc.js \
 *     [--in /home/stever/Documents/chordpro] \
 *     [--out /home/stever/Documents/chordpro/abc] \
 *     [--name chordpro-songs.abc] \
 *     [--source spukes|lewe-george|lewe-olga|all] \
 *     [--limit N]
 */

'use strict'

const fs = require('fs')
const path = require('path')
const ChordSheetJS = require('chordsheetjs')
const { chordParserFactory, chordRendererFactory } = require('chord-symbol')
const {
  extractChordProDirectives,
  resolveChordProImportMeta,
  appendChordProMetaAbcHeaders,
  isBraceTempoDirective,
} = require('./lib/chordProMetaUtils.cjs')

const { ChordProParser, ChordsOverWordsParser } = ChordSheetJS
const parseChord = chordParserFactory()
const renderChord = chordRendererFactory({ useShortNamings: true })

const DEFAULT_IN = '/home/stever/Documents/chordpro'
const DEFAULT_OUT = '/home/stever/Documents/chordpro/abc'
const DEFAULT_NAME = 'chordpro-songs.abc'
const SONG_EXTS = new Set(['.pro', '.chopro', '.cho', '.crd', '.txt', '.chordpro', '.onsong'])
const IMPORT_BOOK = 'songs'
const IMPORT_TAG = 'chordpro'

const SOURCES = {
  spukes: {
    id: 'spukes',
    rel: 'spukes',
    book: IMPORT_BOOK,
  },
  'lewe-george': {
    id: 'lewe-george',
    rel: path.join('lewe', 'george'),
    book: IMPORT_BOOK,
  },
  'lewe-olga': {
    id: 'lewe-olga',
    rel: path.join('lewe', 'olga'),
    book: IMPORT_BOOK,
  },
}

function printHelp() {
  console.log(`Convert scraped ChordPro files to one multi-tune ABC for abc2book import.

Usage:
  node scripts/import_chordpro_archives_to_abc.js [options]

Options:
  --in DIR           Archive root (default: ${DEFAULT_IN})
  --out DIR          ABC output dir (default: ${DEFAULT_OUT})
  --name FILE        Output filename (default: ${DEFAULT_NAME})
  --source NAME      spukes | lewe-george | lewe-olga | all (default: all)
  --limit N          Convert at most N songs per source (smoke tests)
  -h, --help         Show this help

Assignment (all archive sources):
  B: ${IMPORT_BOOK}
  % abcbook-tags ${IMPORT_TAG} (+ © when {copyright:} present)

Metadata (from ChordPro file only, omitted when absent):
  composer/artist/lyricist/arranger, genre, key, tempo, capo,
  album/year, duration→lyrics scroll estimate, subtitle alias, comments

After conversion, import into the running app:
  1. Import → File → select ${DEFAULT_OUT}/${DEFAULT_NAME}
  2. Leave book empty (B: already set) → confirm the warning dialog
  3. Books → "songs"; tag filter → "chordpro"

Do not commit generated ABC into git (commercial songs). Prefer first-time
import; re-import uses content-hash dedupe.
`)
}

function parseArgs(argv) {
  const opts = {
    inDir: DEFAULT_IN,
    outDir: DEFAULT_OUT,
    outName: DEFAULT_NAME,
    source: 'all',
    limit: null,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      opts.help = true
    } else if (arg === '--in') {
      opts.inDir = path.resolve(argv[++i] || DEFAULT_IN)
    } else if (arg === '--out') {
      opts.outDir = path.resolve(argv[++i] || DEFAULT_OUT)
    } else if (arg === '--name') {
      opts.outName = String(argv[++i] || DEFAULT_NAME)
    } else if (arg === '--chunk-size') {
      // Legacy no-op: always one file now
      i += 1
    } else if (arg === '--source') {
      opts.source = String(argv[++i] || 'all')
    } else if (arg === '--limit') {
      opts.limit = Math.max(1, parseInt(argv[++i], 10) || 1)
    } else {
      throw new Error('Unknown argument: ' + arg)
    }
  }
  return opts
}

function tokenIsChord(token) {
  const cleaned = String(token || '')
    .replace(/[(),.:|]/g, '')
    .trim()
    .replace(/^([A-G])flat/i, '$1b')
    .replace(/^([A-G])sharp/i, '$1#')
  if (!cleaned) return false
  try {
    return renderChord(parseChord(cleaned)) !== null
  } catch (e) {
    return false
  }
}

function isSectionHeader(line) {
  const raw = String(line || '').trim()
  if (!raw) return false
  const bracket = raw.match(/^\[([^\]]+)\]$/)
  if (bracket) {
    if (tokenIsChord(bracket[1].trim())) return false
    return true
  }
  return /^(verse|chorus|bridge|intro|outro|pre-?chorus|refrain|coda|tag|instrumental|solo|interlude|hook)\b/i.test(
    raw.replace(/^#+\s*/, '')
  )
}

function normalizeOnSongText(text) {
  return String(text || '').replace(/\{\{([^}]+)\}\}/g, function(_m, inner) {
    return '{' + String(inner).trim() + '}'
  })
}

function detectFormat(text) {
  const sample = String(text || '').trim()
  if (/\{\{[^}]+\}\}/.test(sample)) return 'onsong'
  if (/\{[a-z_]+:/i.test(sample)) return 'chordpro'
  const hasInline = sample.split(/\r?\n/).some(function(raw) {
    const line = String(raw || '').trim()
    if (!line || isSectionHeader(line)) return false
    return /\[[A-G][#b]?[^\]]*\]/.test(line)
  })
  if (hasInline) return 'chordpro'
  return 'chords-over-words'
}

/** Preserve ChordPro body with [Am] markers; drop {title}/{key}/{zoom-ipad}/… keep {c:} as […]. */
function extractPreservedChordProLyricLines(text) {
  const normalized = normalizeOnSongText(text)
  const out = []
  String(normalized || '').split(/\r?\n/).forEach(function(raw) {
    const line = raw == null ? '' : String(raw)
    const trimmed = line.trim()
    if (!trimmed) {
      out.push('')
      return
    }
    const metaMatch = trimmed.match(/^\{([a-z][a-z0-9_-]*)\s*(?::\s*(.*))?\}$/i)
      || trimmed.match(/^\{([a-z][a-z0-9_-]*)\s+(.+)\}$/i)
    if (metaMatch) {
      const key = String(metaMatch[1] || '').toLowerCase()
      const value = String(metaMatch[2] != null ? metaMatch[2] : '').trim()
      if (key === 'c' || key === 'comment' || key === 'highlight') {
        out.push(value ? '[' + value + ']' : '')
      }
      return
    }
    if (isBraceTempoDirective(trimmed)) {
      return
    }
    if (/^\{[a-z][a-z0-9_-]*(\s*:|\s|$)/i.test(trimmed) && trimmed.indexOf('}') === -1) {
      return
    }
    out.push(line)
  })
  while (out.length && !String(out[0]).trim()) out.shift()
  while (out.length && !String(out[out.length - 1]).trim()) out.pop()
  return out
}

function sheetLinesToWizardChords(sheetLines) {
  const lines = []
  ;(Array.isArray(sheetLines) ? sheetLines : []).forEach(function(raw) {
    const line = String(raw || '')
    const trimmed = line.trim()
    if (!trimmed || isSectionHeader(trimmed)) return
    // Chord row: majority / all tokens look like chords
    const tokens = trimmed.split(/\s+/).filter(Boolean)
    if (!tokens.length) return
    let chordCount = 0
    tokens.forEach(function(t) {
      if (tokenIsChord(t.replace(/\|/g, ''))) chordCount += 1
    })
    if (chordCount === 0) return
    if (chordCount < tokens.length && chordCount * 2 <= tokens.length) return
    let text = trimmed
    if (!text.endsWith('|')) text += '|'
    lines.push(text)
  })
  return lines.join('\n')
}

function songToCowLines(song) {
  const formatter = new ChordSheetJS.ChordsOverWordsFormatter()
  const formatted = formatter.format(song)
  return formatted.split('\n').filter(function(line, index, arr) {
    if (index === arr.length - 1 && line.trim() === '') return false
    return true
  }).filter(function(line) {
    const trimmed = String(line || '').trim()
    if (/^(title|artist|subtitle|composer|key|capo|tempo|time)\s*:/i.test(trimmed)) return false
    return true
  })
}

function parseSheet(text, fallbackTitle) {
  const sourceText = String(text || '')
  if (!sourceText.trim()) {
    throw new Error('Chord sheet is empty')
  }
  const normalized = normalizeOnSongText(sourceText)
  const format = detectFormat(normalized)
  let lyricLines = []
  let chordText = ''
  let resolved

  if (format === 'chords-over-words') {
    const allLines = sourceText.split(/\r?\n/)
    const preamble = {
      title: '',
      composer: '',
      key: '',
      capo: '',
      tempo: '',
      meter: '',
      tuning: '',
    }
    const body = []
    allLines.forEach(function(raw) {
      const trimmed = String(raw || '').trim()
      if (!trimmed) {
        body.push(raw)
        return
      }
      let m
      if ((m = trimmed.match(/^(?:title|song)\s*:\s*(.+)$/i))) {
        if (!preamble.title) preamble.title = m[1].trim()
        return
      }
      if ((m = trimmed.match(/^(?:artist|by|author)\s*:\s*(.+)$/i))) {
        if (!preamble.composer) preamble.composer = m[1].trim()
        return
      }
      if ((m = trimmed.match(/^(?:key|tonality)\s*:\s*(.+)$/i))) {
        preamble.key = m[1].trim() || preamble.key
        return
      }
      if ((m = trimmed.match(/^capo(?:\s*:)?\s*(\d+)/i))) {
        preamble.capo = m[1]
        return
      }
      if ((m = trimmed.match(/^(?:tempo|bpm|q)\s*:\s*(.+)$/i))) {
        preamble.tempo = m[1].trim()
        return
      }
      if ((m = trimmed.match(/^(?:time|meter)\s*:\s*(.+)$/i))) {
        const val = m[1].trim()
        if (/^\d+\s*\/\s*\d+$/.test(val)) preamble.meter = val
        return
      }
      body.push(raw)
    })
    while (body.length && !String(body[0]).trim()) body.shift()
    lyricLines = body
    chordText = sheetLinesToWizardChords(body)
    resolved = resolveChordProImportMeta({
      preamble: preamble,
      fallbackTitle: fallbackTitle,
    })
  } else {
    let song
    try {
      song = new ChordProParser().parse(normalized)
    } catch (e) {
      song = new ChordsOverWordsParser().parse(normalized)
    }
    const cow = songToCowLines(song)
    chordText = sheetLinesToWizardChords(cow)
    lyricLines = extractPreservedChordProLyricLines(sourceText)
    if (!lyricLines.length) lyricLines = cow
    resolved = resolveChordProImportMeta({
      song: song,
      directives: extractChordProDirectives(normalized),
      fallbackTitle: fallbackTitle,
    })
  }

  if (!lyricLines.length && !String(chordText).trim()) {
    throw new Error('No lyrics or chords found')
  }

  const tags = Array.isArray(resolved.tags) ? resolved.tags.slice() : []
  if (tags.indexOf(IMPORT_TAG) === -1) tags.push(IMPORT_TAG)

  return {
    title: resolved.title || fallbackTitle || 'Untitled',
    composer: resolved.composer || '',
    artists: resolved.artists || [],
    aliases: resolved.aliases || [],
    genre: resolved.genre || '',
    discography: resolved.discography || '',
    tags: tags,
    backgroundInfo: resolved.backgroundInfo || '',
    lyricsScrollDurationSec: resolved.lyricsScrollDurationSec || 0,
    key: resolved.key || 'C',
    capo: resolved.capo || 0,
    tempo: resolved.tempo || 100,
    meter: resolved.meter || '4/4',
    lyricLines: lyricLines,
    chordText: chordText,
  }
}

function escapeAbcField(value) {
  return String(value == null ? '' : value).replace(/\r?\n/g, ' ').trim()
}

function escapeAbcChord(chord) {
  return String(chord || '').replace(/"/g, '').trim()
}

/**
 * Turn wizard chord grid lines ("Am  F | G |") into ABC rest scaffold bars.
 * L:1/8, 4/4 → 8 unit slots; distribute chords across z slots.
 */
function chordGridToAbcNotes(chordText, meter) {
  const m = String(meter || '4/4').match(/^(\d+)\s*\/\s*(\d+)/)
  const num = m ? parseInt(m[1], 10) : 4
  const den = m ? parseInt(m[2], 10) : 4
  // Match app scaffold: L:1/8 default for 4/4 → 8 slots; 6/8 → L:1/8 → 6 slots
  let unitSlots = 8
  let noteLength = '1/8'
  if (den === 8) {
    unitSlots = Math.max(1, num)
    noteLength = '1/8'
  } else if (den === 4) {
    unitSlots = Math.max(1, num * 2)
    noteLength = '1/8'
  } else {
    unitSlots = Math.max(1, num * 2)
  }

  const rawLines = String(chordText || '')
    .split(/\n/)
    .map(function(line) { return line.trim() })
    .filter(Boolean)

  const bars = []
  if (!rawLines.length) {
    bars.push('z' + unitSlots)
  } else {
    rawLines.forEach(function(line) {
      const withoutTrailing = line.replace(/\|+\s*$/, '').trim()
      const parts = withoutTrailing.split('|').map(function(p) { return p.trim() }).filter(Boolean)
      const segments = parts.length ? parts : [withoutTrailing]
      segments.forEach(function(seg) {
        const chords = seg.split(/\s+/).filter(Boolean).map(function(tok) {
          return tok.replace(/\|/g, '')
        }).filter(function(tok) {
          return tokenIsChord(tok) || /^[A-G]/.test(tok)
        })
        if (!chords.length) {
          bars.push('z' + unitSlots)
          return
        }
        const base = Math.floor(unitSlots / chords.length)
        let rem = unitSlots - base * chords.length
        const bits = []
        chords.forEach(function(chord) {
          const slots = base + (rem > 0 ? 1 : 0)
          if (rem > 0) rem -= 1
          bits.push('"' + escapeAbcChord(chord) + '"' + (slots <= 1 ? 'z' : ('z' + slots)))
        })
        bars.push(bits.join(' '))
      })
    })
  }

  // Group into one line, double-bar sections lightly with || every ~8 bars
  const noteLines = []
  let current = []
  bars.forEach(function(bar, index) {
    current.push(bar)
    const endSection = (index + 1) % 8 === 0 || index === bars.length - 1
    if (endSection) {
      const joined = current.join(' | ')
      const closer = index === bars.length - 1 ? ' |]' : ' ||'
      noteLines.push('|: ' + joined + closer)
      current = []
    }
  })
  if (!noteLines.length) {
    noteLines.push('|: z' + unitSlots + ' |]')
  }
  return { noteLines: noteLines, noteLength: noteLength, meter: num + '/' + den }
}

function draftToAbc(draft, book, xNumber) {
  const meter = draft.meter || '4/4'
  const built = chordGridToAbcNotes(draft.chordText, meter)
  const title = escapeAbcField(draft.title) || 'Untitled'
  const key = escapeAbcField(draft.key) || 'C'
  const tempo = parseInt(draft.tempo, 10) || 100

  const lines = []
  lines.push('X:' + xNumber)
  lines.push('T:' + title)
  appendChordProMetaAbcHeaders(lines, draft, { escape: escapeAbcField })
  lines.push('B:' + String(book || IMPORT_BOOK).toLowerCase())
  lines.push('M:' + built.meter)
  lines.push('L:' + built.noteLength)
  lines.push('Q:1/4=' + tempo)
  lines.push('K:' + key)
  lines.push('% abcbook-timing-scaffold true')
  built.noteLines.forEach(function(nl) { lines.push(nl) })

  const lyricLines = Array.isArray(draft.lyricLines) ? draft.lyricLines : []
  lyricLines.forEach(function(raw) {
    const line = raw == null ? '' : String(raw)
    lines.push('W: ' + line.replace(/\r/g, ''))
  })
  lines.push('')
  return lines.join('\n')
}

function walkSongFiles(rootDir) {
  const found = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      return
    }
    entries.forEach(function(ent) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full)
        return
      }
      if (!ent.isFile()) return
      const ext = path.extname(ent.name).toLowerCase()
      if (!SONG_EXTS.has(ext)) return
      found.push(full)
    })
  }
  walk(rootDir)
  found.sort(function(a, b) { return a.localeCompare(b) })
  return found
}

function titleFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath))
  return base.replace(/\s+/g, ' ').trim() || 'Untitled'
}

function appendLog(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8')
}

function writeSingleAbc(outPath, abcTunes) {
  if (!abcTunes.length) return { path: outPath, count: 0 }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, abcTunes.join('\n'), 'utf8')
  return { path: outPath, count: abcTunes.length }
}

function convertSource(sourceSpec, inRoot, limit, logPath, startX) {
  const srcDir = path.join(inRoot, sourceSpec.rel)
  if (!fs.existsSync(srcDir)) {
    console.warn('Missing source dir:', srcDir)
    return { ok: 0, failed: 0, abcTunes: [] }
  }
  let files = walkSongFiles(srcDir)
  if (limit != null) files = files.slice(0, limit)
  console.log(
    sourceSpec.id + ': ' + files.length + ' files → book "' + sourceSpec.book + '"'
  )

  const abcTunes = []
  let ok = 0
  let failed = 0
  files.forEach(function(filePath, index) {
    const rel = path.relative(inRoot, filePath)
    try {
      const text = fs.readFileSync(filePath, 'utf8')
      const draft = parseSheet(text, titleFromFilename(filePath))
      const abc = draftToAbc(draft, sourceSpec.book, startX + ok + 1)
      abcTunes.push(abc)
      ok += 1
      appendLog(logPath, {
        status: 'ok',
        source: sourceSpec.id,
        file: rel,
        title: draft.title,
        book: sourceSpec.book,
      })
    } catch (e) {
      failed += 1
      appendLog(logPath, {
        status: 'failed',
        source: sourceSpec.id,
        file: rel,
        error: e && e.message ? e.message : String(e),
      })
    }
    if ((index + 1) % 200 === 0 || index + 1 === files.length) {
      console.log(
        '  ' + sourceSpec.id + ' progress ' + (index + 1) + '/' + files.length
          + ' (ok=' + ok + ' failed=' + failed + ')'
      )
    }
  })

  return { ok: ok, failed: failed, abcTunes: abcTunes }
}

function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (e) {
    console.error(e.message)
    printHelp()
    process.exit(2)
  }
  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  const sourceKeys = opts.source === 'all'
    ? Object.keys(SOURCES)
    : [opts.source]
  sourceKeys.forEach(function(key) {
    if (!SOURCES[key]) {
      console.error('Unknown --source:', key)
      printHelp()
      process.exit(2)
    }
  })

  fs.mkdirSync(opts.outDir, { recursive: true })
  const logPath = path.join(opts.outDir, '_convert-log.jsonl')
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath)
  const outPath = path.join(opts.outDir, opts.outName)

  console.log('Input:  ' + opts.inDir)
  console.log('Output: ' + outPath)
  console.log('')
  console.log('Import help: after this finishes, open abc2book → Import → File,')
  console.log('select ' + outPath + ', leave book empty,')
  console.log('confirm the warning dialog. Book: songs; tag: chordpro.')
  console.log('')

  let totalOk = 0
  let totalFailed = 0
  const allAbc = []
  sourceKeys.forEach(function(key) {
    const result = convertSource(
      SOURCES[key],
      opts.inDir,
      opts.limit,
      logPath,
      totalOk
    )
    totalOk += result.ok
    totalFailed += result.failed
    result.abcTunes.forEach(function(abc) { allAbc.push(abc) })
  })

  const written = writeSingleAbc(outPath, allAbc)
  console.log('')
  console.log('Wrote ' + written.path + ' (' + written.count + ' tunes)')
  console.log('Done: ok=' + totalOk + ' failed=' + totalFailed)
  console.log('Log:  ' + logPath)
  if (totalFailed && !totalOk) process.exit(1)
  if (totalFailed) process.exit(1)
}

main(process.argv)
