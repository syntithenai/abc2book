import {
  buildDriveUploadShrinkWarning,
  createDrivePollPauseController,
  DRIVE_UPLOAD_ECHO_PAUSE_MS,
  hashDriveAbc,
  isLastDriveUploadAbcEcho,
  isLocalLibraryWipeVsLastUpload,
  countMissingFromLastUpload,
  readLastDriveUploadSnapshot,
  writeLastDriveUploadSnapshot,
  shouldConfirmDriveUploadShrink,
  resetDismissedDriveUploadShrinkForTests,
} from './driveUploadShrinkGuard'

describe('driveUploadShrinkGuard', function() {
  beforeEach(function() {
    localStorage.clear()
    resetDismissedDriveUploadShrinkForTests()
  })

  test('write and read snapshot round trip', function() {
    writeLastDriveUploadSnapshot({
      a: { id: 'a', name: 'Alpha' },
      b: { id: 'b', name: 'Beta' },
    })
    const snap = readLastDriveUploadSnapshot()
    expect(snap.count).toBe(2)
    expect(snap.ids.sort()).toEqual(['a', 'b'])
    expect(snap.names.a).toBe('Alpha')
  })

  test('stores per-id timestamps and ABC hash', function() {
    writeLastDriveUploadSnapshot(
      { a: { id: 'a', name: 'Alpha', lastUpdated: 111 } },
      {
        deletedTunes: { b: { id: 'b', deletedAt: 222 } },
        playlists: { p1: { updatedAt: 333 } },
        deletedPlaylists: { p2: { deletedAt: 444 } },
        performanceSets: { s1: { updatedAt: 555 } },
        deletedPerformanceSets: { s2: { deletedAt: 666 } },
        practiceLists: { l1: { updatedAt: 777 } },
        deletedPracticeLists: { l2: { deletedAt: 888 } },
        abc: 'X:1\nT:Alpha\n',
      }
    )
    const snap = readLastDriveUploadSnapshot()
    expect(snap.lastUpdatedById.a).toBe(111)
    expect(snap.deletedAtById.b).toBe(222)
    expect(snap.playlistUpdatedAtById.p1).toBe(333)
    expect(snap.playlistDeletedAtById.p2).toBe(444)
    expect(snap.setUpdatedAtById.s1).toBe(555)
    expect(snap.setDeletedAtById.s2).toBe(666)
    expect(snap.practiceListUpdatedAtById.l1).toBe(777)
    expect(snap.practiceListDeletedAtById.l2).toBe(888)
    expect(snap.abcHash).toBe(hashDriveAbc('X:1\nT:Alpha\n'))
    expect(isLastDriveUploadAbcEcho('X:1\nT:Alpha\n')).toBe(true)
    expect(isLastDriveUploadAbcEcho('X:1\nT:Other\n')).toBe(false)
  })

  test('resumeAfterEcho does not unpause immediately', function() {
    jest.useFakeTimers()
    const pauseRef = { current: false }
    const controller = createDrivePollPauseController(pauseRef, DRIVE_UPLOAD_ECHO_PAUSE_MS)
    controller.pause()
    expect(pauseRef.current).toBe(true)
    controller.resumeAfterEcho()
    expect(pauseRef.current).toBe(true)
    jest.advanceTimersByTime(DRIVE_UPLOAD_ECHO_PAUSE_MS - 1)
    expect(pauseRef.current).toBe(true)
    jest.advanceTimersByTime(1)
    expect(pauseRef.current).toBe(false)
    jest.useRealTimers()
  })

  test('resumeNow unpauses without waiting', function() {
    jest.useFakeTimers()
    const pauseRef = { current: true }
    const controller = createDrivePollPauseController(pauseRef, DRIVE_UPLOAD_ECHO_PAUSE_MS)
    controller.resumeAfterEcho()
    controller.resumeNow()
    expect(pauseRef.current).toBe(false)
    jest.advanceTimersByTime(DRIVE_UPLOAD_ECHO_PAUSE_MS)
    expect(pauseRef.current).toBe(false)
    jest.useRealTimers()
  })

  test('no warning when shrink is small', function() {
    const prev = {
      count: 100,
      ids: Array.from({ length: 100 }, function(_, i) { return 't' + i }),
      names: {},
    }
    const next = {}
    for (let i = 0; i < 90; i += 1) next['t' + i] = { id: 't' + i }
    expect(shouldConfirmDriveUploadShrink(prev, next)).toBe(false)
  })

  test('warning lists removed sample names on mass shrink', function() {
    const ids = []
    const names = {}
    for (let i = 0; i < 200; i += 1) {
      const id = 't' + i
      ids.push(id)
      names[id] = 'Tune ' + i
    }
    const prev = { count: 200, ids: ids, names: names }
    const next = {}
    for (let i = 0; i < 20; i += 1) next['t' + i] = { id: 't' + i, name: 'Tune ' + i }
    const warning = buildDriveUploadShrinkWarning(prev, next)
    expect(warning).toBeTruthy()
    expect(warning.previousCount).toBe(200)
    expect(warning.nextCount).toBe(20)
    expect(warning.removedCount).toBe(180)
    expect(warning.sampleNames.length).toBeGreaterThan(0)
    expect(warning.sampleTruncated).toBe(true)
  })

  test('no warning without prior snapshot', function() {
    expect(buildDriveUploadShrinkWarning(null, { a: { id: 'a' } })).toBeNull()
  })

  test('detects local wipe vs last upload snapshot', function() {
    const ids = []
    const lastUpdatedById = {}
    for (let i = 0; i < 100; i += 1) {
      const id = 't' + i
      ids.push(id)
      lastUpdatedById[id] = 1000 + i
    }
    const snap = { count: 100, ids: ids, lastUpdatedById: lastUpdatedById }
    expect(countMissingFromLastUpload({}, snap)).toBe(100)
    expect(isLocalLibraryWipeVsLastUpload({}, snap)).toBe(true)
    expect(isLocalLibraryWipeVsLastUpload({ t0: { id: 't0' } }, snap)).toBe(true)
    const almostFull = {}
    for (let i = 0; i < 95; i += 1) almostFull['t' + i] = { id: 't' + i }
    expect(isLocalLibraryWipeVsLastUpload(almostFull, snap)).toBe(false)
  })

  test('dismissed shrink warning suppresses re-prompt for same shrink', function() {
    const {
      isDismissedDriveUploadShrink,
      rememberDismissedDriveUploadShrink,
    } = require('./driveUploadShrinkGuard')
    const warning = { previousCount: 200, nextCount: 0, removedCount: 200 }
    expect(isDismissedDriveUploadShrink(warning)).toBe(false)
    rememberDismissedDriveUploadShrink(warning)
    expect(isDismissedDriveUploadShrink(warning)).toBe(true)
    expect(isDismissedDriveUploadShrink({ previousCount: 200, nextCount: 1, removedCount: 199 })).toBe(false)
    writeLastDriveUploadSnapshot({ a: { id: 'a', name: 'A' } })
    expect(isDismissedDriveUploadShrink(warning)).toBe(false)
  })
})
