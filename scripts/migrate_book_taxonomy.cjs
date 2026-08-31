#!/usr/bin/env node
/**
 * Migrate scrape/*.abc book membership to the consolidated taxonomy.
 *
 * - Rewrites B: / % abcbook-tags / bookPages per tune
 * - Merges duplicate tune_ids across source files (union labels)
 * - Emits one ABC file per publishable book under scrape/
 * - Backs up prior scrape/*.abc into scrape/.taxonomy-backup-<timestamp>/
 *
 * Usage:
 *   node scripts/migrate_book_taxonomy.cjs           # dry-run + audit
 *   node scripts/migrate_book_taxonomy.cjs --apply   # write files if audit passes
 */

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const ROOT = path.join(__dirname, '..')
const SCRAPE_DIR = path.join(ROOT, 'scrape')

const SOURCE_FILES = [
  'tunes.abc',
  'songs.abc',
  'traditional songs.abc',
  'christmas songs.abc',
  'kids songs.abc',
  'australiabushtraditions.abc',
  'canberra pickers and fiddlers.abc',
  'jims roots.abc',
  'oldtimefiddletunes.abc',
  'millinerkoken.abc',
  'brooke-marshal.abc',
  'craigandsimone.abc',
]

function splitTunes(text) {
  const chunks = String(text || '').split(/(?=^X:)/m).filter(Boolean)
  const tunes = chunks.filter(function(chunk) { return /^X:/m.test(chunk) })
  const preamble = chunks.length > tunes.length && !/^X:/m.test(chunks[0]) ? chunks[0] : ''
  return { preamble: preamble, tunes: tunes }
}

function extractTuneId(text) {
  const m = String(text || '').match(/^%\s*abcbook-tune_id\s+(\S+)/m)
  return m ? m[1].trim() : null
}

function extractTitle(text) {
  const m = String(text || '').match(/^T:(.*)$/m)
  return m ? m[1].trim() : ''
}

function extractBooks(text) {
  const books = []
  String(text || '').split(/\r?\n/).forEach(function(line) {
    const m = line.match(/^B:\s*(.+)\s*$/)
    if (m) books.push(m[1].trim().toLowerCase())
  })
  return books
}

function extractTags(text) {
  const m = String(text || '').match(/^%\s*abcbook-tags\s+(.+)$/m)
  if (!m) return []
  return m[1].split(',').map(function(t) { return t.trim().toLowerCase() }).filter(Boolean)
}

function extractBookPages(text) {
  const chunks = []
  const re = /^%\s*abcbook-json\s+bookPages\s+(\d+)\/(\d+)\s+(.+)$/gm
  let match
  while ((match = re.exec(String(text || ''))) !== null) {
    chunks.push(match[3])
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(chunks.join(''))
  } catch (e) {
    return {}
  }
}

function unique(list) {
  const out = []
  const seen = {}
  ;(list || []).forEach(function(v) {
    const key = String(v || '').trim().toLowerCase()
    if (!key || seen[key]) return
    seen[key] = true
    out.push(key)
  })
  return out
}

function rewriteAbcHeaders(abcText, books, tags, bookPages) {
  const lines = String(abcText || '').split(/\r?\n/)
  const out = []
  let insertedMeta = false

  function flushMeta() {
    if (insertedMeta) return
    insertedMeta = true
    books.forEach(function(book) {
      out.push('B: ' + book)
    })
    if (tags.length) {
      out.push('% abcbook-tags ' + tags.join(','))
    }
    const pageJson = JSON.stringify(bookPages || {})
    if (pageJson && pageJson !== '{}') {
      out.push('% abcbook-json bookPages 1/1 ' + pageJson)
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^B:\s*/.test(line)) continue
    if (/^%\s*abcbook-tags\s+/.test(line)) continue
    if (/^%\s*abcbook-json\s+bookPages\s+/.test(line)) continue
    if (!insertedMeta && /^K:/i.test(line)) flushMeta()
    out.push(line)
  }
  if (!insertedMeta) flushMeta()
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

function fallbackId(text, source, index) {
  const title = extractTitle(text).toLowerCase().replace(/\s+/g, '-')
  return 'fallback:' + source + ':' + index + ':' + title.slice(0, 40)
}

async function loadTaxonomy() {
  const taxonomyUrl = pathToFileURL(path.join(ROOT, 'src', 'bookTaxonomy.js')).href
  const migrateUrl = pathToFileURL(path.join(ROOT, 'src', 'bookTaxonomyMigrate.js')).href
  const taxonomy = await import(taxonomyUrl)
  const migrate = await import(migrateUrl)
  return { taxonomy: taxonomy, migrate: migrate }
}

async function main() {
  const apply = process.argv.indexOf('--apply') !== -1
  const { taxonomy, migrate } = await loadTaxonomy()
  const {
    PUBLISHABLE_BOOKS,
    BOOK_SCRAPE_FILES,
  } = taxonomy
  const {
    migrateTuneMembership,
    inventoryFromTunes,
    auditInventories,
  } = migrate

  const byId = {}
  const sourceStats = {}

  SOURCE_FILES.forEach(function(name) {
    const full = path.join(SCRAPE_DIR, name)
    if (!fs.existsSync(full)) {
      sourceStats[name] = { missing: true }
      return
    }
    const text = fs.readFileSync(full, 'utf8')
    const split = splitTunes(text)
    sourceStats[name] = { tunes: split.tunes.length }
    split.tunes.forEach(function(chunk, index) {
      const id = extractTuneId(chunk) || fallbackId(chunk, name, index)
      const books = extractBooks(chunk)
      const tags = extractTags(chunk)
      const bookPages = extractBookPages(chunk)
      if (!byId[id]) {
        byId[id] = {
          id: id,
          name: extractTitle(chunk),
          books: books.slice(),
          tags: tags.slice(),
          bookPages: Object.assign({}, bookPages),
          abc: chunk,
          sources: [name],
        }
      } else {
        const cur = byId[id]
        cur.books = unique(cur.books.concat(books))
        cur.tags = unique(cur.tags.concat(tags))
        cur.bookPages = Object.assign({}, bookPages, cur.bookPages)
        cur.sources.push(name)
        // Prefer longer ABC body when merging duplicates.
        if (chunk.length > String(cur.abc || '').length) {
          cur.abc = chunk
          cur.name = extractTitle(chunk) || cur.name
        }
      }
    })
  })

  const preTunes = {}
  Object.keys(byId).forEach(function(id) {
    preTunes[id] = {
      id: id,
      name: byId[id].name,
      books: byId[id].books,
      tags: byId[id].tags,
      bookPages: byId[id].bookPages,
    }
  })
  const preInv = inventoryFromTunes(preTunes)

  const postTunes = {}
  const outputs = {}
  PUBLISHABLE_BOOKS.forEach(function(book) {
    outputs[book] = []
  })

  let changed = 0
  Object.keys(byId).forEach(function(id) {
    const row = byId[id]
    const migrated = migrateTuneMembership(row)
    if (JSON.stringify(unique(row.books)) !== JSON.stringify(migrated.books)
      || JSON.stringify(unique(row.tags)) !== JSON.stringify(migrated.tags)) {
      changed += 1
    }
    postTunes[id] = {
      id: id,
      name: row.name,
      books: migrated.books,
      tags: migrated.tags,
      bookPages: migrated.bookPages,
    }
    const abc = rewriteAbcHeaders(row.abc, migrated.books, migrated.tags, migrated.bookPages)
    migrated.books.forEach(function(book) {
      if (!outputs[book]) return
      outputs[book].push(abc.trim() + '\n')
    })
  })

  const postInv = inventoryFromTunes(postTunes)
  const audit = auditInventories(preInv, postInv)

  const counts = {}
  Object.keys(outputs).forEach(function(book) {
    counts[book] = outputs[book].length
  })

  console.log('Sources:', JSON.stringify(sourceStats, null, 2))
  console.log('Unique tunes:', Object.keys(byId).length)
  console.log('Changed membership:', changed)
  console.log('Output counts:', JSON.stringify(counts, null, 2))
  console.log('Audit ok:', audit.ok)
  if (audit.notes.length) console.log('Audit notes:', audit.notes.join('; '))
  if (!audit.ok) {
    console.log('missingIds sample:', audit.missingIds.slice(0, 10))
    console.log('lostBooks sample:', audit.lostBooks.slice(0, 10))
    console.log('lostTags sample:', audit.lostTags.slice(0, 10))
    console.log('lostPageKeys sample:', audit.lostPageKeys.slice(0, 10))
  }

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to write scrape files.')
    process.exit(audit.ok ? 0 : 1)
  }
  if (!audit.ok) {
    console.error('Refusing to apply: audit failed.')
    process.exit(1)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(SCRAPE_DIR, '.taxonomy-backup-' + stamp)
  fs.mkdirSync(backupDir, { recursive: true })
  SOURCE_FILES.forEach(function(name) {
    const full = path.join(SCRAPE_DIR, name)
    if (fs.existsSync(full)) {
      fs.copyFileSync(full, path.join(backupDir, name))
    }
  })
  console.log('Backup:', backupDir)

  Object.keys(outputs).forEach(function(book) {
    const fileName = BOOK_SCRAPE_FILES[book]
    if (!fileName) return
    const header = '%abc-2.1\n% abcbook-book ' + book + '\n\n'
    const body = outputs[book].join('\n')
    fs.writeFileSync(path.join(SCRAPE_DIR, fileName), header + body, 'utf8')
    console.log('Wrote', fileName, '(' + outputs[book].length + ' tunes)')
  })

  console.log('Done.')
}

main().catch(function(err) {
  console.error(err)
  process.exit(1)
})
