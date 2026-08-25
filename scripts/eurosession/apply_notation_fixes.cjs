/**
 * Apply safe structure autofixes from the app notation-check suite to EuroSession
 * ABC candidates — same actions as the Fix buttons on the check page (tier-a /
 * non-destructive only). Never keeps a fix that changes existing note pitches.
 *
 * Usage:
 *   node scripts/eurosession/apply_notation_fixes.cjs [--work DIR] [--limit N]
 *
 * Then re-run run_notation_checks.cjs and make_abc_review_html.py.
 */

const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

const ENTRY = path.join(__dirname, '_notation_fixes_entry.js')
const BUNDLE = path.join(__dirname, '_notation_fixes_bundle.cjs')

/** Tier-a / structural fixes that do not rewrite existing note pitches or durations. */
const SAFE_ACTIONS = [
  'sessionLineBreaks',
  'appendFinalBarline',
  'normalizeRepeatMarks',
  'fixStrainRepeatEnds',
  'closeOpenRepeat',
  'closeRepeatAtEnd',
  'removeOrphanRepeatEnd',
  'removeEmptyBars',
  'collapseAnacrusisDoubleBarlines',
  'padBarWithRests',
  'convertScaffoldToRests',
  'stanzaDoubleBarlines',
  'padVoicesToMatch',
  'fixHeaders',
]

const MAX_PASSES = 6

function writeEntry() {
  const src = `
import {
  applyStructureFix,
  structureFixAvailable,
  previewStructureFix,
  STRUCTURE_FIX_ACTIONS,
} from '../../src/tuneAbcStructureFix.js'
import { checkTuneAbcCorrectness } from '../../src/tuneAbcCorrectnessCheck.js'
import { checkTuneAbcStructure } from '../../src/tuneAbcStructureCheck.js'
import { checkTuneAbcExtended } from '../../src/tuneAbcExtendedCheck.js'
import { checkTuneCompleteness } from '../../src/tuneCompletenessCheck.js'
import { checkTuneLyricsAlignment } from '../../src/tuneLyricsAlignmentCheck.js'
import { getLyricLines } from '../../src/wLinesUtils.js'
import { convertSessionLineBreaks } from '../../src/abcImportNormalize.js'

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
  if (!tune || !tune.id) return { issues: [] }
  const abcTools = opts.abcTools
  const abcText = opts.abcText || (abcTools ? abcTools.json2abc(tune) : '')
  const checkOpts = Object.assign({}, opts, {
    abcText: abcText,
    skipRenderAbc: opts.skipRenderAbc !== false,
  })
  const issues = []
  issues.push.apply(issues, flattenIssues(checkTuneAbcCorrectness(tune, checkOpts), 'abc'))
  issues.push.apply(issues, flattenIssues(checkTuneAbcStructure(tune, checkOpts), 'structure'))
  try {
    const lyrics = getLyricLines(tune)
    if (lyrics && lyrics.some(function(l) { return String(l || '').trim() })) {
      issues.push.apply(issues, flattenIssues(checkTuneLyricsAlignment(tune, checkOpts), 'lyrics'))
    }
  } catch (_) {}
  issues.push.apply(issues, flattenIssues(checkTuneAbcExtended(tune, checkOpts), 'extended'))
  issues.push.apply(issues, flattenCompletenessIssues(checkTuneCompleteness(tune, checkOpts)))
  return { issues: issues }
}

export {
  applyStructureFix,
  structureFixAvailable,
  previewStructureFix,
  STRUCTURE_FIX_ACTIONS,
  convertSessionLineBreaks,
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

function isMusicBodyLine(line) {
  const t = String(line || '').trim()
  if (!t || t.startsWith('%')) return false
  if (/^[A-Za-z]:/.test(t)) return false
  return true
}

function splitAbcHeadersAndBody(abc) {
  const lines = String(abc || '').split('\n')
  const headers = []
  let i = 0
  for (; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) {
      if (headers.length) continue
      continue
    }
    if (/^[A-Za-z]:/.test(t) || t.startsWith('%')) {
      headers.push(lines[i])
      continue
    }
    break
  }
  while (i < lines.length && !String(lines[i] || '').trim()) i++
  return { headers: headers, bodyLines: lines.slice(i) }
}

function parseHeader(abc, key) {
  const re = new RegExp('^' + key + ':\\s*(.+)$', 'm')
  const m = String(abc || '').match(re)
  return m ? m[1].trim() : ''
}

function bodyNoteLines(abc) {
  const lines = []
  String(abc || '').split('\n').forEach(function(line) {
    if (!isMusicBodyLine(line)) return
    lines.push(line)
  })
  return lines.length ? lines : ['']
}

function justNotesNoMeta(text) {
  return String(text || '')
    .split('\n')
    .filter(isMusicBodyLine)
    .join('\n')
}

/** Pitch letters only — ignores rests, chords, barlines, durations. */
function notePitchSignature(abc) {
  const body = justNotesNoMeta(abc).replace(/"[^"]*"/g, '')
  const pitches = []
  const re = /(?:\^{1,2}|_{1,2}|=)?[A-Ga-g][,']*/g
  let m
  while ((m = re.exec(body))) pitches.push(m[0])
  return pitches.join(' ')
}

function snapshotFromAbc(id, title, abc) {
  const text = String(abc || '')
  const key = parseHeader(text, 'K').replace(/\s*transpose\s*=\s*-?\d+/i, '').trim() || 'C'
  const meter = parseHeader(text, 'M') || '4/4'
  const noteLength = parseHeader(text, 'L') || '1/8'
  const tempo = parseHeader(text, 'Q') || ''
  const parts = splitAbcHeadersAndBody(text)
  return {
    id: id,
    name: title || 'Tune',
    key: key,
    meter: meter,
    noteLength: noteLength,
    tempo: tempo,
    _abcText: text,
    _headerLines: parts.headers,
    voices: {
      '1': { notes: bodyNoteLines(text) },
    },
  }
}

function abcFromTune(tune) {
  const headers = Array.isArray(tune._headerLines) && tune._headerLines.length
    ? tune._headerLines.slice()
    : []
  // Keep meta fields in sync with tune object when present.
  function setHeader(letter, value) {
    if (!value) return
    const idx = headers.findIndex(function(line) {
      return String(line || '').trim().startsWith(letter + ':')
    })
    const next = letter + ':' + value
    if (idx >= 0) headers[idx] = next
    else {
      // Insert before first % comment after K if possible, else append.
      const kIdx = headers.findIndex(function(line) {
        return String(line || '').trim().startsWith('K:')
      })
      if (kIdx >= 0 && letter !== 'K') headers.splice(kIdx, 0, next)
      else headers.push(next)
    }
  }
  if (tune.meter) setHeader('M', String(tune.meter).trim())
  if (tune.key) setHeader('K', String(tune.key).replace(/\s*transpose\s*=\s*-?\d+/i, '').trim())
  if (tune.noteLength) setHeader('L', String(tune.noteLength).trim())
  if (tune.tempo) setHeader('Q', String(tune.tempo).trim())

  const notes = (tune.voices && tune.voices['1'] && Array.isArray(tune.voices['1'].notes))
    ? tune.voices['1'].notes
    : bodyNoteLines(tune._abcText || '')
  const body = notes.filter(function(line) {
    return String(line || '').trim().length > 0
  })
  return (headers.concat(body).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n')
}

function makeAbcTools() {
  return {
    json2abc: function(tune) {
      return abcFromTune(tune)
    },
    abc2json: function(abc) {
      const snap = snapshotFromAbc('tmp', 'tmp', abc)
      return {
        id: snap.id,
        name: snap.name,
        key: snap.key,
        meter: snap.meter,
        noteLength: snap.noteLength,
        tempo: snap.tempo,
        voices: snap.voices,
      }
    },
    getMetaValueFromAbc: function(key, abc) {
      return parseHeader(abc, key)
    },
    justNotesNoMeta: justNotesNoMeta,
    normalizeMeter: function(v) { return String(v || '').trim() },
    cleanTempo: function(v) { return String(v || '').trim() },
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

function chordCount(abc) {
  return (String(abc || '').match(/"\s*[A-G][#b]?/gi) || []).length
}

function parseArgs(argv) {
  const out = { work: '/home/stever/Downloads/eurosession-work', limit: 0 }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--work' && argv[i + 1]) out.work = argv[++i]
    else if (argv[i] === '--limit' && argv[i + 1]) out.limit = parseInt(argv[++i], 10) || 0
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
  const api = require(BUNDLE)
  const {
    applyStructureFix,
    structureFixAvailable,
    previewStructureFix,
    runNotationChecks,
  } = api

  const abcTools = makeAbcTools()
  const args = parseArgs(process.argv)
  const manifestPath = path.join(args.work, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const allTunes = manifest.tunes || []
  const processCount = args.limit > 0 ? Math.min(args.limit, allTunes.length) : allTunes.length

  const actionCounts = {}
  let candidatesFixed = 0
  let totalApplies = 0

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

    let anyFixed = false
    for (let j = 0; j < candidates.length; j++) {
      const cand = candidates[j]
      let abc = String(cand.abc || '')
      if (!abc || /%% missing abc/.test(abc)) continue

      let tune = snapshotFromAbc(cand.id || ('c' + j), title, abc)
      let appliedHere = []

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const report = runNotationChecks(tune, {
          abcTools: abcTools,
          abcText: abcFromTune(tune),
          skipRenderAbc: true,
        })
        const issues = report.issues || []
        let changedThisPass = false

        for (let a = 0; a < SAFE_ACTIONS.length; a++) {
          const actionId = SAFE_ACTIONS[a]
          if (!structureFixAvailable(actionId, tune, abcTools, issues)) continue
          const beforeAbc = abcFromTune(tune)
          const beforeSig = notePitchSignature(beforeAbc)
          let next
          try {
            next = applyStructureFix(actionId, tune, abcTools, null)
          } catch (err) {
            continue
          }
          if (!next) continue
          // Preserve our header bookkeeping.
          next._headerLines = tune._headerLines
          next._abcText = beforeAbc
          if (!next.id) next.id = tune.id
          const afterAbc = abcFromTune(next)
          if (afterAbc.trim() === beforeAbc.trim()) continue
          const afterSig = notePitchSignature(afterAbc)
          if (beforeSig !== afterSig) {
            // Pitch content changed — skip (destructive).
            continue
          }
          tune = next
          tune._abcText = afterAbc
          appliedHere.push(actionId)
          actionCounts[actionId] = (actionCounts[actionId] || 0) + 1
          totalApplies += 1
          changedThisPass = true
        }
        if (!changedThisPass) break
      }

      if (appliedHere.length) {
        const fixedAbc = abcFromTune(tune)
        cand.abc = fixedAbc
        cand.chords = chordCount(fixedAbc)
        cand.hasChords = cand.chords >= 3
        cand.structureFixesApplied = appliedHere.slice()
        anyFixed = true
        candidatesFixed += 1
      }

      // Refresh issues after fixes (or for unchanged).
      const finalTune = snapshotFromAbc(cand.id || ('c' + j), title, cand.abc)
      try {
        const report = runNotationChecks(finalTune, {
          abcTools: abcTools,
          abcText: cand.abc,
          skipRenderAbc: true,
        })
        const seen = new Set()
        cand.notationIssues = (report.issues || []).map(compactIssue).filter(function(it) {
          const k = it.code + '\0' + it.message
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
      } catch (err) {
        cand.notationIssues = [{
          code: 'check_crash',
          message: String(err && err.message ? err.message : err),
          severity: 'error',
          source: 'abc',
        }]
      }
    }

    if (anyFixed) {
      const sel = candidates.find(function(c) {
        return c.id === entry.selectedCandidateId
      }) || candidates[0]
      if (sel && sel.abc) {
        entry.abc = sel.abc
        entry.abcSource = sel.source || entry.abcSource
      }
    }
    const selIssues = candidates.find(function(c) {
      return c.id === entry.selectedCandidateId
    }) || candidates[0]
    entry.notationIssues = (selIssues && selIssues.notationIssues) || []

    if ((i + 1) % 10 === 0 || i === processCount - 1) {
      process.stdout.write(
        '  fixed-through ' + (i + 1) + '/' + processCount +
          ' candidates_changed=' + candidatesFixed +
          ' applies=' + totalApplies + '\n'
      )
    }
  }

  // Rebuild eurosession.abc from selected ABC
  const blocks = []
  for (let i = 0; i < allTunes.length; i++) {
    const row = allTunes[i]
    const title = row.title || ('Tune ' + (i + 1))
    let abc = String(row.abc || '').trim()
    if (!abc || /%% missing abc/.test(abc)) {
      abc = 'X:' + (i + 1) + '\nT:' + title + '\nM:4/4\nL:1/8\nK:C\n%% missing abc — needs manual entry\n'
    } else if (!/^X:/m.test(abc)) {
      abc = 'X:' + (i + 1) + '\n' + abc
    } else {
      abc = abc.replace(/^X:\s*\S*/m, 'X:' + (i + 1))
    }
    row.abc = abc
    const comment =
      '% page=' + row.page + ' tune=' + row.tuneIndex +
      ' source=' + (row.abcSource || '') + ' match=' + (row.lookupMatch || '')
    blocks.push(comment + '\n' + abc.trim())
  }
  fs.writeFileSync(path.join(args.work, 'eurosession.abc'), blocks.join('\n\n') + '\n', 'utf8')

  manifest.tunes = allTunes
  manifest.structureFixesAt = new Date().toISOString()
  manifest.structureFixStats = {
    candidatesFixed: candidatesFixed,
    totalApplies: totalApplies,
    actionCounts: actionCounts,
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log('done: candidates_fixed=' + candidatesFixed + ' applies=' + totalApplies)
  console.log('actions:', JSON.stringify(actionCounts))

  try { fs.unlinkSync(ENTRY) } catch (_) {}
  try { fs.unlinkSync(BUNDLE) } catch (_) {}
}

main().catch(function(err) {
  console.error(err)
  process.exit(1)
})
