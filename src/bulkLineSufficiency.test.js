import {
  assessBulkTextSufficiency,
  bulkImportDisabledReason,
  filterImportableBulkText,
  formatReportLabelList,
  getBulkTextLineSelectionRange,
  scrollBulkTextareaToLine,
  focusBulkTextareaLine,
  isBulkRowSufficient,
  rowReportLabel,
} from './bulkLineSufficiency'

describe('bulkLineSufficiency', function() {
  test('requires title plus artist or link', function() {
    expect(isBulkRowSufficient({ title: 'A', artist: '', link: '' })).toBe(false)
    expect(isBulkRowSufficient({ title: 'A', artist: 'B', link: '' })).toBe(true)
    expect(isBulkRowSufficient({ title: 'A', artist: '', link: 'https://youtu.be/x' })).toBe(true)
    expect(isBulkRowSufficient({ title: '', artist: 'B', link: 'https://youtu.be/x' })).toBe(false)
  })

  test('assessBulkTextSufficiency reports row stats', function() {
    const assessment = assessBulkTextSufficiency(
      'Only Title\nSong by Artist\nLinked | https://youtu.be/abc'
    )
    expect(assessment.rowCount).toBe(3)
    expect(assessment.missingArtistCount).toBe(2)
    expect(assessment.missingTitleCount).toBe(0)
    expect(assessment.unimportableCount).toBe(1)
    expect(assessment.importableCount).toBe(2)
    expect(assessment.sufficient).toBe(false)
    expect(assessment.insufficient).toHaveLength(1)
    expect(assessment.insufficient[0].title).toBe('Only Title')
    expect(bulkImportDisabledReason(assessment)).toBe('')
    expect(assessment.missingLinkCount).toBe(2)
    expect(assessment.missingLinkLabels).toEqual(['Only Title', 'Song'])
    expect(assessment.missingArtistLabels).toEqual(['Only Title', 'Linked'])
    expect(assessment.unimportableLabels).toEqual(['Only Title'])
  })

  test('assessBulkTextSufficiency accepts complete list', function() {
    const assessment = assessBulkTextSufficiency(
      'Song by Artist\nOther | https://youtu.be/abc'
    )
    expect(assessment.sufficient).toBe(true)
    expect(assessment.unimportableCount).toBe(0)
    expect(assessment.importableCount).toBe(2)
    expect(bulkImportDisabledReason(assessment)).toBe('')
  })

  test('rowReportLabel falls back to link or line number', function() {
    expect(rowReportLabel({ title: '', artist: 'A', link: 'https://youtu.be/abc123' }, 3))
      .toBe('youtu.be/abc123')
    expect(rowReportLabel({ title: '', artist: '', link: '' }, 5)).toBe('Line 5')
  })

  test('formatReportLabelList joins labels', function() {
    expect(formatReportLabelList(['A', 'B', 'C'])).toBe('A, B, C')
    expect(formatReportLabelList([
      { label: 'A', lineIndex: 0 },
      { label: 'B', lineIndex: 2 },
    ])).toBe('A, B')
  })

  test('getBulkTextLineSelectionRange selects a line', function() {
    const text = 'Only Title\nSong by Artist\nLinked | https://youtu.be/abc'
    expect(getBulkTextLineSelectionRange(text, 1)).toEqual({
      start: 11,
      end: 25,
      lineIndex: 1,
      lineCount: 3,
    })
    expect(getBulkTextLineSelectionRange(text, 99)).toBeNull()
  })

  test('scrollBulkTextareaToLine sets scrollTop from line index', function() {
    const textarea = {
      value: 'a\nb\nc\nd\ne',
      clientHeight: 60,
      scrollHeight: 100,
      scrollTop: 0,
    }
    scrollBulkTextareaToLine(textarea, 3, 5)
    expect(textarea.scrollTop).toBeGreaterThan(0)
    expect(textarea.scrollTop).toBeLessThanOrEqual(40)
  })

  test('assessBulkTextSufficiency entries include textarea line indexes', function() {
    const assessment = assessBulkTextSufficiency(
      'Only Title\n\nSong by Artist\nLinked | https://youtu.be/abc'
    )
    expect(assessment.missingArtistEntries[0].lineIndex).toBe(0)
    expect(assessment.missingArtistEntries[0].label).toBe('Only Title')
    expect(assessment.missingLinkEntries[0].lineIndex).toBe(0)
    expect(assessment.missingLinkEntries[1].lineIndex).toBe(2)
  })

  test('filterImportableBulkText drops unimportable lines', function() {
    const filtered = filterImportableBulkText(
      'Only Title\nSong by Artist\nLinked | https://youtu.be/abc'
    )
    expect(filtered.skipped).toBe(1)
    expect(filtered.text).toBe('Song by Artist\nLinked | https://youtu.be/abc')
  })

  test('bulkImportDisabledReason when nothing importable', function() {
    const assessment = assessBulkTextSufficiency('Only Title\nAlso Missing')
    expect(assessment.importableCount).toBe(0)
    expect(bulkImportDisabledReason(assessment)).toMatch(/cannot be imported/)
  })
})
