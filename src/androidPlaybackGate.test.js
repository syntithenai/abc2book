import {
  isAndroidNativeOutputOwned,
  shouldBlockWebViewAudioPlay,
  hardSilenceWebViewOutputs,
} from './androidPlaybackGate'

describe('androidPlaybackGate', function() {
  const controller = {
    isMediaPlaybackRoute: function() { return true },
    isMidiPlaybackRoute: function() { return false },
    silencePlaybackOutputs: jest.fn(),
    stopPlaybackKeepAlive: jest.fn(),
    pauseYoutubeOutputOnly: jest.fn(),
    playerRef: { current: { volume: 1, pause: jest.fn(), removeAttribute: jest.fn(), load: jest.fn() } },
    filteredPlayerRef: { current: null },
  }

  beforeEach(function() {
    window.Capacitor = { isNativePlatform: function() { return true }, getPlatform: function() { return 'android' } }
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', hostname: 'localhost' },
      writable: true,
    })
  })

  it('blocks webview play on android media route', function() {
    expect(isAndroidNativeOutputOwned(controller)).toBe(true)
    expect(shouldBlockWebViewAudioPlay(controller, 'test')).toBe(true)
  })

  it('hard silences webview outputs', function() {
    hardSilenceWebViewOutputs(controller)
    expect(controller.silencePlaybackOutputs).toHaveBeenCalled()
    expect(controller.stopPlaybackKeepAlive).toHaveBeenCalled()
  })
})
