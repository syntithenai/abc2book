import {
  isPlaybackInterruptPath,
  shouldPausePlaybackOnToolPageEnter,
} from './toolPlaybackInterrupt'

describe('toolPlaybackInterrupt', function() {
  test('recognizes scratchpad paths', function() {
    expect(isPlaybackInterruptPath('/scratchpad')).toBe(true)
    expect(isPlaybackInterruptPath('/scratchpad/abc123')).toBe(true)
    expect(isPlaybackInterruptPath('/tunes/1')).toBe(false)
  })

  test('recognizes settings paths', function() {
    expect(isPlaybackInterruptPath('/settings')).toBe(true)
    expect(isPlaybackInterruptPath('/settings/')).toBe(true)
    expect(isPlaybackInterruptPath('/books')).toBe(false)
  })

  test('does not pause when notation editor owns midi on scratchpad', function() {
    expect(shouldPausePlaybackOnToolPageEnter({
      pathname: '/scratchpad/item-1',
      enteredInterrupt: true,
      notationMidiOwner: true,
      isPlaying: false,
      isLoading: true,
    })).toBe(false)
  })

  test('pauses when entering scratchpad while playback is active', function() {
    expect(shouldPausePlaybackOnToolPageEnter({
      pathname: '/scratchpad/item-1',
      enteredInterrupt: true,
      notationMidiOwner: false,
      isPlaying: true,
      isLoading: false,
    })).toBe(true)
  })

  test('does not pause when isLoading toggles on scratchpad without navigation', function() {
    expect(shouldPausePlaybackOnToolPageEnter({
      pathname: '/scratchpad/item-1',
      enteredInterrupt: false,
      notationMidiOwner: false,
      isPlaying: false,
      isLoading: true,
    })).toBe(false)
  })
})
