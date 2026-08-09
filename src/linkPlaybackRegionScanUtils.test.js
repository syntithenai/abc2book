import {
  isScannableLink,
  canAutoScanPlaybackRegion,
  formatLinkPlayRangeLabel,
  linkHasConfiguredPlayRange,
} from './linkPlaybackRegionScanUtils'

describe('linkPlaybackRegionScanUtils', function() {
  test('isScannableLink accepts http(s) and inline audio', function() {
    expect(isScannableLink('https://youtu.be/abc')).toBe(true)
    expect(isScannableLink('data:audio/mp3;base64,abc')).toBe(true)
    expect(isScannableLink('data:text/plain,hi')).toBe(false)
    expect(isScannableLink('')).toBe(false)
  })

  test('formatLinkPlayRangeLabel formats configured start and end times', function() {
    expect(formatLinkPlayRangeLabel({ startAt: '', endAt: '' })).toBe('')
    expect(formatLinkPlayRangeLabel({ startAt: '12.5', endAt: '200' })).toBe('0:12 – 3:20')
    expect(formatLinkPlayRangeLabel({ startAt: '1:05', endAt: '' })).toBe('1:05 – end')
    expect(formatLinkPlayRangeLabel({ startAt: '', endAt: '90' })).toBe('start – 1:30')
    expect(linkHasConfiguredPlayRange({ startAt: '12', endAt: '' })).toBe(true)
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
