import {
  describeSnapshotForCancel,
  describePendingMidiLinkForCancel,
  importReviewSnapshotEntries,
  isMidiPendingFile,
  pendingMidiLinkFromCandidate,
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

  test('pendingSnapshotsFromCandidate excludes MIDI pending files', function() {
    const blob = new Blob(['midi'], { type: 'audio/midi' })
    const list = pendingSnapshotsFromCandidate({
      pendingFile: {
        name: 'tune.mid',
        type: 'audio/midi',
        blob: blob,
      },
    })
    expect(list).toHaveLength(0)
    expect(pendingMidiLinkFromCandidate({
      pendingFile: {
        name: 'tune.mid',
        type: 'audio/midi',
        blob: blob,
      },
    })).toEqual({
      id: 'pending-midi-link',
      title: 'tune.mid',
      name: 'tune.mid',
      link: '',
      mediaKind: 'midi',
      pending: true,
    })
  })

  test('isMidiPendingFile detects midi by name and mime', function() {
    const blob = new Blob(['x'], { type: 'application/octet-stream' })
    expect(isMidiPendingFile({
      name: 'track.MIDI',
      type: 'application/octet-stream',
      blob: blob,
    })).toBe(true)
    expect(isMidiPendingFile({
      name: 'scan.pdf',
      type: 'application/pdf',
      blob: blob,
    })).toBe(false)
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

  test('describePendingMidiLinkForCancel labels pending midi', function() {
    expect(describePendingMidiLinkForCancel({
      title: 'tune.mid',
    })).toBe('tune.mid (MIDI link)')
  })
})
