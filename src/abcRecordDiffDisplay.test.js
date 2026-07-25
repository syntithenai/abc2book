import {
  buildAbcRecordDiffRows,
  buildPreviewDiffSummary,
  describeAbcLine,
  splitLineDiffHighlight,
} from './abcRecordDiffDisplay'

describe('abcRecordDiffDisplay', function() {
  test('describes ABC header lines', function() {
    expect(describeAbcLine('K:G').label).toBe('Key')
    expect(describeAbcLine('M:6/8').label).toBe('Time signature')
  })

  test('labels changed key rows clearly', function() {
    const rows = buildAbcRecordDiffRows('K:C\nC D |', 'K:G\nC D |')
    const keyRow = rows.find(function(row) { return row.label === 'Key' })
    expect(keyRow).toBeTruthy()
    expect(keyRow.type).toBe('changed')
    expect(keyRow.changeLabel).toBe('Changed')
  })

  test('summarizes mixed field and abc changes', function() {
    const rows = buildAbcRecordDiffRows('K:C\nC D |', 'K:G\nC2 D2 |')
    const summary = buildPreviewDiffSummary(
      [{ field: 'key', label: 'Key', before: 'C', after: 'G' }],
      rows
    )
    expect(summary).toContain('tune field')
    expect(summary).toContain('will change')
  })

  test('highlights only changed characters in a line', function() {
    const parts = splitLineDiffHighlight('|: C D |', '|: C2 D2 |')
    expect(parts.before.some(function(part) { return part.changed })).toBe(true)
    expect(parts.after.some(function(part) { return part.changed })).toBe(true)
    expect(parts.before[0].text).toBe('|: C')
  })
})
