import {
  assessBulkTextSufficiency,
  bulkImportDisabledReason,
  insufficientBulkLineDetails,
  isBulkRowSufficient,
} from './bulkLineSufficiency'

describe('bulkLineSufficiency', function() {
  test('requires title plus artist or link', function() {
    expect(isBulkRowSufficient({ title: 'A', artist: '', link: '' })).toBe(false)
    expect(isBulkRowSufficient({ title: 'A', artist: 'B', link: '' })).toBe(true)
    expect(isBulkRowSufficient({ title: 'A', artist: '', link: 'https://youtu.be/x' })).toBe(true)
    expect(isBulkRowSufficient({ title: '', artist: 'B', link: 'https://youtu.be/x' })).toBe(false)
  })

  test('assessBulkTextSufficiency reports insufficient lines with details', function() {
    const assessment = assessBulkTextSufficiency(
      'Only Title\nSong by Artist\nLinked | https://youtu.be/abc'
    )
    expect(assessment.rowCount).toBe(3)
    expect(assessment.sufficient).toBe(false)
    expect(assessment.insufficient).toHaveLength(1)
    expect(assessment.insufficient[0].title).toBe('Only Title')
    expect(assessment.insufficient[0].detail).toMatch(/Line 1/)
    expect(assessment.insufficient[0].detail).toMatch(/artist or YouTube link/)
    expect(bulkImportDisabledReason(assessment)).toMatch(/Prepare/)
    expect(insufficientBulkLineDetails(assessment)[0]).toMatch(/Only Title/)
  })

  test('assessBulkTextSufficiency accepts complete list', function() {
    const assessment = assessBulkTextSufficiency(
      'Song by Artist\nOther | https://youtu.be/abc'
    )
    expect(assessment.sufficient).toBe(true)
    expect(bulkImportDisabledReason(assessment)).toBe('')
    expect(insufficientBulkLineDetails(assessment)).toEqual([])
  })
})
