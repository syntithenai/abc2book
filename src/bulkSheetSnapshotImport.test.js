jest.mock('./importSourceParse', function() {
  return {
    isSheetImageImportFile: function(file) {
      const name = String(file && file.name || '').toLowerCase()
      const type = String(file && file.type || '').toLowerCase()
      return type === 'application/pdf' || /\.(pdf|png|jpe?g|webp|gif)$/i.test(name)
    },
  }
})

jest.mock('./sheetImageMetadataClient', function() {
  return {
    extractSheetMetadataFile: jest.fn(),
    probeSheetMetadataEndpoint: jest.fn().mockResolvedValue({ ok: true, reason: '' }),
  }
})

import { isBulkSheetSnapshotFileList, summarizeSheetSnapshotCandidates } from './bulkSheetSnapshotImport'

describe('bulkSheetSnapshotImport', function() {
  test('isBulkSheetSnapshotFileList accepts only sheet image files', function() {
    expect(isBulkSheetSnapshotFileList([
      { name: 'a.pdf', type: 'application/pdf' },
      { name: 'b.png', type: 'image/png' },
    ])).toBe(true)
    expect(isBulkSheetSnapshotFileList([
      { name: 'a.pdf', type: 'application/pdf' },
      { name: 'b.abc', type: 'text/plain' },
    ])).toBe(false)
  })

  test('summarizeSheetSnapshotCandidates counts title sources', function() {
    expect(summarizeSheetSnapshotCandidates([
      { sheetSnapshotMeta: { titleSource: 'ocr' } },
      { sheetSnapshotMeta: { titleSource: 'cloud-ocr' } },
      { sheetSnapshotMeta: { titleSource: 'filename' } },
    ])).toEqual({
      total: 3,
      ocr: 2,
      cloudOcr: 1,
      pdfText: 0,
      filename: 1,
    })
  })
})
