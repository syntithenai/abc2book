import {
  mergeById,
  mergeTombstones,
  applyTombstones,
  noteNeedsDriveUpload
} from './audioAnalysisCloudSync'

describe('audioAnalysisCloudSync merge', function() {
  test('prefers newer updatedAt', function() {
    const local = [{ id: 'a', label: 'local', updatedAt: '2026-01-02T00:00:00.000Z' }]
    const remote = [{ id: 'a', label: 'remote', updatedAt: '2026-01-01T00:00:00.000Z' }]
    const merged = mergeById(local, remote)
    expect(merged.length).toBe(1)
    expect(merged[0].label).toBe('local')
  })

  test('keeps items only on one side', function() {
    const merged = mergeById(
      [{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }],
      [{ id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' }]
    )
    expect(merged.map(function(x) { return x.id }).sort()).toEqual(['a', 'b'])
  })

  test('tombstones remove older live items', function() {
    const live = [
      { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', updatedAt: '2026-01-03T00:00:00.000Z' }
    ]
    const tombs = [{ id: 'a', deletedAt: '2026-01-02T00:00:00.000Z' }]
    const kept = applyTombstones(live, tombs)
    expect(kept.map(function(x) { return x.id })).toEqual(['b'])
  })

  test('newer live item beats older tombstone', function() {
    const live = [{ id: 'a', updatedAt: '2026-01-03T00:00:00.000Z' }]
    const tombs = [{ id: 'a', deletedAt: '2026-01-02T00:00:00.000Z' }]
    expect(applyTombstones(live, tombs).length).toBe(1)
  })

  test('mergeTombstones keeps latest delete', function() {
    const merged = mergeTombstones(
      [{ id: 'a', deletedAt: '2026-01-01T00:00:00.000Z', label: 'old' }],
      [{ id: 'a', deletedAt: '2026-01-02T00:00:00.000Z', label: 'new' }]
    )
    expect(merged[0].label).toBe('new')
  })
})

describe('noteNeedsDriveUpload', function() {
  test('false when already linked to Drive (avoids re-upload jam)', function() {
    expect(noteNeedsDriveUpload({
      audioBlobKey: 'blob-1',
      driveFileId: 'drive-abc'
    })).toBe(false)
  })

  test('true when local blob key has no driveFileId', function() {
    expect(noteNeedsDriveUpload({ audioBlobKey: 'blob-1' })).toBe(true)
  })

  test('false when note has no audio', function() {
    expect(noteNeedsDriveUpload({ driveFileId: 'x' })).toBe(false)
    expect(noteNeedsDriveUpload(null)).toBe(false)
  })
})
