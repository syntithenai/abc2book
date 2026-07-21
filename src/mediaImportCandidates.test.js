import {
  normalizeMediaIdentityKey,
  mediaImportMergeTargetId,
  resolveMediaFileIdentity,
} from './mediaImportCandidates'
import { coalesceImportCandidates } from './importReviewCandidateUtils'

jest.mock('./linkRecording', function() {
  return {
    createAttachedAudioLink: jest.fn(),
    createAttachedVideoLink: jest.fn(),
  }
})

import { createAttachedAudioLink } from './linkRecording'
import { buildMediaFileImportCandidate } from './mediaImportCandidates'

describe('mediaImportCandidates', function() {
  beforeEach(function() {
    createAttachedAudioLink.mockReset()
    createAttachedAudioLink.mockResolvedValue({
      link: {
        title: 'Song',
        link: 'abcbook-recording:rec1',
        recordingId: 'rec1',
      },
    })
  })

  test('normalizeMediaIdentityKey lowercases and trims title and artist', function() {
    expect(normalizeMediaIdentityKey('  Hello World ', '  The Band ')).toBe('hello world\0the band')
  })

  test('mediaImportMergeTargetId encodes title and artist', function() {
    const id = mediaImportMergeTargetId('My Song', 'Artist')
    expect(id).toMatch(/^media-import:/)
    expect(id).toContain(encodeURIComponent('my song\0artist'))
  })

  test('resolveMediaFileIdentity falls back to filename artist/title', async function() {
    const file = { name: 'Performer - Track Name.mp3', type: 'audio/mpeg' }
    const identity = await resolveMediaFileIdentity(file, null)
    expect(identity.title).toBe('Track Name')
    expect(identity.artist).toBe('Performer')
  })

  test('buildMediaFileImportCandidate creates owned link and merge key', async function() {
    const file = { name: 'Artist - Title.mp3', type: 'audio/mpeg' }
    const candidate = await buildMediaFileImportCandidate(file, { uploadToDrive: false })
    expect(candidate.tune.links.length).toBe(1)
    expect(candidate.tune.mediaCacheLocked).toBe(true)
    expect(candidate.mergeTargetId).toBe(mediaImportMergeTargetId('Title', 'Artist'))
    expect(createAttachedAudioLink).toHaveBeenCalled()
  })

  test('coalesceImportCandidates merges links for same title/artist imports', function() {
    const first = {
      id: 'a',
      sourceKind: 'audio',
      mergeTargetId: mediaImportMergeTargetId('Same Song', 'Same Artist'),
      tune: {
        name: 'Same Song',
        composer: 'Same Artist',
        links: [{ title: 'Take 1', link: 'abcbook-recording:r1', recordingId: 'r1' }],
      },
    }
    const second = {
      id: 'b',
      sourceKind: 'audio',
      mergeTargetId: mediaImportMergeTargetId('Same Song', 'Same Artist'),
      tune: {
        name: 'Same Song',
        composer: 'Same Artist',
        links: [{ title: 'Take 2', link: 'abcbook-recording:r2', recordingId: 'r2' }],
      },
    }
    const merged = coalesceImportCandidates(first, [second])
    expect(merged.tune.links.length).toBe(2)
    expect(merged.tune.name).toBe('Same Song')
  })
})
