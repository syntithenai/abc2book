/**
 * Precompute notation-check issues for each EuroSession ABC candidate.
 *
 * Bundles the app check suite via esbuild, builds minimal tune snapshots from
 * ABC text, runs with skipRenderAbc: true, and writes notationIssues[] onto
 * each candidate (and selected tune) in manifest.json.
 *
 * Usage:
 *   node scripts/eurosession/run_notation_checks.cjs [--work DIR] [--limit N]
 *
 * --limit only restricts how many tunes are checked; the full manifest is kept.
 */

const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

const ENTRY = path.join(__dirname, '_notation_checks_entry.js')
const BUNDLE = path.join(__dirname, '_notation_checks_bundle.cjs')

function writeEntry() {
  const src = `
import { checkTuneAbcCorrectness } from '../../src/tuneAbcCorrectnessCheck.js'
import { checkTuneAbcStructure } from '../../src/tuneAbcStructureCheck.js'
import { checkTuneAbcExtended } from '../../src/tuneAbcExtendedCheck.js'
import { checkTuneCompleteness } from '../../src/tuneCompletenessCheck.js'
import { checkTuneLyricsAlignment } from '../../src/tuneLyricsAlignmentCheck.js'
import { getLyricLines } from '../../src/wLinesUtils.js'

function flattenIssues(result, source) {
  if (!result || !Array.isArray(result.issues)) return []
  return result.issues.map(function(item) {
    return Object.assign({}, item, { source: source })
  })
}

function flattenCompletenessIssues(result) {
  if (!result || !Array.isArray(result.issues)) return []
  return result.issues.map(function(item) {
    return Object.assign({}, item, {
      severity: item.severity || 'warning',
      source: 'completeness',
    })
  })
}

export function runNotationChecks(tune, options) {
  const opts = options || {}
  if (!tune || !tune.id) {
    return { issues: [], completenessIssues: [] }
  }
  const abcTools = opts.abcTools
  const abcText = opts.abcText || (abcTools ? abcTools.json2abc(tune) : '')
  const checkOpts = Object.assign({}, opts, {
    abcText: abcText,
    skipRenderAbc: opts.skipRenderAbc !== false,
  })

  const abcResult = checkTuneAbcCorrectness(tune, checkOpts)
  const structureResult = checkTuneAbcStructure(tune, checkOpts)
  const extendedResult = checkTuneAbcExtended(tune, checkOpts)
  const completenessResult = checkTuneCompleteness(tune, checkOpts)

  let lyricsResult = null
  try {
    const lyrics = getLyricLines(tune)
    if (lyrics && lyrics.some(function(l) { return String(l || '').trim() })) {
      lyricsResult = checkTuneLyricsAlignment(tune, checkOpts)
    }
  } catch (_) {}

  const issues = []
  issues.push.apply(issues, flattenIssues(abcResult, 'abc'))
  issues.push.apply(issues, flattenIssues(structureResult, 'structure'))
  issues.push.apply(issues, flattenIssues(lyricsResult, 'lyrics'))
  issues.push.apply(issues, flattenIssues(extendedResult, 'extended'))
  const completenessIssues = flattenCompletenessIssues(completenessResult)
  issues.push.apply(issues, completenessIssues)

  return { issues: issues, completenessIssues: completenessIssues }
}
`
  fs.writeFileSync(ENTRY, src, 'utf8')
}

async function buildBundle() {
  writeEntry()
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: BUNDLE,
    logLevel: 'warning',
    loader: { '.js': 'jsx' },
    external: [
      'react',
      'react-dom',
      'react-bootstrap',
      'react-router-dom',
      'react-toastify',
      'localforage',
      'axios',
      'jquery',
      'bootstrap',
    ],
    plugins: [
      {
        name: 'stub-browser-heavy',
        setup(build) {
          build.onResolve({ filter: /mediaCacheStorage(\.js)?$/ }, () => ({
            path: 'eurosession-stub-mediaCacheStorage',
            namespace: 'stub',
          }))
          build.onResolve({ filter: /useAbcSynth(\.js)?$/ }, () => ({
            path: 'eurosession-stub-useAbcSynth',
            namespace: 'stub',
          }))
          build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'module.exports = {};',
            loader: 'js',
          }))
        },
      },
    ],
  })
}

function minimalAbcTools() {
  return {
    json2abc: function(tune) {
      return (tune && tune._abcText) || ''
    },
    getMetaValueFromAbc: function(key, abc) {
      const lines = String(abc || '').split('\n')
      for (let i = 0; i < lines.length; i++) {
        const part = lines[i].trim()
        if (part.startsWith(key + ':')) return part.slice(2).trim()
      }
      return ''
    },
    justNotesNoMeta: function(text) {
      return String(text || '')
        .split('\n')
        .filter(function(line) {
          const t = line.trim()
          if (!t || t.startsWith('%')) return false
          if (/^[A-Za-z]:/.test(t)) return false
          return true
        })
        .join('\n')
    },
    normalizeMeter: function(v) { return String(v || '').trim() },
    cleanTempo: function(v) { return String(v || '').trim() },
  }
}

function parseHeader(abc, key) {
  const re = new RegExp('^' + key + ':\\s*(.+)$', 'm')
  const m = String(abc || '').match(re)
  return m ? m[1].trim() : ''
}

function bodyNoteLines(abc) {
  const lines = []
  String(abc || '').split('\n').forEach(function(line) {
    const t = line.trim()
    if (!t || t.startsWith('%')) return
    if (/^[A-Za-z]:/.test(t)) return
    lines.push(line)
  })
  return lines.length ? lines : ['']
}

function snapshotFromAbc(id, title, abc) {
  const text = String(abc || '')
  const key = parseHeader(text, 'K').replace(/\s*transpose\s*=\s*-?\d+/i, '').trim() || 'C'
  const meter = parseHeader(text, 'M') || '4/4'
  const noteLength = parseHeader(text, 'L') || '1/8'
  const tempo = parseHeader(text, 'Q') || ''
  return {
    id: id,
    name: title || 'Tune',
    key: key,
    meter: meter,
    noteLength: noteLength,
    tempo: tempo,
    _abcText: text,
    voices: {
      '1': { notes: bodyNoteLines(text) },
    },
  }
}

function compactIssue(item) {
  return {
    code: item.code || '',
    message: item.message || '',
    severity: item.severity || 'warning',
    source: item.source || '',
    field: item.field || null,
    barIndex: item.barIndex != null ? item.barIndex : null,
  }
}

function parseArgs(argv) {
  const out = { work: '/home/stever/Downloads/eurosession-work', limit: 0 }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--work' && argv[i + 1]) {
      out.work = argv[++i]
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      out.limit = parseInt(argv[++i], 10) || 0
    }
  }
  return out
}

async function main() {
  global.document = {
    createElementNS: function() {
      return { setAttribute: function() {}, appendChild: function() {}, style: {} }
    },
    createElement: function() {
      return { setAttribute: function() {}, appendChild: function() {}, style: {} }
    },
  }

  await buildBundle()
  delete require.cache[require.resolve(BUNDLE)]
  const { runNotationChecks } = require(BUNDLE)
  const abcTools = minimalAbcTools()
  const args = parseArgs(process.argv)
  const manifestPath = path.join(args.work, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const allTunes = manifest.tunes || []
  // --limit only restricts processing; never truncate the manifest on write-back.
  const processCount = args.limit > 0 ? Math.min(args.limit, allTunes.length) : allTunes.length

  let checked = 0
  let issueTotal = 0
  for (let i = 0; i < processCount; i++) {
    const entry = allTunes[i]
    const title = entry.title || ('Tune ' + (i + 1))
    const candidates = Array.isArray(entry.candidates) ? entry.candidates : []
    if (!candidates.length && entry.abc) {
      candidates.push({
        id: 'current',
        source: entry.abcSource || 'current',
        abc: entry.abc,
        matchedTitle: title,
      })
      entry.candidates = candidates
    }
    for (let j = 0; j < candidates.length; j++) {
      const cand = candidates[j]
      const abc = String(cand.abc || '')
      if (!abc || /%% missing abc/.test(abc)) {
        cand.notationIssues = [{
          code: 'missing_abc',
          message: 'No ABC for this candidate',
          severity: 'error',
          source: 'abc',
        }]
        continue
      }
      const snap = snapshotFromAbc(cand.id || ('c' + j), title, abc)
      let report
      try {
        report = runNotationChecks(snap, {
          abcTools: abcTools,
          abcText: abc,
          skipRenderAbc: true,
        })
      } catch (err) {
        cand.notationIssues = [{
          code: 'check_crash',
          message: String(err && err.message ? err.message : err),
          severity: 'error',
          source: 'abc',
        }]
        continue
      }
      const issues = (report.issues || []).map(compactIssue)
      const seen = new Set()
      cand.notationIssues = issues.filter(function(it) {
        const k = it.code + '\0' + it.message
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      checked += 1
      issueTotal += cand.notationIssues.length
    }
    const sel = candidates.find(function(c) {
      return c.id === entry.selectedCandidateId
    }) || candidates[0]
    entry.notationIssues = (sel && sel.notationIssues) || []
    if ((i + 1) % 10 === 0 || i === processCount - 1) {
      process.stdout.write(
        '  checked ' + (i + 1) + '/' + processCount +
          ' candidates-so-far=' + checked + ' issues=' + issueTotal + '\n'
      )
    }
  }

  manifest.tunes = allTunes
  manifest.notationChecksAt = new Date().toISOString()
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log('done: candidates_checked=' + checked + ' issues=' + issueTotal)

  try { fs.unlinkSync(ENTRY) } catch (_) {}
  try { fs.unlinkSync(BUNDLE) } catch (_) {}
}

main().catch(function(err) {
  console.error(err)
  process.exit(1)
})
