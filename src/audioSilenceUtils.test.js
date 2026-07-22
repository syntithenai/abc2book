import { detectSilenceRegions, suggestConservativeTrim, suggestSegmentMarkers, rmsForWindow, trimAudioBuffer, audioBufferToWavBlob } from './audioSilenceUtils'

describe('audioSilenceUtils', function() {
  beforeAll(function() {
    if (typeof global.OfflineAudioContext === 'undefined') {
      global.OfflineAudioContext = class MockOfflineAudioContext {
        constructor(channels, length, sampleRate) {
          this.numberOfChannels = channels
          this.length = length
          this.sampleRate = sampleRate
        }
        createBuffer(channels, length, sampleRate) {
          const channelData = []
          for (let ch = 0; ch < channels; ch += 1) {
            channelData.push(new Float32Array(length))
          }
          return {
            numberOfChannels: channels,
            length: length,
            sampleRate: sampleRate,
            duration: length / sampleRate,
            getChannelData: function(ch) { return channelData[ch] },
          }
        }
      }
    }
  })

  test('rmsForWindow returns 0 for silence', function() {
    const data = new Float32Array(1000)
    expect(rmsForWindow(data, 0, 1000)).toBe(0)
  })

  test('suggestConservativeTrim keeps generous padding', function() {
    const duration = 60
    const silences = [{ start: 0, end: 5 }, { start: 55, end: 60 }]
    const trim = suggestConservativeTrim(duration, silences, { minPaddingSec: 2.5, maxTrimRatio: 0.15 })
    expect(trim.start).toBeLessThanOrEqual(60 * 0.15)
    expect(trim.end).toBeGreaterThanOrEqual(60 - 60 * 0.15)
    expect(trim.end - trim.start).toBeGreaterThan(duration * 0.5)
  })

  test('suggestSegmentMarkers adds markers at long gaps', function() {
    const markers = suggestSegmentMarkers(120, [
      { start: 30, end: 32 },
      { start: 70, end: 73 },
    ], { segmentGapSec: 1.5 })
    expect(markers.length).toBeGreaterThan(2)
  })

  test('detectSilenceRegions finds quiet runs', function() {
    const sr = 1000
    const samples = new Float32Array(5000)
    for (let i = 2000; i < 2600; i += 1) samples[i] = 0
    for (let i = 0; i < 2000; i += 1) samples[i] = 0.1
    const regions = detectSilenceRegions(samples, sr, { threshold: 0.02, minSilenceSec: 0.3 })
    expect(regions.length).toBeGreaterThan(0)
  })

  test('trimAudioBuffer slices the requested range', function() {
    const sampleRate = 44100
    const offlineCtx = new OfflineAudioContext(1, sampleRate * 2, sampleRate)
    const buffer = offlineCtx.createBuffer(1, sampleRate * 2, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) channel[i] = 0.5
    const trimmed = trimAudioBuffer(buffer, 0.5, 1.5)
    expect(trimmed.duration).toBeCloseTo(1, 1)
    expect(audioBufferToWavBlob(trimmed).type).toBe('audio/wav')
  })
})
