import { compactPeaks, compactPitchPoints, createLivePeakSampler, downsamplePeaks, extractPitchPointsFromChannel, frequencyToMidiFloat, LIVE_PEAK_INTERVAL_MS, peaksDurationSeconds, preferMonophonicFundamental, resolvePitchTrackerOptions, resolvePlayalongTakePitchPoints, stabilizePitchPointSeries } from './playalongWaveform'
import { playalongTrackingOptions } from './playalongSettings'

describe('playalongWaveform', function() {
  test('downsamplePeaks keeps min and max in each block', function() {
    const data = [-0.5, 0.2, -0.1, 0.8]
    const peaks = downsamplePeaks(data, 2)
    expect(peaks.length).toBe(2)
    expect(peaks[0].min).toBe(-0.5)
    expect(peaks[0].max).toBe(0.2)
    expect(peaks[1].min).toBe(-0.1)
    expect(peaks[1].max).toBe(0.8)
  })

  test('compactPeaks reduces long traces without dropping extrema', function() {
    const peaks = []
    for (let i = 0; i < 20; i += 1) {
      peaks.push({ min: i === 3 ? -0.9 : -0.1, max: i === 11 ? 0.8 : 0.1 })
    }
    const compact = compactPeaks(peaks, 4)
    expect(compact.length).toBe(4)
    expect(Math.min.apply(null, compact.map(function(p) { return p.min }))).toBe(-0.9)
    expect(Math.max.apply(null, compact.map(function(p) { return p.max }))).toBe(0.8)
  })

  test('peaksDurationSeconds uses the live sample interval', function() {
    expect(peaksDurationSeconds([{ min: 0, max: 0.1 }, { min: 0, max: 0.2 }], 50)).toBeCloseTo(0.1, 5)
  })

  test('createLivePeakSampler liveMode uses a faster sample interval', function() {
    const sampler = createLivePeakSampler(null, { liveMode: true })
    expect(sampler.intervalMs).toBe(LIVE_PEAK_INTERVAL_MS)
    expect(LIVE_PEAK_INTERVAL_MS).toBeLessThan(50)
    expect(typeof sampler.stop).toBe('function')
    sampler.stop()
  })

  test('frequencyToMidiFloat maps A4 to MIDI 69', function() {
    expect(frequencyToMidiFloat(440)).toBeCloseTo(69, 5)
  })

  test('extractPitchPointsFromChannel follows a sine wave', function() {
    const sampleRate = 44100
    const freq = 440
    const channel = new Float32Array(sampleRate)
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sampleRate)
    }
    const points = extractPitchPointsFromChannel(channel, sampleRate)
    expect(points.length).toBeGreaterThan(3)
    const mid = points[Math.floor(points.length / 2)]
    expect(mid.rawMidi).toBeCloseTo(69, 0)
  })

  test('compactPitchPoints keeps a bounded trace', function() {
    const points = []
    for (let i = 0; i < 20; i += 1) points.push({ timeMs: i * 50, rawMidi: 60 })
    expect(compactPitchPoints(points, 5).length).toBe(5)
  })

  test('preferMonophonicFundamental chooses the lower octave when correlation supports it', function() {
    const sampleRate = 44100
    const fundamental = 293.66 // D4
    const harmonic = fundamental * 2
    const samples = new Float32Array(sampleRate)
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = 0.6 * Math.sin(2 * Math.PI * fundamental * i / sampleRate)
    }
    expect(preferMonophonicFundamental(harmonic, samples, sampleRate)).toBeCloseTo(fundamental, 0)
  })

  test('stabilizePitchPointSeries rejects one-frame octave spikes', function() {
    const points = [
      { timeMs: 0, rawMidi: 69 },
      { timeMs: 50, rawMidi: 69.2 },
      { timeMs: 100, rawMidi: 69.1 },
      { timeMs: 150, rawMidi: 81 }, // one-frame octave jump
      { timeMs: 200, rawMidi: 69.3 },
      { timeMs: 250, rawMidi: 69.0 },
    ]
    const stable = stabilizePitchPointSeries(points)
    expect(stable.length).toBe(points.length)
    expect(Math.abs(stable[3].rawMidi - 69)).toBeLessThan(3)
    expect(Math.abs(stable[4].rawMidi - 69)).toBeLessThan(3)
  })

  test('resolvePlayalongTakePitchPoints prefers dense session points over blob extract', async function() {
    const sessionPoints = []
    for (let i = 0; i < 12; i += 1) {
      sessionPoints.push({ timeMs: i * 50, rawMidi: 60 + (i % 2) * 0.1 })
    }
    const points = await resolvePlayalongTakePitchPoints(
      { recordingId: 'r1' },
      { r1: sessionPoints },
      { r1: { fake: true } },
      { tracking: playalongTrackingOptions({ cutoffPercent: 28, instrumentId: 'whistle', playbackGain: 0.12, repeats: 3 }) }
    )
    expect(points.length).toBe(sessionPoints.length)
    expect(Math.abs(points[0].rawMidi - 60)).toBeLessThan(1)
  })

  test('resolvePitchTrackerOptions applies cutoff RMS and instrument Hz', function() {
    const tracking = playalongTrackingOptions({
      cutoffPercent: 100,
      instrumentId: 'whistle',
      playbackGain: 0.12,
    })
    const resolved = resolvePitchTrackerOptions(tracking)
    expect(resolved.rmsFloor).toBeCloseTo(0.028, 5)
    expect(resolved.maxHz).toBeGreaterThan(1200)
  })

  test('extractPitchPointsFromChannel keeps high whistle notes when maxHz is raised', function() {
    const sampleRate = 44100
    const freq = 1479.98 // F#6, above the old 1200 Hz cap
    const channel = new Float32Array(sampleRate)
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sampleRate)
    }
    const tracking = playalongTrackingOptions({
      cutoffPercent: 50,
      instrumentId: 'whistle',
      playbackGain: 0.12,
    })
    const points = extractPitchPointsFromChannel(channel, sampleRate, tracking)
    expect(points.length).toBeGreaterThan(3)
    const mid = points[Math.floor(points.length / 2)]
    expect(mid.rawMidi).toBeCloseTo(90, 0)
  })

  test('extractPitchPointsFromChannel drops quiet frames below a high RMS floor', function() {
    const sampleRate = 44100
    const freq = 440
    const channel = new Float32Array(Math.floor(sampleRate * 0.4))
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = 0.006 * Math.sin(2 * Math.PI * freq * i / sampleRate)
    }
    const quiet = extractPitchPointsFromChannel(channel, sampleRate, { rmsFloor: 0.01, minHz: 65, maxHz: 1200 })
    const sensitive = extractPitchPointsFromChannel(channel, sampleRate, { rmsFloor: 0.003, minHz: 65, maxHz: 1200 })
    expect(quiet.length).toBe(0)
    expect(sensitive.length).toBeGreaterThan(0)
  })

  test('extractPitchPointsFromChannel samples more densely with a shorter interval', function() {
    const sampleRate = 44100
    const freq = 440
    const channel = new Float32Array(Math.floor(sampleRate * 0.5))
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sampleRate)
    }
    const sparse = extractPitchPointsFromChannel(channel, sampleRate, { intervalMs: 50, maxPoints: 5000 })
    const dense = extractPitchPointsFromChannel(channel, sampleRate, { intervalMs: 25, maxPoints: 5000 })
    expect(dense.length).toBeGreaterThan(sparse.length)
  })

  test('resolvePlayalongTakePitchPoints falls back to session points only without a blob', async function() {
    const sessionPoints = [
      { timeMs: 1000, rawMidi: 60 },
      { timeMs: 1500, rawMidi: 61 },
    ]
    const points = await resolvePlayalongTakePitchPoints(
      { recordingId: 'r1' },
      { r1: sessionPoints },
      {},
      { tracking: playalongTrackingOptions({ cutoffPercent: 28, instrumentId: 'whistle', playbackGain: 0.12, repeats: 3 }) }
    )
    expect(points).toEqual(sessionPoints)
  })
})
