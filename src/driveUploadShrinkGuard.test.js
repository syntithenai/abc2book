import {
  buildDriveUploadShrinkWarning,
  readLastDriveUploadSnapshot,
  writeLastDriveUploadSnapshot,
  shouldConfirmDriveUploadShrink,
} from './driveUploadShrinkGuard'

describe('driveUploadShrinkGuard', function() {
  beforeEach(function() {
    localStorage.clear()
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
})
