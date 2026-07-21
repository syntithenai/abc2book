import {
  computeMagnitudeSpectrum,
  harmonicLevelsDb,
  harmonicRichness,
  pitchStatsFromCents,
  wolfScoreFromFeatures,
  extractNoteFeatures,
  summarizeSetFeatures,
  deltaSummary,
  recommendSoundpostMoves,
  rmsDb,
  spectralCentroidHz,
  timbreChipsFromDelta
} from './soundpostAnalysis'

function makeSine(freq, sampleRate, durationSec, amp) {
  const n = Math.floor(sampleRate * durationSec)
  const out = new Float32Array(n)
  const a = amp != null ? amp : 0.5
  for (let i = 0; i < n; i++) {
    out[i] = a * Math.sin(2 * Math.PI * freq * i / sampleRate)
  }
  return out
}

function makeHarmonicTone(f0, sampleRate, durationSec, harmonics) {
  const n = Math.floor(sampleRate * durationSec)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let h = 0; h < harmonics.length; h++) {
      s += harmonics[h] * Math.sin(2 * Math.PI * f0 * (h + 1) * i / sampleRate)
    }
    out[i] = s
  }
  return out
}

describe('soundpostAnalysis', function() {
  test('spectrum peaks near sine frequency', function() {
    const sr = 44100
    const samples = makeSine(440, sr, 0.2)
    const { magnitudes, freqs } = computeMagnitudeSpectrum(samples, sr)
    let peakI = 0
    for (let i = 1; i < magnitudes.length; i++) {
      if (magnitudes[i] > magnitudes[peakI]) peakI = i
    }
    expect(Math.abs(freqs[peakI] - 440)).toBeLessThan(30)
  })

  test('harmonic levels and richness', function() {
    const sr = 44100
    const samples = makeHarmonicTone(220, sr, 0.25, [0.5, 0.3, 0.2, 0.1])
    const { magnitudes, freqs } = computeMagnitudeSpectrum(samples, sr, { fftSize: 8192 })
    const harms = harmonicLevelsDb(magnitudes, freqs, 220, 4)
    expect(harms[0]).toBeGreaterThan(harms[3])
    const rich = harmonicRichness(harms)
    expect(rich).toBeGreaterThan(0)
  })

  test('pitchStatsFromCents', function() {
    const stats = pitchStatsFromCents([0, 1, -1, 0.5, -0.5])
    expect(stats.f0StdCents).toBeLessThan(1)
    expect(stats.inTuneRatio).toBe(1)
  })

  test('wolfScore rises with bad stability', function() {
    const good = wolfScoreFromFeatures({ f0StdCents: 1, inTuneRatio: 0.95, harmonicsDb: [-10], richness: 1 })
    const bad = wolfScoreFromFeatures({ f0StdCents: 15, inTuneRatio: 0.3, harmonicsDb: [-50], richness: 5 })
    expect(bad).toBeGreaterThan(good)
  })

  test('extractNoteFeatures returns bands', function() {
    const sr = 44100
    const samples = makeSine(300, sr, 0.2)
    const f = extractNoteFeatures(samples, sr, { f0Hz: 300, centsSamples: [0, 1, -1] })
    expect(f.bandDb.bass).toBeDefined()
    expect(f.rmsDb).toBeGreaterThan(-40)
    expect(f.centroidHz).toBeGreaterThan(0)
  })

  test('recommendSoundpostMoves for bowed family', function() {
    const baseline = summarizeSetFeatures([
      { features: { rmsDb: -20, centroidHz: 1000, richness: 1, f0StdCents: 2, inTuneRatio: 0.9, wolfScore: 0.1, bandDb: { bass: -25, body: -28, mid: -30, presence: -32 } } }
    ])
    const candidate = summarizeSetFeatures([
      { features: { rmsDb: -18, centroidHz: 1400, richness: 1.2, f0StdCents: 2, inTuneRatio: 0.9, wolfScore: 0.1, bandDb: { bass: -24, body: -27, mid: -28, presence: -28 } } }
    ])
    const delta = deltaSummary(baseline, candidate)
    const rec = recommendSoundpostMoves(delta, { instrumentA: 'violin', instrumentB: 'violin' })
    expect(rec).not.toBeNull()
    expect(rec.bullets.length).toBeGreaterThan(0)
    expect(recommendSoundpostMoves(delta, { instrumentA: 'guitar', instrumentB: 'guitar' })).toBeNull()
  })

  test('meyda-style flatness and timbre chips', function() {
    const sr = 44100
    const samples = makeSine(440, sr, 0.2)
    const f = extractNoteFeatures(samples, sr, { f0Hz: 440 })
    expect(f.spectralFlatness).toBeGreaterThanOrEqual(0)
    expect(f.spectralFlatness).toBeLessThan(0.5)
    expect(f.spectralRolloffHz).toBeGreaterThan(0)
    expect(f.melBands.length).toBe(8)
    const chips = timbreChipsFromDelta({ centroidHz: 120, richness: -0.2, spectralFlatness: 0.1 })
    expect(chips.indexOf('B is brighter than A')).toBeGreaterThan(-1)
    expect(chips.indexOf('B is thinner than A')).toBeGreaterThan(-1)
  })
})
