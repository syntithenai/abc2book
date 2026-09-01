import {
  parseDriveFilesListResponse,
  pickBestTuneBookFile,
  SONGBOOK_DOC_ID_STORAGE_KEY,
  readStoredSongbookDocId,
  writeStoredSongbookDocId,
  clearStoredSongbookDocId,
} from './driveSongbookLookup'

describe('driveSongbookLookup', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('parseDriveFilesListResponse rejects HTTP errors', function() {
    var parsed = parseDriveFilesListResponse({ error: { message: 'Forbidden' } }, 403)
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/Forbidden/)
    expect(parsed.files).toEqual([])
  })

  test('parseDriveFilesListResponse rejects error body on HTTP 200', function() {
    var parsed = parseDriveFilesListResponse({ error: { message: 'Invalid' } }, 200)
    expect(parsed.ok).toBe(false)
    expect(parsed.files).toEqual([])
  })

  test('parseDriveFilesListResponse accepts empty file list', function() {
    var parsed = parseDriveFilesListResponse({ files: [] }, 200)
    expect(parsed.ok).toBe(true)
    expect(parsed.files).toEqual([])
  })

  test('pickBestTuneBookFile prefers larger songbook over empty stub', function() {
    var best = pickBestTuneBookFile([
      { id: 'empty', name: 'ABC Tune Book', size: '120', modifiedTime: '2026-09-01T12:00:00.000Z' },
      { id: 'full', name: 'ABC Tune Book', size: '4500000', modifiedTime: '2026-08-01T12:00:00.000Z' },
      { id: 'other', name: 'Something Else', size: '99999999' },
    ], 'ABC Tune Book')
    expect(best.id).toBe('full')
  })

  test('pickBestTuneBookFile prefers a file with known size over unknown size', function() {
    var best = pickBestTuneBookFile([
      { id: 'native', name: 'ABC Tune Book', modifiedTime: '2026-09-01T12:00:00.000Z' },
      { id: 'binary', name: 'ABC Tune Book', size: '8000', modifiedTime: '2026-08-01T12:00:00.000Z' },
    ], 'ABC Tune Book')
    expect(best.id).toBe('binary')
  })

  test('pickBestTuneBookFile uses modifiedTime when sizes tie', function() {
    var best = pickBestTuneBookFile([
      { id: 'older', name: 'ABC Tune Book', size: '100', modifiedTime: '2025-01-01T00:00:00.000Z' },
      { id: 'newer', name: 'ABC Tune Book', size: '100', modifiedTime: '2026-01-01T00:00:00.000Z' },
    ], 'ABC Tune Book')
    expect(best.id).toBe('newer')
  })

  test('stored songbook doc id round-trips', function() {
    expect(readStoredSongbookDocId()).toBe('')
    writeStoredSongbookDocId('doc123')
    expect(localStorage.getItem(SONGBOOK_DOC_ID_STORAGE_KEY)).toBe('doc123')
    expect(readStoredSongbookDocId()).toBe('doc123')
    clearStoredSongbookDocId()
    expect(readStoredSongbookDocId()).toBe('')
  })
})
