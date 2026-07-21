import {
  describeSnapshotForCancel,
  importReviewSnapshotEntries,
  pendingSnapshotsFromCandidate,
} from './importReviewSnapshots'

describe('importReviewSnapshots', function() {
  test('pendingSnapshotsFromCandidate reads pendingFile', function() {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    const list = pendingSnapshotsFromCandidate({
      pendingFile: {
        name: 'AJAA.PDF',
        type: 'application/pdf',
        blob: blob,
      },
    })
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('AJAA.PDF')
    expect(list[0].pending).toBe(true)
  })

  test('importReviewSnapshotEntries merges stored and pending files', function() {
    const entries = importReviewSnapshotEntries(
      [{ id: 'f1', name: 'saved.png', type: 'image/png' }],
      [{ id: 'pending', name: 'scan.pdf', type: 'application/pdf', pending: true }]
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe('saved.png')
    expect(entries[1].name).toBe('scan.pdf')
  })

  test('describeSnapshotForCancel labels pdf snapshots', function() {
    expect(describeSnapshotForCancel({
      name: 'AJAA.PDF',
      type: 'application/pdf',
    })).toBe('AJAA.PDF (PDF snapshot)')
  })
})
