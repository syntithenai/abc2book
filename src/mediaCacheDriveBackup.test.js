const stores = {}

jest.mock('localforage', function() {
  return {
    createInstance: function(opts) {
      const name = (opts && opts.storeName) || 'default'
      if (!stores[name]) stores[name] = {}
      const data = stores[name]
      return {
        setItem: function(key, value) {
          data[key] = value
          return Promise.resolve(value)
        },
        getItem: function(key) {
          return Promise.resolve(data[key] != null ? data[key] : null)
        },
        removeItem: function(key) {
          delete data[key]
          return Promise.resolve()
        },
      }
    },
  }
})

jest.mock('react-toastify', function() {
  return { toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }
})

jest.mock('./externalMediaAudioCache', function() {
  if (!global.__driveBackupCacheStore) global.__driveBackupCacheStore = {}
  const cacheStore = global.__driveBackupCacheStore
  return {
    getCachedExternalMediaBlob: function(key) {
      return Promise.resolve(cacheStore[key] || null)
    },
    putExternalMediaCache: function(key, blob, duration, audioFormat) {
      cacheStore[key] = { blob: blob, duration: duration, audioFormat: audioFormat }
      return Promise.resolve()
    },
    iterateExternalMediaCache: function(iterator) {
      const keys = Object.keys(cacheStore)
      let chain = Promise.resolve()
      keys.forEach(function(key) {
        chain = chain.then(function() { return iterator(cacheStore[key], key) })
      })
      return chain
    },
  }
})

jest.mock('./linkRecording', function() {
  return {
    isOwnedMediaLinkUri: jest.fn(function(uri) {
      return String(uri || '').indexOf('abcbook-recording:') === 0
    }),
    parseRecordingIdFromLinkUri: jest.fn(function(uri) {
      const s = String(uri || '')
      if (s.indexOf('abcbook-recording:') === 0) return s.slice('abcbook-recording:'.length)
      return null
    }),
    getRecording: jest.fn(function(id) {
      if (id === 'owned') return Promise.resolve({ id: 'owned' })
      return Promise.resolve(null)
    }),
  }
})

import { saveMediaCacheDriveBackupSettings } from './mediaCacheDriveBackupSettings'
import {
  isEligibleCachedMediaBackupParsed,
  isEligibleCachedMediaBackupKey,
  collectRemovedLinkCacheSrcs,
  findIndexItem,
  normalizeCachedMediaIndex,
  registerCachedMediaDriveBackupContext,
  syncOutstandingCachedMediaBackup,
  tryRestoreCachedMediaFromThisAccount,
  enqueueCachedMediaDriveDeletesForTuneIds,
  enqueueCachedMediaDriveDeletesForSrcs,
  enqueueCachedMediaDriveUpload,
  __resetCachedMediaDriveBackupForTests,
  getCachedMediaBackupId,
  getMediaCacheDriveBackupStatus,
} from './mediaCacheDriveBackup'
import { parseExternalMediaCacheKey } from './mediaCacheStorage'
import { enqueueCachedMediaDriveDeletes, flushCachedMediaDriveDeletes, clearCachedMediaDriveDeleteQueue } from './mediaCacheDriveDeletes'

describe('mediaCacheDriveBackup', function() {
  beforeEach(async function() {
    global.__driveBackupCacheStore = global.__driveBackupCacheStore || {}
    Object.keys(global.__driveBackupCacheStore).forEach(function(key) {
      delete global.__driveBackupCacheStore[key]
    })
    Object.keys(stores).forEach(function(name) {
      Object.keys(stores[name]).forEach(function(key) { delete stores[name][key] })
    })
    localStorage.clear()
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: false })
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    }
    await __resetCachedMediaDriveBackupForTests()
    await clearCachedMediaDriveDeleteQueue()
    registerCachedMediaDriveBackupContext({})
  })

  test('eligibility skips youtube, midi, standalone, and this-account owned recordings', async function() {
    expect(isEligibleCachedMediaBackupParsed(parseExternalMediaCacheKey(
      'extmedia:t1:0:https://archive.org/download/a.mp3'
    ))).toBe(true)
    expect(isEligibleCachedMediaBackupParsed(parseExternalMediaCacheKey(
      'extmedia:t1:0:https://www.youtube.com/watch?v=abcdefghijk'
    ))).toBe(false)
    expect(isEligibleCachedMediaBackupParsed(parseExternalMediaCacheKey(
      'extmedia:t1:0:https://example.com/song.mid'
    ))).toBe(false)
    expect(isEligibleCachedMediaBackupParsed(parseExternalMediaCacheKey(
      'extmedia:src:https://archive.org/download/a.mp3'
    ))).toBe(false)

    expect(await isEligibleCachedMediaBackupKey('extmedia:t1:0:abcbook-recording:owned', {
      getRecording: function(id) {
        return Promise.resolve(id === 'owned' ? { id: id } : null)
      },
    })).toBe(false)
    expect(await isEligibleCachedMediaBackupKey('extmedia:t1:0:abcbook-recording:shared', {
      getRecording: function() { return Promise.resolve(null) },
    })).toBe(true)
  })

  test('collectRemovedLinkCacheSrcs diffs by URI', function() {
    expect(collectRemovedLinkCacheSrcs(
      [{ link: 'https://a.example/x.mp3' }, { link: 'https://b.example/y.mp3' }],
      [{ link: 'https://b.example/y.mp3' }]
    )).toEqual(['https://a.example/x.mp3'])
  })

  test('uploads outstanding eligible cache and skips already indexed items', async function() {
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: true })
    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    global.__driveBackupCacheStore['extmedia:t1:0:https://archive.org/download/a.mp3'] = {
      blob: blob,
      duration: 12,
      audioFormat: 'audio/mpeg',
    }
    global.__driveBackupCacheStore['extmedia:t1:1:https://www.youtube.com/watch?v=abcdefghijk'] = {
      blob: blob,
      duration: 3,
      audioFormat: 'audio/mpeg',
    }
    expect(await isEligibleCachedMediaBackupKey('extmedia:t1:0:https://archive.org/download/a.mp3')).toBe(true)
    await enqueueCachedMediaDriveUpload('extmedia:t1:0:https://archive.org/download/a.mp3')
    expect(stores.media_cache_drive_backup.cached_media_pending_uploads).toEqual([
      'extmedia:t1:0:https://archive.org/download/a.mp3',
    ])

    const created = []
    const driveApi = {
      findTuneBookFolderInDrive: jest.fn(function() { return Promise.resolve('folder-root') }),
      findOrCreateCachedMediaFolderInDrive: jest.fn(function() { return Promise.resolve('folder-cache') }),
      findFileInFolder: jest.fn(function() { return Promise.resolve(null) }),
      getDocumentBlob: jest.fn(function() { return Promise.resolve(null) }),
      createDocument: jest.fn(function(name, body) {
        const id = 'id-' + created.length
        created.push({ name: name, body: body, id: id })
        return Promise.resolve(id)
      }),
      updateDocumentData: jest.fn(function() { return Promise.resolve(true) }),
    }

    const result = await syncOutstandingCachedMediaBackup({
      driveApi: driveApi,
      accessToken: 'token',
      force: true,
    })
    expect(result).toEqual({
      ok: true,
      uploaded: 1,
      remaining: 0,
      scanned: expect.any(Number),
    })
    expect(driveApi.createDocument).toHaveBeenCalled()
    expect(created.some(function(item) { return item.name === 'cached-media-index.json' })).toBe(true)
    expect(created.filter(function(item) { return item.name !== 'cached-media-index.json' }).length).toBe(1)

    const again = await syncOutstandingCachedMediaBackup({
      driveApi: driveApi,
      accessToken: 'token',
    })
    expect(again.uploaded).toBe(0)
  })

  test('on-demand restore writes local cache from this account index', async function() {
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: true })
    const src = 'https://archive.org/download/a.mp3'
    const driveBlob = new Blob(['from-drive'], { type: 'audio/mpeg' })
    const index = normalizeCachedMediaIndex({
      items: [{
        tuneId: 't1',
        src: src,
        driveFileId: 'drive-1',
        audioFormat: 'audio/mpeg',
        duration: 9,
      }],
    })
    stores.media_cache_drive_backup.cached_media_index = index

    const driveApi = {
      getDocumentBlob: jest.fn(function() { return Promise.resolve(driveBlob) }),
    }
    registerCachedMediaDriveBackupContext({ driveApi: driveApi, token: { access_token: 'tok' } })

    const restored = await tryRestoreCachedMediaFromThisAccount('t1', src, 'extmedia:t1:0:' + src)
    expect(restored.blob).toBe(driveBlob)
    expect(global.__driveBackupCacheStore['extmedia:t1:0:' + src]).toBeTruthy()
    expect(restored.source).toBe('drive-backup')
  })

  test('restore returns null when Drive fetch fails', async function() {
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: true })
    const src = 'https://archive.org/download/a.mp3'
    stores.media_cache_drive_backup.cached_media_index = normalizeCachedMediaIndex({
      items: [{ tuneId: 't1', src: src, driveFileId: 'drive-1' }],
    })
    registerCachedMediaDriveBackupContext({
      driveApi: { getDocumentBlob: jest.fn(function() { return Promise.resolve({ error: 'fail' }) }) },
      token: { access_token: 'tok' },
    })
    const restored = await tryRestoreCachedMediaFromThisAccount('t1', src, 'extmedia:t1:0:' + src)
    expect(restored).toBe(null)
  })

  test('share importer copy keeps original googleId and uses CachedMedia id', function() {
    const src = 'abcbook-recording:shared'
    const index = normalizeCachedMediaIndex({
      items: [{
        tuneId: 't1',
        src: src,
        driveFileId: 'copy-on-importer-drive',
      }],
    })
    const item = findIndexItem(index, 't1', src)
    expect(item.driveFileId).toBe('copy-on-importer-drive')
    expect(item.driveFileId).not.toBe('original-google-id')
    expect(getCachedMediaBackupId('t1', src)).not.toBe('original-google-id')
  })

  test('tune and link deletes enqueue only this account index file ids', async function() {
    const index = normalizeCachedMediaIndex({
      items: [
        { tuneId: 't1', src: 'https://a.example/x.mp3', driveFileId: 'mine-1' },
        { tuneId: 't2', src: 'https://b.example/y.mp3', driveFileId: 'mine-2' },
      ],
    })
    stores.media_cache_drive_backup.cached_media_index = index

    const removedTunes = await enqueueCachedMediaDriveDeletesForTuneIds(['t1'])
    expect(removedTunes.map(function(item) { return item.driveFileId })).toEqual(['mine-1'])

    const removedSrcs = await enqueueCachedMediaDriveDeletesForSrcs('t2', ['https://b.example/y.mp3'])
    expect(removedSrcs.map(function(item) { return item.driveFileId })).toEqual(['mine-2'])
  })

  test('pending uploads show in backup status for background jobs', async function() {
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: true })
    await enqueueCachedMediaDriveUpload('extmedia:t1:0:https://archive.org/download/a.mp3')
    const status = getMediaCacheDriveBackupStatus()
    expect(status.pendingCount).toBe(1)
    expect(status.syncing).toBe(false)
  })
})

describe('cached media owner-only deletes', function() {
  beforeEach(async function() {
    Object.keys(stores).forEach(function(name) {
      Object.keys(stores[name]).forEach(function(key) { delete stores[name][key] })
    })
    await clearCachedMediaDriveDeleteQueue()
  })

  test('drops pending delete when ownedByMe is false or 403', async function() {
    const driveApi = {
      getDocumentMeta: jest.fn(function(id) {
        if (id === 'not-mine') return Promise.resolve({ ownedByMe: false })
        if (id === 'forbidden') return Promise.resolve({ ownedByMe: true })
        return Promise.resolve({ ownedByMe: true })
      }),
      deleteDocument: jest.fn(function(id) {
        if (id === 'forbidden') {
          return Promise.resolve({ error: { response: { status: 403 } } })
        }
        if (id === 'ok') return Promise.resolve({ ok: true })
        return Promise.resolve({ ok: true })
      }),
    }
    await enqueueCachedMediaDriveDeletes(['not-mine', 'forbidden', 'ok'])
    const result = await flushCachedMediaDriveDeletes(driveApi, { accessToken: 'tok' })
    expect(driveApi.deleteDocument).toHaveBeenCalledWith('forbidden')
    expect(driveApi.deleteDocument).toHaveBeenCalledWith('ok')
    expect(driveApi.deleteDocument).not.toHaveBeenCalledWith('not-mine')
    expect(result.remaining).toEqual([])
    expect(result.skipped).toBe(2)
    expect(result.deleted).toBe(1)
  })
})
