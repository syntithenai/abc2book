import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import { auditCorpus, summarizeAuditReport } from './tuneBlockCorpusAudit'
import { lyricLinesForChecks } from './tuneDisplayLayers'

const { abc2Tunebook } = useAbcTools()

function formatMarkdown(summary, sourceFiles) {
  const lines = [
    '# Block Structure Corpus Audit',
    '',
    'Sources: ' + sourceFiles.join(', '),
    '',
    '| Metric | Value |',
    '|--------|-------|',
    '| Total tunes | ' + summary.totalTunes + ' |',
    '| Lyrics tunes | ' + summary.lyricsTunes + ' |',
    '| Skipped (instrumental) | ' + summary.skippedTunes + ' |',
    '| Pass | ' + summary.passCount + ' |',
    '| Fail | ' + summary.failCount + ' |',
    '| Pass rate | ' + (summary.passRate * 100).toFixed(1) + '% |',
    '',
    '## By pattern',
    '',
  ]

  Object.keys(summary.byPattern || {}).sort().forEach(function(pattern) {
    const stats = summary.byPattern[pattern]
    const rate = stats.total > 0 ? ((stats.pass / stats.total) * 100).toFixed(1) : '0.0'
    lines.push('- **' + pattern + '**: ' + stats.pass + '/' + stats.total + ' pass (' + rate + '%)')
  })

  lines.push('', '## Lyric blocks vs melody strains', '')
  Object.keys(summary.byStrainLyricBucket || {}).sort().forEach(function(bucket) {
    lines.push('- **' + bucket + '**: ' + summary.byStrainLyricBucket[bucket])
  })

  if (summary.strainLyricOutliers && summary.strainLyricOutliers.length) {
    lines.push('', '## Strain/lyric outliers (extreme ratios)', '')
    summary.strainLyricOutliers.forEach(function(item) {
      lines.push('- ' + item.tuneName + ': ' + item.blockCount + ' lyric blocks / '
        + item.strainCount + ' strains (' + item.bucket + ', ratio '
        + (item.ratio != null ? item.ratio.toFixed(1) : 'n/a') + ')')
    })
  }

  lines.push('', '## Issue counts', '')
  Object.keys(summary.issueCounts || {}).sort().forEach(function(code) {
    lines.push('- **' + code + '**: ' + summary.issueCounts[code])
  })

  return lines.join('\n')
}

describe('tuneBlockCorpus CLI', function() {
  test('writes audit report when BLOCK_AUDIT_FILES is set', function() {
    const filesEnv = process.env.BLOCK_AUDIT_FILES
    if (!filesEnv) return

    const files = filesEnv.split(/\s+/).filter(Boolean)
    const allTunes = []
    files.forEach(function(file) {
      const abc = fs.readFileSync(path.resolve(file), 'utf8')
      allTunes.push.apply(allTunes, abc2Tunebook(abc))
    })

    const report = auditCorpus(allTunes)
    const summary = summarizeAuditReport(report)
    const markdown = formatMarkdown(summary, files)

    if (process.env.BLOCK_AUDIT_REPORT) {
      const out = path.resolve(process.env.BLOCK_AUDIT_REPORT)
      fs.writeFileSync(out, JSON.stringify(summary, null, 2))
      fs.writeFileSync(out.replace(/\.json$/i, '') + '.md', markdown)
    }

    expect(summary.passRate).toBeGreaterThanOrEqual(0.95)
  })
})
