import { createPlaybackKeepAlive } from './playbackKeepAlive'

describe('playbackKeepAlive', function() {
  test('start plays a looping silent audio element', function() {
    const play = jest.fn(function() { return Promise.resolve() })
    const pause = jest.fn()
    function FakeAudio() {
      this.loop = false
      this.volume = 1
      this.preload = ''
      this.paused = true
      this.currentTime = 0
      this.play = play
      this.pause = pause
    }
    const keepAlive = createPlaybackKeepAlive({ Audio: FakeAudio })
    return keepAlive.start().then(function(ok) {
      expect(ok).toBe(true)
      expect(play).toHaveBeenCalled()
      const audio = keepAlive._getAudioForTests()
      expect(audio.loop).toBe(true)
      expect(audio.volume).toBeLessThan(0.01)
      keepAlive.stop()
      expect(pause).toHaveBeenCalled()
      expect(keepAlive.isActive()).toBe(false)
    })
  })

  test('start failure clears active flag', function() {
    function FakeAudio() {
      this.loop = false
      this.volume = 1
      this.play = function() { return Promise.reject(new Error('blocked')) }
      this.pause = function() {}
    }
    const keepAlive = createPlaybackKeepAlive({ Audio: FakeAudio })
    return keepAlive.start().then(function(ok) {
      expect(ok).toBe(false)
      expect(keepAlive.isActive()).toBe(false)
    })
  })
})
