import {
  CHROME_VV_SCALE_VAR,
  CHROME_VV_ZOOM_VAR,
  CHROME_ZOOM_GUARD_SELECTORS,
  CHROME_ZOOM_GUARD_SELECTOR,
  initChromeZoomGuard,
  readPageZoomScale,
  resetZoomBaseline,
  teardownChromeZoomGuard,
  updateChromeViewportScale,
} from './chromeZoomGuard'

jest.mock('./platformUtils', function() {
  return {
    isMobilePlatform: jest.fn(function() { return false }),
  }
})

const { isMobilePlatform } = require('./platformUtils')

describe('chromeZoomGuard', function() {
  const listeners = {
    resize: [],
    scroll: [],
  }

  const visualViewport = {
    scale: 1,
    addEventListener(event, handler) {
      if (listeners[event]) listeners[event].push(handler)
    },
    removeEventListener(event, handler) {
      if (!listeners[event]) return
      listeners[event] = listeners[event].filter(function(fn) { return fn !== handler })
    },
  }

  function setWindowMetrics(metrics) {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: metrics.devicePixelRatio,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: metrics.innerWidth,
    })
    Object.defineProperty(window, 'outerWidth', {
      configurable: true,
      value: metrics.outerWidth,
    })
  }

  beforeEach(function() {
    listeners.resize = []
    listeners.scroll = []
    visualViewport.scale = 1
    document.documentElement.style.removeProperty(CHROME_VV_SCALE_VAR)
    document.documentElement.style.removeProperty(CHROME_VV_ZOOM_VAR)
    teardownChromeZoomGuard()
    isMobilePlatform.mockReturnValue(false)
    setWindowMetrics({
      devicePixelRatio: 1,
      innerWidth: 1200,
      outerWidth: 1280,
    })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })
  })

  afterEach(function() {
    teardownChromeZoomGuard()
    document.documentElement.style.removeProperty(CHROME_VV_SCALE_VAR)
    document.documentElement.style.removeProperty(CHROME_VV_ZOOM_VAR)
    jest.restoreAllMocks()
  })

  it('includes all chrome toolbar selectors', function() {
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.App-header')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.music-buttons')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.music-editor-chrome-stack')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.music-editor-buttons')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.notation-editing-controls')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.notation-nonstaff-controls-main')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.abc-editor-lyrics-toolbar')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.links-editor-toolbar')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.chords-wizard-toolbar')
    expect(CHROME_ZOOM_GUARD_SELECTOR).toContain('.scratchpad-editor-chrome')
    expect(CHROME_ZOOM_GUARD_SELECTORS).toHaveLength(10)
  })

  it('updates scale variables from visualViewport pinch zoom', function() {
    visualViewport.scale = 1.5
    resetZoomBaseline()
    expect(updateChromeViewportScale()).toBe(1.5)
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_SCALE_VAR)).toBe('1.5')
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_ZOOM_VAR)).toBe(String(1 / 1.5))
  })

  it('detects desktop browser zoom via devicePixelRatio', function() {
    resetZoomBaseline()
    setWindowMetrics({
      devicePixelRatio: 1.5,
      innerWidth: 1200,
      outerWidth: 1280,
    })
    expect(readPageZoomScale()).toBe(1.5)
    expect(updateChromeViewportScale()).toBe(1.5)
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_ZOOM_VAR)).toBe(String(1 / 1.5))
  })

  it('detects desktop browser zoom via innerWidth when DPR is unchanged', function() {
    resetZoomBaseline()
    setWindowMetrics({
      devicePixelRatio: 1,
      innerWidth: 800,
      outerWidth: 1280,
    })
    expect(readPageZoomScale()).toBe(1.5)
  })

  it('defaults scale to 1 when no zoom is applied', function() {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: null,
    })
    resetZoomBaseline()
    expect(updateChromeViewportScale()).toBe(1)
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_SCALE_VAR)).toBe('1')
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_ZOOM_VAR)).toBe('1')
  })

  it('listens for visualViewport changes during init', function() {
    initChromeZoomGuard()
    expect(listeners.resize.length).toBe(1)
    expect(listeners.scroll.length).toBe(0)

    visualViewport.scale = 2
    listeners.resize[0]()
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_SCALE_VAR)).toBe('2')
  })

  it('teardown removes listeners and clears css variables', function() {
    initChromeZoomGuard()
    visualViewport.scale = 1.25
    updateChromeViewportScale()
    teardownChromeZoomGuard()
    expect(listeners.resize.length).toBe(0)
    expect(listeners.scroll.length).toBe(0)
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_SCALE_VAR)).toBe('')
    expect(document.documentElement.style.getPropertyValue(CHROME_VV_ZOOM_VAR)).toBe('')
  })

  it('registers mobile touch guards when on mobile platform', function() {
    isMobilePlatform.mockReturnValue(true)
    const addSpy = jest.spyOn(document, 'addEventListener')
    initChromeZoomGuard()
    expect(addSpy).toHaveBeenCalledWith('gesturestart', expect.any(Function), { passive: false })
    expect(addSpy).toHaveBeenCalledWith('gesturechange', expect.any(Function), { passive: false })
    expect(addSpy).toHaveBeenCalledWith('gestureend', expect.any(Function), { passive: false })
    expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false })
  })

  it('prevents pinch touchmove on chrome targets on mobile', function() {
    isMobilePlatform.mockReturnValue(true)
    let touchMoveHandler = null
    jest.spyOn(document, 'addEventListener').mockImplementation(function(type, handler, options) {
      if (type === 'touchmove') touchMoveHandler = handler
      return EventTarget.prototype.addEventListener.call(this, type, handler, options)
    })

    initChromeZoomGuard()
    expect(touchMoveHandler).not.toBeNull()

    const header = document.createElement('header')
    header.className = 'App-header'
    document.body.appendChild(header)

    const preventDefault = jest.fn()
    touchMoveHandler({
      touches: [{}, {}],
      target: header,
      preventDefault,
    })
    expect(preventDefault).toHaveBeenCalled()
    document.body.removeChild(header)
  })
})
