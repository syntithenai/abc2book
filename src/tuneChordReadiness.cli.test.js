import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  auditTunesChordReadiness,
  applyChordReadinessFixes,
  applyChordReadinessTags,
  classifyChordReadiness,
  formatChordReadinessCsv,
  formatChordReadinessMarkdown,
  parseTunebookExportJson,
} from './tuneChordReadinessAudit'

const { abc2Tunebook } = useAbcTools()

function loadTunesFromInput(inputPath) {
  const resolved = path.resolve(inputPath)
  const text = fs.readFileSync(resolved, 'utf8')
  if (/\.abc$/i.test(resolved)) {
    return abc2Tunebook(text)
  }
  return parseTunebookExportJson(text)
}

describe('tuneChordReadiness CLI', function() {
  test('writes chord readiness report when CHORD_READINESS_INPUT is set', function() {
    const inputEnv = process.env.CHORD_READINESS_INPUT
    if (!inputEnv) return

    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const tunes = loadTunesFromInput(inputEnv)
    const book = process.env.CHORD_READINESS_BOOK || 'songs'
    const deps = {
      abcTools: abcTools,
      abcjsParser: abcjsParser,
      hasChords: function(abcText) {
        return abcjsParser.hasChords ? abcjsParser.hasChords(abcText) : /"[^"]+"/.test(abcText)
      },
      renderChords: function(abcText, dots) {
        return abcjsParser.renderChords(abcText, dots)
      },
      book: book,
    }

    const report = auditTunesChordReadiness(tunes, deps)
    const markdown = formatChordReadinessMarkdown(report, inputEnv)
    const csv = formatChordReadinessCsv(report)

    if (process.env.CHORD_READINESS_REPORT) {
      const out = path.resolve(process.env.CHORD_READINESS_REPORT)
      fs.writeFileSync(out, JSON.stringify(report, null, 2))
      fs.writeFileSync(out.replace(/\.json$/i, '') + '.md', markdown)
      fs.writeFileSync(out.replace(/\.json$/i, '') + '.csv', csv)
    }

    if (process.env.CHORD_READINESS_APPLY === '1') {
      const fixedPath = process.env.CHORD_READINESS_FIXED
        || path.join(path.dirname(path.resolve(inputEnv)), 'tunes-fixed.json')
      const fixed = tunes.map(function(tune) {
        const classification = classifyChordReadiness(tune, deps)
        if (classification.status === 'skipped' || classification.status === 'instrumental') {
          return tune
        }
        const fixResult = applyChordReadinessFixes(tune, classification, Object.assign({}, deps, {
          dryRun: false,
        }))
        return applyChordReadinessTags(fixResult.tune, classifyChordReadiness(fixResult.tune, deps))
      })
      fs.writeFileSync(path.resolve(fixedPath), JSON.stringify(fixed, null, 2))
    }

    expect(report.summary.totalTunes).toBeGreaterThanOrEqual(0)
  })
})
