#!/usr/bin/env node
/**
 * Fix repeat-before-pickup anacrusis in scrape ABC tunebooks.
 *
 * Pattern:  |:z2|"C"e3...   →  z2|:"C"e3...
 * Rest pickups after |: leave getPickupLength() at 0 and fill/chord grid drifts.
 *
 * Only rest pickups (z, z2, z4, …). Note pickups inside repeats (|:d2|, |:g2|) are
 * left alone — those are usually intentional repeat semantics.
 *
 * Usage: node scripts/fix_scrape_anacrusis_pickup.cjs [--dry-run] [files...]
 */

const fs = require('fs')
const path = require('path')
const abcjs = require('abcjs')

const SCRAPE_DIR = path.join(__dirname, '..', 'scrape')
const REST_PICKUP_AFTER_REPEAT = /\|:z(\d*)(?=\|)/g

const NOTE_BODY_RE = /[a-gA-G][0-9/]|\[[^\]]+\]|\([0-9]+:|"[A-Ga-g#b][^"]*"/

function defaultAbcFiles() {
  return fs.readdirSync(SCRAPE_DIR)
    .filter(function(name) {
      return name.endsWith('.abc') && !name.endsWith('.abc.bak')
    })
    .map(function(name) { return path.join(SCRAPE_DIR, name) })
}

function splitTunes(text) {
  const chunks = text.split(/(?=^X:\s)/m).filter(Boolean)
  const tunes = chunks.filter(function(chunk) { return /^X:/.test(chunk) })
  const headerLines = chunks.length > tunes.length ? chunks[0] : ''
  return { headerLines: headerLines, tunes: tunes }
}

function hasMelodyNotation(tuneText) {
  if (!/^X:/m.test(tuneText) || !/^K:/m.test(tuneText)) return false
  const ki = tuneText.search(/^K:/m)
  if (ki < 0) return false
  const body = tuneText.slice(ki)
  if (!body.trim()) return false
  return NOTE_BODY_RE.test(body)
}

function wrapTuneForParse(tuneText) {
  return tuneText.replace(/^X:\s*\d+/m, 'X:1')
}

function parseTune(tuneText) {
  return abcjs.parseOnly(wrapTuneForParse(tuneText))[0]
}

function fixRestPickupAfterRepeatInText(text) {
  if (!REST_PICKUP_AFTER_REPEAT.test(text)) {
    REST_PICKUP_AFTER_REPEAT.lastIndex = 0
    return null
  }
  REST_PICKUP_AFTER_REPEAT.lastIndex = 0
  const next = text.replace(REST_PICKUP_AFTER_REPEAT, function(_match, digits) {
    return 'z' + digits + '|:'
  })
  return next === text ? null : next
}

function stripTrailingComplementRest(text) {
  const lines = text.split(/\r?\n/)
  let lastMusic = -1
  lines.forEach(function(line, i) {
    if (/^%/.test(line)) return
    if (String(line || '').trim()) lastMusic = i
  })
  if (lastMusic < 0) return null

  const line = lines[lastMusic]
  const replaced = line.replace(/z(\d*)\|\|(?!\|)/, '||')
  if (replaced === line) return null
  lines[lastMusic] = replaced
  return lines.join('\n')
}

function fixTune(tuneText) {
  if (!hasMelodyNotation(tuneText)) return null
  if (!REST_PICKUP_AFTER_REPEAT.test(tuneText)) {
    REST_PICKUP_AFTER_REPEAT.lastIndex = 0
    return null
  }
  REST_PICKUP_AFTER_REPEAT.lastIndex = 0

  try {
    parseTune(tuneText)
  } catch (e) {
    return null
  }

  let next = fixRestPickupAfterRepeatInText(tuneText)
  if (!next) return null

  next = stripTrailingComplementRest(next) || next

  try {
    parseTune(next)
  } catch (e) {
    return null
  }

  return next
}

function processFile(filePath, dryRun) {
  let raw = fs.readFileSync(filePath, 'utf8')
  const parts = splitTunes(raw)
  const fixes = []
  let nextRaw = raw

  parts.tunes.forEach(function(tune) {
    const fixed = fixTune(tune)
    if (!fixed || fixed === tune) return
    const title = (tune.match(/^T:(.*)$/m) || [])[1] || ''
    const x = (tune.match(/^X:\s*(\S+)/m) || [])[1] || '?'
    fixes.push({ x: x, title: String(title).trim() })
    if (nextRaw.includes(tune)) {
      nextRaw = nextRaw.replace(tune, fixed)
    }
  })

  if (!fixes.length) return fixes

  if (!dryRun && nextRaw !== raw) {
    fs.writeFileSync(filePath, nextRaw, 'utf8')
  }

  return fixes
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const files = args.filter(function(a) { return !a.startsWith('--') })
  const targets = files.length ? files.map(function(f) { return path.resolve(f) }) : defaultAbcFiles()

  let totalFixes = 0
  targets.forEach(function(filePath) {
    if (!fs.existsSync(filePath)) {
      console.error('missing:', filePath)
      return
    }
    const fixes = processFile(filePath, dryRun)
    if (!fixes.length) return
    console.log(path.basename(filePath) + (dryRun ? ' (dry-run)' : '') + ':')
    fixes.forEach(function(row) {
      console.log('  X:' + row.x + ' ' + row.title)
    })
    totalFixes += fixes.length
  })

  console.log((dryRun ? 'would fix ' : 'fixed ') + totalFixes + ' tune(s) in ' + targets.length + ' file(s)')
}

main()
