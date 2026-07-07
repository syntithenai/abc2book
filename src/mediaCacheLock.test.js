import {
  countMediaCacheLockedTunes,
  getLockedTuneIdSet,
  isMediaCacheLocked,
  setMediaCacheLockForTunes,
} from './mediaCacheLock'

describe('mediaCacheLock', function() {
  test('isMediaCacheLocked detects locked tunes', function() {
    expect(isMediaCacheLocked({ mediaCacheLocked: true })).toBe(true)
    expect(isMediaCacheLocked({ mediaCacheLocked: false })).toBe(false)
    expect(isMediaCacheLocked({})).toBe(false)
    expect(isMediaCacheLocked(null)).toBe(false)
  })

  test('getLockedTuneIdSet and countMediaCacheLockedTunes', function() {
    const tunes = {
      t1: { id: 't1', mediaCacheLocked: true },
      t2: { id: 't2' },
      t3: { id: 't3', mediaCacheLocked: true },
    }
    expect(getLockedTuneIdSet(tunes)).toEqual({ t1: true, t3: true })
    expect(countMediaCacheLockedTunes(tunes)).toBe(2)
  })
})
