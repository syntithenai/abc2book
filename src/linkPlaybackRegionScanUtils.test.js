import {
  isScannableLink,
  isPlayRangeScannableLink,
  canAutoScanPlaybackRegion,
  formatLinkPlayRangeLabel,
  getLinkPlayRangeBoundLabels,
  linkHasConfiguredPlayRange,
} from './linkPlaybackRegionScanUtils'

describe('linkPlaybackRegionScanUtils', function() {
  test('isScannableLink accepts http(s) and inline audio', function() {
    expect(isScannableLink('https://youtu.be/abc')).toBe(true)
    expect(isScannableLink('data:audio/mp3;base64,abc')).toBe(true)
    expect(isScannableLink('data:text/plain,hi')).toBe(false)
    expect(isScannableLink('')).toBe(false)
  })

  test('isScannableLink rejects MIDI URLs', function() {
    expect(isScannableLink('https://example.com/tune.mid')).toBe(false)
    expect(isScannableLink('https://example.com/tune.MIDI')).toBe(false)
    expect(isScannableLink('data:audio/midi;base64,abc')).toBe(false)
  })

  test('isPlayRangeScannableLink rejects MIDI links even with leftover startAt', function() {
    expect(isPlayRangeScannableLink({
      link: 'https://example.com/a.mp3',
    })).toBe(true)
    expect(isPlayRangeScannableLink({
      link: 'https://example.com/tune.mid',
      startAt: '12',
      endAt: '90',
    })).toBe(false)
    expect(isPlayRangeScannableLink({
      link: 'abcbook-recording:rec1',
      mediaKind: 'midi',
    })).toBe(false)
  })

  test('formatLinkPlayRangeLabel formats configured start and end times as seconds', function() {
    expect(formatLinkPlayRangeLabel({ startAt: '', endAt: '' })).toBe('')
    expect(formatLinkPlayRangeLabel({ startAt: '12.5', endAt: '200' })).toBe('12.5 – 200')
    expect(formatLinkPlayRangeLabel({ startAt: '1:05', endAt: '' })).toBe('65 – end')
    expect(formatLinkPlayRangeLabel({ startAt: '', endAt: '90' })).toBe('start – 90')
    expect(linkHasConfiguredPlayRange({ startAt: '12', endAt: '' })).toBe(true)
  })

  test('getLinkPlayRangeBoundLabels uses start/end placeholders when unset', function() {
    expect(getLinkPlayRangeBoundLabels({ startAt: '', endAt: '' })).toEqual({
      start: 'start',
      end: 'end',
    })
    expect(getLinkPlayRangeBoundLabels({ startAt: '12.5', endAt: '200' })).toEqual({
      start: '12.5',
      end: '200',
    })
    expect(getLinkPlayRangeBoundLabels({ startAt: '1:05', endAt: '' })).toEqual({
      start: '65',
      end: 'end',
    })
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
