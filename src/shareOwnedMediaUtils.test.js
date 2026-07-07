import {
  collectOwnedMediaForShareScope,
  uploadPendingOwnedMediaInScope,
} from './shareOwnedMediaUtils'
import { tuneIdsForPlaylist } from './shareTunebookUtils'

jest.mock('./linkRecording', function() {
  return {
    isOwnedMediaLink: jest.requireActual('./linkRecording').isOwnedMediaLink,
    getOwnedMediaSyncStatus: jest.requireActual('./linkRecording').getOwnedMediaSyncStatus,
    uploadOwnedMediaLinksForTune: jest.fn(),
  }
})

import { uploadOwnedMediaLinksForTune } from './linkRecording'

describe('shareOwnedMediaUtils', function() {
  const tunes = {
    t1: {
      id: 't1',
      name: 'Tune One',
      links: [
        { title: 'YouTube', link: 'https://youtube.com/watch?v=abc' },
        { title: 'My recording', link: 'abcbook-recording:rec1', recordingId: 'rec1', googleId: 'gid1' },
        { title: 'Local only', link: 'abcbook-recording:rec2', recordingId: 'rec2' },
      ],
    },
    t2: {
      id: 't2',
      name: 'Tune Two',
      links: [
        { title: 'Another', link: 'abcbook-recording:rec3', recordingId: 'rec3', googleId: 'gid3' },
      ],
    },
  }

  beforeEach(function() {
    uploadOwnedMediaLinksForTune.mockReset()
    uploadOwnedMediaLinksForTune.mockImplementation(async function(tune) {
      return { uploaded: 0, errors: [], tune: tune }
    })
  })

  test('collectOwnedMediaForShareScope on tune includes all owned links', function() {
    const entries = collectOwnedMediaForShareScope(tunes, {
      shareKind: 'tune',
      tuneId: 't1',
    })
    expect(entries.length).toBe(2)
    expect(entries.some(function(e) { return e.googleId === 'gid1' })).toBe(true)
    expect(entries.some(function(e) { return e.status === 'local' })).toBe(true)
  })

  test('collectOwnedMediaForShareScope on playlist respects linkIndex', function() {
    const playlists = {
      pl1: {
        id: 'pl1',
        name: 'Queue',
        items: [
          { tuneId: 't1', linkIndex: 1 },
          { tuneId: 't2' },
        ],
      },
    }
    const entries = collectOwnedMediaForShareScope(tunes, {
      shareKind: 'playlist',
      playlistId: 'pl1',
      playlists: playlists,
    })
    expect(entries.length).toBe(2)
    expect(entries.filter(function(e) { return e.tuneId === 't1' }).length).toBe(1)
    expect(entries.find(function(e) { return e.tuneId === 't1' }).linkIndex).toBe(1)
  })

  test('uploadPendingOwnedMediaInScope uploads only scoped playlist links', async function() {
    const playlists = {
      pl1: {
        id: 'pl1',
        name: 'Queue',
        items: [
          { tuneId: 't1', linkIndex: 2 },
        ],
      },
    }
    uploadOwnedMediaLinksForTune.mockResolvedValue({
      uploaded: 1,
      errors: [],
      tune: Object.assign({}, tunes.t1, {
        links: tunes.t1.links.map(function(link, index) {
          if (index !== 2) return link
          return Object.assign({}, link, { googleId: 'gid-new', uploadPending: false })
        }),
      }),
    })

    const result = await uploadPendingOwnedMediaInScope(tunes, {
      shareKind: 'playlist',
      playlistId: 'pl1',
      playlists: playlists,
    }, {
      token: 'token',
      driveApi: {},
    })

    expect(uploadOwnedMediaLinksForTune).toHaveBeenCalledTimes(1)
    expect(uploadOwnedMediaLinksForTune.mock.calls[0][1].linkIndices).toEqual([2])
    expect(result.uploaded).toBe(1)
  })

  test('tuneIdsForPlaylist from shareTunebookUtils', function() {
    expect(tuneIdsForPlaylist({
      items: [{ tuneId: 'a' }, { tuneId: 'b' }, { tuneId: 'a' }],
    })).toEqual(['a', 'b'])
  })
})
