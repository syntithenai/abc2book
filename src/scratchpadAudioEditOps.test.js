import {
  extractBufferRegion,
  spliceBufferRippleDelete,
} from './scratchpadAudioEditOps'

beforeAll(function() {
  if (typeof global.OfflineAudioContext === 'undefined') {
    global.OfflineAudioContext = class MockOfflineAudioContext {
      constructor(channels, length, sampleRate) {
        this.numberOfChannels = channels
        this.length = length
        this.sampleRate = sampleRate
        this.destination = { channelCount: channels }
      }
      createBufferSource() {
        const ctx = this
        return {
          buffer: null,
          connect: function() {},
          start: function() {},
        }
      }
      createGain() {
        return { connect: function() {}, gain: { value: 1 } }
      }
      startRendering() {
        const buffer = {
          numberOfChannels: this.numberOfChannels,
          length: this.length,
          sampleRate: this.sampleRate,
          duration: this.length / this.sampleRate,
          getChannelData: function() { return new Float32Array(this.length) },
        }
        return Promise.resolve(buffer)
      }
    }
  }
  if (typeof global.AudioBuffer === 'undefined') {
    global.AudioBuffer = class MockAudioBuffer {
      constructor(opts) {
        this.numberOfChannels = opts.numberOfChannels
        this.length = opts.length
        this.sampleRate = opts.sampleRate
        this.duration = opts.length / opts.sampleRate
      }
      getChannelData() {
        return new Float32Array(this.length)
      }
    }
  }
})

function mockBuffer(length, fill) {
  const data = new Float32Array(length)
  if (fill != null) data.fill(fill)
  return {
    numberOfChannels: 1,
    length: length,
    sampleRate: 8000,
    duration: length / 8000,
    getChannelData: function() { return data },
  }
}

describe('scratchpadAudioEditOps', function() {
  test('extractBufferRegion returns slice of buffer', async function() {
    const full = mockBuffer(8000)
    const region = await extractBufferRegion(full, 0.25, 0.5)
    expect(region.length).toBe(2000)
  })

  test('spliceBufferRippleDelete removes selected samples', async function() {
    const full = mockBuffer(8000, 0.5)
    const next = await spliceBufferRippleDelete(full, 0.25, 0.5)
    expect(next.length).toBe(6000)
  })
})
