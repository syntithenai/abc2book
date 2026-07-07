import { isScannableLink, canAutoScanPlaybackRegion } from './linkPlaybackRegionScanUtils'

describe('linkPlaybackRegionScanUtils', function() {
  test('isScannableLink accepts http(s) and inline audio', function() {
    expect(isScannableLink('https://youtu.be/abc')).toBe(true)
    expect(isScannableLink('data:audio/mp3;base64,abc')).toBe(true)
    expect(isScannableLink('data:text/plain,hi')).toBe(false)
    expect(isScannableLink('')).toBe(false)
  })

  test('canAutoScanPlaybackRegion requires whisper feature', function() {
    expect(canAutoScanPlaybackRegion({
      checked: true,
      available: true,
      status: { available: true, features: { whisper: true } },
    })).toBe(true)
    expect(canAutoScanPlaybackRegion({
      checked: true,
      available: true,
      status: { available: true, features: { whisper: false } },
    })).toBe(false)
  })
})
