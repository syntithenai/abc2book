jest.mock('react-toastify', function() {
  return {
    toast: {
      warning: jest.fn(),
      success: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    },
  }
})

import { toast } from 'react-toastify'
import {
  estimateStoredValueBytes,
  formatBytes,
  getHighestExceededThresholdMb,
  maybeWarnMediaCacheStorage,
  mediaCacheSettingsPath,
  MEDIA_CACHE_SETTINGS_TAB,
  tuneIdFromExternalMediaCacheKey,
  tuneIdFromStemCacheKey,
  tuneIdFromMidiCacheKey,
  resolveTuneIdFromMidiCacheKey,
  midiCacheKeyMatchesTuneId,
  setLastWarnedThresholdMb,
  selectHalfOldestCacheKeys,
  filterCacheKeysForTuneIds,
  MEDIA_CACHE_WARN_THRESHOLD_KEY,
} from './mediaCacheStorage'
import { filterUnlockedTuneIds } from './mediaCacheLock'

function makeBlob(size) {
  if (typeof Blob !== 'undefined') {
    return new Blob([new Uint8Array(size)])
  }
  return { size: size }
}

describe('mediaCacheStorage', function() {
  beforeEach(function() {
    localStorage.clear()
    toast.warning.mockClear()
    delete window.location
    window.location = { assign: jest.fn() }
  })

  test('estimateStoredValueBytes sums blobs and nested objects', function() {
    expect(estimateStoredValueBytes(makeBlob(100))).toBe(100)
    expect(estimateStoredValueBytes({ blob: makeBlob(50), duration: 1.2 })).toBe(58)
    expect(estimateStoredValueBytes([makeBlob(10), makeBlob(20)])).toBe(30)
  })

  test('formatBytes uses readable units', function() {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB')
  })

  test('getHighestExceededThresholdMb uses 100 then +50 steps', function() {
    const MB = 1024 * 1024
    expect(getHighestExceededThresholdMb(99 * MB)).toBe(0)
    expect(getHighestExceededThresholdMb(100 * MB)).toBe(0)
    expect(getHighestExceededThresholdMb(100 * MB + 1)).toBe(100)
    expect(getHighestExceededThresholdMb(149 * MB)).toBe(100)
    expect(getHighestExceededThresholdMb(150 * MB)).toBe(100)
    expect(getHighestExceededThresholdMb(150 * MB + 1)).toBe(150)
    expect(getHighestExceededThresholdMb(200 * MB + 1)).toBe(200)
  })

  test('parses tune ids from cache keys', function() {
    expect(tuneIdFromExternalMediaCacheKey('extmedia:tune1:0:https://x')).toBe('tune1')
    expect(tuneIdFromStemCacheKey('stems:tune2:1:https://y:htdemucs')).toBe('tune2')
    expect(tuneIdFromMidiCacheKey('abc123-120-0-987654321')).toBe('abc123')
    expect(tuneIdFromMidiCacheKey('legacykey')).toBe('legacykey')
  })

  test('resolveTuneIdFromMidiCacheKey prefers longest known tune id', function() {
    const knownIds = ['abc', 'abc123', 'def456']
    expect(resolveTuneIdFromMidiCacheKey('abc123-120-0-999', knownIds)).toBe('abc123')
    expect(resolveTuneIdFromMidiCacheKey('abc-120-0-999', knownIds)).toBe('abc')
    expect(resolveTuneIdFromMidiCacheKey('missing-1-0-2', knownIds)).toBe('missing')
    expect(midiCacheKeyMatchesTuneId('abc123-120-0-999', 'abc123')).toBe(true)
    expect(midiCacheKeyMatchesTuneId('abc123', 'abc123')).toBe(true)
    expect(midiCacheKeyMatchesTuneId('abc1234-1-0-2', 'abc123')).toBe(false)
  })

  test('selectHalfOldestCacheKeys clears oldest cached entries first', function() {
    const keys = selectHalfOldestCacheKeys([
      { key: 'a', cachedAt: 100 },
      { key: 'b', cachedAt: 300 },
      { key: 'c', cachedAt: 200 },
      { key: 'd', cachedAt: 400 },
    ])
    expect(keys).toEqual(['a', 'c'])
  })

  test('filterCacheKeysForTuneIds matches tune ids from keys', function() {
    const keys = filterCacheKeysForTuneIds(
      ['extmedia:t1:0:a', 'extmedia:t1:1:b', 'extmedia:t2:0:c'],
      ['t1'],
      tuneIdFromExternalMediaCacheKey
    )
    expect(keys).toEqual(['extmedia:t1:0:a', 'extmedia:t1:1:b'])
  })

  test('filterUnlockedTuneIds skips locked tune ids', function() {
    expect(filterUnlockedTuneIds(['t1', 't2', 't3'], { t2: true })).toEqual(['t1', 't3'])
    expect(filterUnlockedTuneIds(['t1'], null)).toEqual(['t1'])
  })

  test('mediaCacheSettingsPath targets media settings tab', function() {
    expect(mediaCacheSettingsPath()).toBe('/settings?tab=' + MEDIA_CACHE_SETTINGS_TAB)
  })

  test('maybeWarnMediaCacheStorage warns once per threshold', function() {
    const MB = 1024 * 1024
    const first = maybeWarnMediaCacheStorage({ totalBytes: 101 * MB })
    expect(first.warned).toBe(true)
    expect(first.thresholdMb).toBe(100)
    expect(toast.warning).toHaveBeenCalledTimes(1)

    toast.warning.mockClear()
    const again = maybeWarnMediaCacheStorage({ totalBytes: 120 * MB })
    expect(again.warned).toBe(false)
    expect(toast.warning).not.toHaveBeenCalled()

    const next = maybeWarnMediaCacheStorage({ totalBytes: 151 * MB })
    expect(next.warned).toBe(true)
    expect(next.thresholdMb).toBe(150)
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  test('maybeWarnMediaCacheStorage renders Open Settings button', function() {
    const MB = 1024 * 1024
    const closeToast = jest.fn()
    maybeWarnMediaCacheStorage({ totalBytes: 101 * MB })
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const renderFn = toast.warning.mock.calls[0][0]
    const rendered = renderFn({ closeToast: closeToast })
    const button = rendered.props.children.find(function(child) {
      return child && child.type === 'button'
    })
    expect(button.props.children).toBe('Open Settings')
    button.props.onClick()
    expect(closeToast).toHaveBeenCalled()
    expect(window.location.assign).toHaveBeenCalledWith(mediaCacheSettingsPath())
  })

  test('maybeWarnMediaCacheStorage lowers stored threshold after cleanup', function() {
    setLastWarnedThresholdMb(150)
    const result = maybeWarnMediaCacheStorage({ totalBytes: 50 * 1024 * 1024 })
    expect(result.warned).toBe(false)
    expect(localStorage.getItem(MEDIA_CACHE_WARN_THRESHOLD_KEY)).toBeNull()
  })
})
