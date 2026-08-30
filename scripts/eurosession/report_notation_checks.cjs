/**
 * Report-only notation checks for eurosession-import-final.json.
 * Does not modify manifest.json or apply structure fixes.
 *
 * Usage:
 *   node scripts/eurosession/report_notation_checks.cjs \
 *     [--import PATH] [--out PATH]
 */
const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

const ROOT = path.join(__dirname, '../..')
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
  const out = {
    importPath: path.join(
      process.env.HOME || '',
      'Downloads/eurosession-work/eurosession-import-final.json'
    ),
    outPath: path.join(
      process.env.HOME || '',
      'Downloads/eurosession-work/notation_check_report.json'
    ),
  }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--import' && argv[i + 1]) out.importPath = argv[++i]
    else if (argv[i] === '--out' && argv[i + 1]) out.outPath = argv[++i]
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
  const pkg = JSON.parse(fs.readFileSync(args.importPath, 'utf8'))
  const tunes = pkg.tunes || []
  const byCode = {}
  const byTierCode = {}
  const tuneRows = []
  let issueTotal = 0

  for (let i = 0; i < tunes.length; i++) {
    const entry = tunes[i]
    const title = entry.title || ('Tune ' + (i + 1))
    const abc = String(entry.abc || '')
    const snap = snapshotFromAbc(entry.id || ('t' + i), title, abc)
    let issues = []
    try {
      const report = runNotationChecks(snap, {
        abcTools: abcTools,
        abcText: abc,
        skipRenderAbc: true,
      })
      const seen = new Set()
      issues = (report.issues || []).map(compactIssue).filter(function(it) {
        const k = it.code + '\0' + it.message
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    } catch (err) {
      issues = [{
        code: 'check_crash',
        message: String(err && err.message ? err.message : err),
        severity: 'error',
        source: 'abc',
        field: null,
        barIndex: null,
      }]
    }

    issueTotal += issues.length
    const tier = entry.joinTier || '?'
    const codesSeen = new Set()
    issues.forEach(function(it) {
      byCode[it.code] = byCode[it.code] || { count: 0, tunes: 0, severity: it.severity }
      byCode[it.code].count += 1
      const key = tier + '\0' + it.code
      byTierCode[key] = byTierCode[key] || {
        tier: tier,
        code: it.code,
        severity: it.severity,
        count: 0,
        tunes: new Set(),
      }
      byTierCode[key].count += 1
      byTierCode[key].tunes.add(title)
      codesSeen.add(it.code)
    })
    codesSeen.forEach(function(code) {
      byCode[code].tunes += 1
    })

    tuneRows.push({
      id: entry.id,
      title: title,
      page: entry.page,
      joinTier: tier,
      notationOnly: !!entry.notationOnly,
      issueCount: issues.length,
      issues: issues,
    })

    if ((i + 1) % 20 === 0 || i === tunes.length - 1) {
      process.stdout.write('  checked ' + (i + 1) + '/' + tunes.length + ' issues=' + issueTotal + '\n')
    }
  }

  const sevOrder = { error: 0, warning: 1, info: 2 }
  const report = {
    generatedAt: new Date().toISOString(),
    source: args.importPath,
    tuneCount: tunes.length,
    issueTotal: issueTotal,
    byCode: byCode,
    byTierCode: Object.keys(byTierCode).map(function(key) {
      const row = byTierCode[key]
      return {
        tier: row.tier,
        code: row.code,
        severity: row.severity,
        issueCount: row.count,
        tuneCount: row.tunes.size,
        sampleTitles: Array.from(row.tunes).slice(0, 8),
      }
    }).sort(function(a, b) {
      return (sevOrder[a.severity] != null ? sevOrder[a.severity] : 9)
        - (sevOrder[b.severity] != null ? sevOrder[b.severity] : 9)
        || b.tuneCount - a.tuneCount
    }),
    tunes: tuneRows,
  }

  fs.writeFileSync(args.outPath, JSON.stringify(report, null, 2), 'utf8')
  console.log('wrote ' + args.outPath)
  console.log('tunes=' + tunes.length + ' issues=' + issueTotal)
  Object.keys(byCode).sort(function(a, b) {
    return byCode[b].tunes - byCode[a].tunes
  }).forEach(function(code) {
    const row = byCode[code]
    console.log(row.severity + '\ttunes=' + row.tunes + '\tissues=' + row.count + '\t' + code)
  })

  try { fs.unlinkSync(ENTRY) } catch (_) {}
  try { fs.unlinkSync(BUNDLE) } catch (_) {}
}

main().catch(function(err) {
  console.error(err)
  process.exit(1)
})
