import {
  TunebookMediaWeb,
  resetHostedAudioElementForTests,
  unlockHostedAudioElement,
  getHostedAudioElement,
} from './tunebookMediaWeb'

function makeFakeAudioClass() {
  function FakeAudio() {
    this.listeners = {}
    this.paused = true
    this.ended = false
    this.currentTime = 0
    this.duration = NaN
    this.readyState = 0
    this.playbackRate = 1
    this.error = null
    this.src = ''
    this.attrs = {}
  }
  FakeAudio.prototype.addEventListener = function(name, fn) {
    ;(this.listeners[name] = this.listeners[name] || []).push(fn)
  }
  FakeAudio.prototype.removeEventListener = function(name, fn) {
    this.listeners[name] = (this.listeners[name] || []).filter(function(f) { return f !== fn })
  }
  FakeAudio.prototype.fire = function(name) {
    ;(this.listeners[name] || []).slice().forEach(function(fn) { fn() })
  }
  FakeAudio.prototype.setAttribute = function(k, v) { this.attrs[k] = v }
  FakeAudio.prototype.removeAttribute = function(k) {
    if (k === 'src') this.src = ''
  }
  FakeAudio.prototype.load = function() {
    const self = this
    self.readyState = 0
    if (!self.src) return
    Promise.resolve().then(function() {
      self.readyState = 1
      self.duration = 42
      self.fire('loadedmetadata')
    })
  }
  FakeAudio.prototype.play = function() {
    this.paused = false
    this.fire('playing')
    return Promise.resolve()
  }
  FakeAudio.prototype.pause = function() {
    this.paused = true
    this.fire('pause')
  }
  return FakeAudio
}

describe('TunebookMediaWeb', function() {
  let FakeAudio
  beforeEach(function() {
    resetHostedAudioElementForTests()
    FakeAudio = makeFakeAudioClass()
  })

  test('load plays from position and reports state', async function() {
    const plugin = new TunebookMediaWeb({ Audio: FakeAudio })
    const states = []
    await plugin.addListener('stateChange', function(s) { states.push(s) })
    await plugin.load({ uri: 'blob:tune', positionMs: 5000, autoplay: true })
    const el = getHostedAudioElement()
    expect(el.src).toBe('blob:tune')
    expect(el.currentTime).toBe(5)
    expect(el.preservesPitch).toBe(true)
    const state = await plugin.getState()
    expect(state).toEqual({ isPlaying: true, positionMs: 5000, durationMs: 42000, hasMedia: true })
    expect(states.some(function(s) { return s.isPlaying })).toBe(true)
  })

  test('ended and error are forwarded only while media is loaded', async function() {
    const plugin = new TunebookMediaWeb({ Audio: FakeAudio })
    const ended = jest.fn()
    const errors = []
    await plugin.addListener('ended', ended)
    await plugin.addListener('error', function(e) { errors.push(e) })
    await plugin.load({ uri: 'blob:tune', autoplay: true })
    const el = getHostedAudioElement()
    el.fire('ended')
    expect(ended).toHaveBeenCalledTimes(1)
    el.error = { code: 4, message: 'bad' }
    el.fire('error')
    expect(errors).toEqual([{ message: 'bad' }])
    await plugin.stop()
    el.fire('ended')
    expect(ended).toHaveBeenCalledTimes(1)
    const state = await plugin.getState()
    expect(state.hasMedia).toBe(false)
  })

  test('speed, seek and pause map to the element', async function() {
    const plugin = new TunebookMediaWeb({ Audio: FakeAudio })
    await plugin.load({ uri: 'blob:tune', autoplay: false })
    const el = getHostedAudioElement()
    expect(el.paused).toBe(true)
    await plugin.setPlaybackSpeed({ speed: 0.75 })
    expect(el.playbackRate).toBe(0.75)
    await plugin.seekTo({ positionMs: 2500 })
    expect(el.currentTime).toBe(2.5)
    await plugin.play()
    expect(el.paused).toBe(false)
    await plugin.pause()
    expect(el.paused).toBe(true)
  })

  test('a newer load supersedes an in-flight one', async function() {
    const plugin = new TunebookMediaWeb({ Audio: FakeAudio })
    const first = plugin.load({ uri: 'blob:one', autoplay: true })
    const second = plugin.load({ uri: 'blob:two', autoplay: true })
    await expect(first).rejects.toThrow('Superseded by new load')
    await second
    expect(getHostedAudioElement().src).toBe('blob:two')
  })

  test('unlock plays silence once and does not clobber a loaded track', async function() {
    getHostedAudioElement(FakeAudio)
    const ok = await unlockHostedAudioElement()
    expect(ok).toBe(true)
    const el = getHostedAudioElement()
    expect(el.paused).toBe(true)
    resetHostedAudioElementForTests()
    const plugin = new TunebookMediaWeb({ Audio: FakeAudio })
    await plugin.load({ uri: 'blob:tune', autoplay: false })
    const okLoaded = await unlockHostedAudioElement()
    expect(okLoaded).toBe(false)
    expect(getHostedAudioElement().src).toBe('blob:tune')
  })
})
