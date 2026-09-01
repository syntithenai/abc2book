import {
  PENDING_CLEAR_USER_DATA_KEY,
  hasPendingClearUserData,
  setPendingClearUserData,
  clearPendingClearUserData,
  tombstoneAndClearPlaylists,
  tombstoneAndClearPerformanceSets,
  tombstoneAndClearPracticeLists,
  clearUserData,
  flushPendingClearUserData,
} from './clearUserData'
import {
  readPlaylistsMap,
  writePlaylistsMap,
  readDeletedPlaylists,
  writeDeletedPlaylists,
} from './savedPlaylistsStore'
import {
  readPerformanceSetsMap,
  writePerformanceSetsMap,
  readDeletedPerformanceSets,
  writeDeletedPerformanceSets,
} from './performanceSetStore'
import {
  readPracticeListsMap,
  writePracticeListsMap,
  readDeletedPracticeLists,
  writeDeletedPracticeLists,
} from './practiceListStore'

jest.mock('./offlineNetwork', function() {
  return {
    isNavigatorOffline: jest.fn(function() { return false }),
  }
})

jest.mock('./tuneFiles', function() {
  return {
    enqueuePendingDriveDelete: jest.fn(function() { return Promise.resolve() }),
    flushPendingDriveDeletes: jest.fn(function() { return Promise.resolve({ deleted: 0, remaining: [] }) }),
  }
})

jest.mock('./mediaCacheDriveDeletes', function() {
  return {
    flushCachedMediaDriveDeletes: jest.fn(function() { return Promise.resolve({ deleted: 0, remaining: [] }) }),
  }
})

jest.mock('./mediaCacheDriveBackup', function() {
  return {
    getLocalCachedMediaIndex: jest.fn(function() { return Promise.resolve({ items: [] }) }),
    enqueueCachedMediaDriveDeletesForTuneIds: jest.fn(function() { return Promise.resolve([]) }),
  }
})

jest.mock('./scratchpadDriveDeletes', function() {
  return {
    enqueueScratchpadDriveDeletes: jest.fn(function() { return Promise.resolve([]) }),
    flushScratchpadDriveDeletes: jest.fn(function() { return Promise.resolve({ deleted: 0, remaining: [] }) }),
  }
})

jest.mock('./scratchpadCloudSync', function() {
  return {
    syncScratchpadWithDrive: jest.fn(function() { return Promise.resolve({ ok: true }) }),
  }
})

jest.mock('./scratchpadStore', function() {
  return {
    listAllScratchpadItems: jest.fn(function() { return [] }),
    listAllWorkspacesRaw: jest.fn(function() { return [] }),
    deleteScratchpadItem: jest.fn(),
    deleteWorkspace: jest.fn(),
    ensureDefaultWorkspace: jest.fn(),
  }
})

const { isNavigatorOffline } = require('./offlineNetwork')

describe('clearUserData pending flag', function() {
  beforeEach(function() {
    localStorage.clear()
    writePlaylistsMap({})
    writeDeletedPlaylists({})
    writePerformanceSetsMap({})
    writeDeletedPerformanceSets({})
    writePracticeListsMap({})
    writeDeletedPracticeLists({})
  })

  test('set/has/clear pending clear flag', function() {
    expect(hasPendingClearUserData()).toBe(false)
    setPendingClearUserData()
    expect(localStorage.getItem(PENDING_CLEAR_USER_DATA_KEY)).toBe('1')
    expect(hasPendingClearUserData()).toBe(true)
    clearPendingClearUserData()
    expect(hasPendingClearUserData()).toBe(false)
  })
})

describe('tombstoneAndClear companions', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('tombstoneAndClearPlaylists empties map and records tombstones', function() {
    writePlaylistsMap({
      p1: { name: 'Session', items: [{ tuneId: 't1' }], updatedAt: 1 },
    })
    writeDeletedPlaylists({})
    tombstoneAndClearPlaylists()
    expect(Object.keys(readPlaylistsMap())).toEqual([])
    expect(readDeletedPlaylists().p1).toBeTruthy()
    expect(readDeletedPlaylists().p1.name).toBe('Session')
  })

  test('tombstoneAndClearPerformanceSets empties map and records tombstones', function() {
    writePerformanceSetsMap({
      s1: { name: 'Gig', items: [], updatedAt: 1 },
    })
    writeDeletedPerformanceSets({})
    tombstoneAndClearPerformanceSets()
    expect(Object.keys(readPerformanceSetsMap())).toEqual([])
    expect(readDeletedPerformanceSets().s1).toBeTruthy()
  })

  test('tombstoneAndClearPracticeLists empties map and records tombstones', function() {
    writePracticeListsMap({
      l1: { name: 'Weekly', tuneIds: ['t1'], updatedAt: 1 },
    })
    writeDeletedPracticeLists({})
    tombstoneAndClearPracticeLists()
    expect(Object.keys(readPracticeListsMap())).toEqual([])
    expect(readDeletedPracticeLists().l1).toBeTruthy()
  })
})

describe('clearUserData', function() {
  beforeEach(function() {
    localStorage.clear()
    writePlaylistsMap({})
    writeDeletedPlaylists({})
    writePerformanceSetsMap({})
    writeDeletedPerformanceSets({})
    writePracticeListsMap({})
    writeDeletedPracticeLists({})
    isNavigatorOffline.mockReturnValue(false)
  })

  test('online + logged in clears Drive immediately and drops pending flag', async function() {
    const deleteAll = jest.fn()
    const updateSheet = jest.fn(function() { return Promise.resolve({ uploaded: true }) })
    const result = await clearUserData({
      tunebook: { deleteAll: deleteAll, utils: {} },
      token: { access_token: 'tok' },
      driveApi: { deleteDocument: jest.fn() },
      updateSheet: updateSheet,
      isLoggedIn: true,
    })
    expect(deleteAll).toHaveBeenCalledWith({
      keepTombstonesForDriveWipe: true,
      skipOnlineSave: true,
    })
    expect(updateSheet).toHaveBeenCalledWith(0, { forceShrinkUpload: true })
    expect(result.driveCleared).toBe(true)
    expect(result.pendingDriveClear).toBeFalsy()
    expect(hasPendingClearUserData()).toBe(false)
  })

  test('offline keeps pending Drive clear', async function() {
    isNavigatorOffline.mockReturnValue(true)
    const updateSheet = jest.fn()
    const result = await clearUserData({
      tunebook: { deleteAll: jest.fn(), utils: {} },
      token: { access_token: 'tok' },
      driveApi: { deleteDocument: jest.fn() },
      updateSheet: updateSheet,
      isLoggedIn: true,
    })
    expect(updateSheet).not.toHaveBeenCalled()
    expect(result.pendingDriveClear).toBe(true)
    expect(hasPendingClearUserData()).toBe(true)
  })

  test('logged out keeps pending Drive clear', async function() {
    const updateSheet = jest.fn()
    const result = await clearUserData({
      tunebook: { deleteAll: jest.fn(), utils: {} },
      token: null,
      updateSheet: updateSheet,
      isLoggedIn: false,
    })
    expect(updateSheet).not.toHaveBeenCalled()
    expect(result.pendingDriveClear).toBe(true)
    expect(hasPendingClearUserData()).toBe(true)
  })
})

describe('flushPendingClearUserData', function() {
  beforeEach(function() {
    localStorage.clear()
    isNavigatorOffline.mockReturnValue(false)
  })

  test('no-ops when nothing pending', async function() {
    const result = await flushPendingClearUserData({
      token: { access_token: 'tok' },
      updateSheet: jest.fn(),
    })
    expect(result.skipped).toBe(true)
  })

  test('uploads forced shrink and clears pending when online', async function() {
    setPendingClearUserData()
    const updateSheet = jest.fn(function() { return Promise.resolve({ uploaded: true }) })
    const result = await flushPendingClearUserData({
      token: { access_token: 'tok' },
      driveApi: { deleteDocument: jest.fn() },
      updateSheet: updateSheet,
    })
    expect(updateSheet).toHaveBeenCalledWith(0, { forceShrinkUpload: true })
    expect(result.cleared).toBe(true)
    expect(hasPendingClearUserData()).toBe(false)
  })

  test('stays pending when offline', async function() {
    setPendingClearUserData()
    isNavigatorOffline.mockReturnValue(true)
    const result = await flushPendingClearUserData({
      token: { access_token: 'tok' },
      updateSheet: jest.fn(),
    })
    expect(result.pending).toBe(true)
    expect(hasPendingClearUserData()).toBe(true)
  })
})
