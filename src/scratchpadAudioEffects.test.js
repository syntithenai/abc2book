import { computeNormalizeGain, computeAmplifyGain } from './scratchpadAudioEffects'

describe('scratchpadAudioEffects', function() {
  test('computeAmplifyGain converts dB to linear', function() {
    expect(computeAmplifyGain(6)).toBeCloseTo(1.995, 2)
    expect(computeAmplifyGain(0)).toBe(1)
  })

  test('computeNormalizeGain returns 1 for silent buffer', function() {
    const buffer = {
      numberOfChannels: 1,
      getChannelData: function() { return new Float32Array([0, 0, 0]) },
    }
    expect(computeNormalizeGain(buffer, -1)).toBe(1)
  })

  test('computeNormalizeGain scales toward target', function() {
    const buffer = {
      numberOfChannels: 1,
      getChannelData: function() { return new Float32Array([0.1, 0.1]) },
    }
    const gain = computeNormalizeGain(buffer, -1)
    expect(gain).toBeGreaterThan(1)
  })
})
