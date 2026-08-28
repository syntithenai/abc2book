// jest-dom adds custom jest matchers for asserting on DOM nodes.
try {
  require('@testing-library/jest-dom')
} catch (e) {
  // Optional — playback logic tests do not need jest-dom.
}

const { TextDecoder, TextEncoder } = require('util');
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
  global.TextEncoder = TextEncoder;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: function(query) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: function() {},
        removeListener: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return false },
      }
    },
  })
}

jest.mock('soundtouchjs', function() {
  function MockSoundTouch() {
    this.tempo = 1
    this.pitchSemitones = 0
  }
  function MockSimpleFilter() {}
  function MockWebAudioBufferSource() {}
  function MockPitchShifter() {
    this.tempo = 1
    this.pitchSemitones = 0
    this.percentagePlayed = 0
    this.timePlayed = 0
    this.connect = jest.fn()
    this.disconnect = jest.fn()
    this.off = jest.fn()
    this.on = jest.fn()
  }
  return {
    SoundTouch: MockSoundTouch,
    SimpleFilter: MockSimpleFilter,
    WebAudioBufferSource: MockWebAudioBufferSource,
    PitchShifter: MockPitchShifter,
  }
})

jest.mock('./pdfJsConfig', function() {
  return {
    __esModule: true,
    pdfjs: {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: jest.fn(function() {
        return { promise: Promise.reject(new Error('pdfjs unavailable in tests')) }
      }),
    },
    resolvePdfWorkerSrc: function() { return '/pdf.worker.min.js' },
  }
})
