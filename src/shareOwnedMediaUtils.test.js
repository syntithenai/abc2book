import {
  collectOwnedMediaForShareScope,
  collectCollectionMediaForShareScope,
  uploadPendingOwnedMediaInScope,
  summarizeShareMediaWork,
  isTunebookPublicShared,
  publicizeDriveFiles,
  autoPublicizeMediaIfTunebookShared,
  resetTunebookPublicSharedCache,
  getTunebookPublicConfirmKey,
  audioPublicConfirmKey,
  filePublicConfirmKey,
} from './shareOwnedMediaUtils'
import { tuneIdsForPlaylist } from './shareTunebookUtils'

jest.mock('./linkRecording', function() {
  return {
    isOwnedMediaLink: jest.requireActual('./linkRecording').isOwnedMediaLink,
    getOwnedMediaSyncStatus: jest.requireActual('./linkRecording').getOwnedMediaSyncStatus,
    uploadOwnedMediaLinksForTune: jest.fn(),
  }
})

jest.mock('./musicCollectionShare', function() {
  return {
    uploadCollectionLinksForTune: jest.fn(),
  }
})

import { uploadOwnedMediaLinksForTune } from './linkRecording'
import { uploadCollectionLinksForTune } from './musicCollectionShare'

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
    uploadCollectionLinksForTune.mockReset()
    uploadCollectionLinksForTune.mockImplementation(async function(tune) {
      return { uploaded: 0, errors: [], tune: tune }
    })
    resetTunebookPublicSharedCache()
    localStorage.clear()
  })

  test('collectCollectionMediaForShareScope finds library links', function() {
    const withCollection = {
      t3: {
        id: 't3',
        name: 'Library tune',
        links: [
          { title: 'Track', link: 'https://resolver/music-collection/a.mp3' },
        ],
      },
    }
    const entries = collectCollectionMediaForShareScope(withCollection, {
      shareKind: 'tune',
      tuneId: 't3',
    })
    expect(entries.length).toBe(1)
    expect(entries[0].kind).toBe('collection')
  })

  test('summarizeShareMediaWork counts collection uploads', function() {
    const withCollection = {
      t3: {
        id: 't3',
        name: 'Library tune',
        links: [
          { title: 'Track', link: 'https://resolver/music-collection/a.mp3' },
        ],
      },
    }
    const summary = summarizeShareMediaWork(withCollection, {
      shareKind: 'tune',
      tuneId: 't3',
    })
    expect(summary.needsUpload).toBe(1)
    expect(summary.hasWork).toBe(true)
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

  test('summarizeShareMediaWork counts local uploads and public permissions', function() {
    const work = summarizeShareMediaWork(tunes, { shareKind: 'tune', tuneId: 't1' })
    expect(work.totalItems).toBe(2)
    expect(work.needsUpload).toBe(1)
    expect(work.needsPublic).toBe(1)
    expect(work.hasWork).toBe(true)
    expect(work.displayItems.length).toBe(2)
  })

  test('isTunebookPublicShared returns false without local consent', async function() {
    const driveApi = {
      listPermissions: jest.fn(),
    }
    expect(await isTunebookPublicShared(driveApi, 'doc1')).toBe(false)
    expect(driveApi.listPermissions).not.toHaveBeenCalled()
  })

  test('isTunebookPublicShared verifies anyone reader when consent is set', async function() {
    localStorage.setItem(getTunebookPublicConfirmKey(), 'true')
    const driveApi = {
      listPermissions: jest.fn().mockResolvedValue({
        data: { permissions: [{ type: 'anyone', role: 'reader' }] },
      }),
    }
    expect(await isTunebookPublicShared(driveApi, 'doc1')).toBe(true)
    expect(driveApi.listPermissions).toHaveBeenCalledWith('doc1')
  })

  test('publicizeDriveFiles skips already-public files and shares private ones', async function() {
    localStorage.setItem(audioPublicConfirmKey('gid-public'), 'true')
    const driveApi = {
      listPermissions: jest.fn().mockImplementation(function(id) {
        if (id === 'gid-live-public') {
          return Promise.resolve({
            data: { permissions: [{ type: 'anyone', role: 'reader' }] },
          })
        }
        return Promise.resolve({ data: { permissions: [] } })
      }),
      addPermission: jest.fn().mockResolvedValue({}),
    }

    const result = await publicizeDriveFiles(driveApi, [
      { googleId: 'gid-public', kind: 'audio', label: 'Already confirmed' },
      { googleId: 'gid-live-public', kind: 'audio', label: 'Already on Drive' },
      { googleId: 'gid-private', kind: 'audio', label: 'Needs share' },
    ], { autoConfirmPublic: true })

    expect(result.alreadyPublic).toBe(2)
    expect(result.shared).toBe(1)
    expect(driveApi.addPermission).toHaveBeenCalledTimes(1)
    expect(driveApi.addPermission).toHaveBeenCalledWith('gid-private', { type: 'anyone', role: 'reader' })
    expect(localStorage.getItem(audioPublicConfirmKey('gid-private'))).toBe('true')
  })

  test('autoPublicizeMediaIfTunebookShared no-ops when tunebook is private', async function() {
    const driveApi = {
      listPermissions: jest.fn(),
      addPermission: jest.fn(),
    }
    const result = await autoPublicizeMediaIfTunebookShared({
      driveApi: driveApi,
      googleDocumentId: 'doc1',
      items: [{ googleId: 'gid1', kind: 'audio', label: 'Audio' }],
    })
    expect(result.skipped).toBe(1)
    expect(result.shared).toBe(0)
    expect(driveApi.addPermission).not.toHaveBeenCalled()
  })

  test('autoPublicizeMediaIfTunebookShared publicizes when tunebook is shared', async function() {
    localStorage.setItem(getTunebookPublicConfirmKey(), 'true')
    const driveApi = {
      listPermissions: jest.fn().mockImplementation(function(id) {
        if (id === 'doc1') {
          return Promise.resolve({
            data: { permissions: [{ type: 'anyone', role: 'reader' }] },
          })
        }
        return Promise.resolve({ data: { permissions: [] } })
      }),
      addPermission: jest.fn().mockResolvedValue({}),
    }
    const result = await autoPublicizeMediaIfTunebookShared({
      driveApi: driveApi,
      googleDocumentId: 'doc1',
      items: [{ googleId: 'gid1', kind: 'file', label: 'Snapshot' }],
    })
    expect(result.shared).toBe(1)
    expect(localStorage.getItem(filePublicConfirmKey('gid1'))).toBe('true')
  })
})
