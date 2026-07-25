import { formatBulkCheckIssueMessage } from './bulkCheckIssueMessages'
import { collectReportIssuesForFixes } from './tuneBulkCheckReport'

describe('bulkCheckIssueMessages', function() {
  test('shows issue message only', function() {
    const text = formatBulkCheckIssueMessage({
      code: 'missing_background',
      message: 'Background information is missing',
    })
    expect(text).toBe('Background information is missing')
  })

  test('shows repeat issue without inline hint', function() {
    const text = formatBulkCheckIssueMessage({
      code: 'unmatched_repeat_start',
      message: 'Repeat start |: has no matching end',
    })
    expect(text).toBe('Repeat start |: has no matching end')
  })
})

describe('collectReportIssuesForFixes optional gaps', function() {
  test('includes optional gaps for fix and display grouping', function() {
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: null,
      issues: [{ code: 'missing_tempo', message: 'Tempo is missing', severity: 'warning' }],
      optionalGaps: [{ code: 'missing_background', message: 'Background information is missing', severity: 'info' }],
    }
    const codes = collectReportIssuesForFixes(report).map(function(item) { return item.code })
    expect(codes).toContain('missing_tempo')
    expect(codes).toContain('missing_background')
  })
})
