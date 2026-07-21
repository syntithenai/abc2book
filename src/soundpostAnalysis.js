/**
 * Offline spectral feature extraction and soundpost recommendation heuristics
 * for Audio Analysis recording sets.
 */

export const BAND_LIMITS_HZ = {
  bass: { min: 0, max: 400 },
  body: { min: 400, max: 800 },
  mid: { min: 800, max: 2000 },
  presence: { min: 2000, max: 4000 }
}

export const BOWED_FAMILY = ['violin', 'viola', 'cello', 'bass']

/** Next-power-of-two FFT size helper */
export function nextPow2(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

function hannWindow(n) {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)))
  }
  return w
}

/** In-place radix-2 Cooley–Tukey FFT on interleaved complex (re, im) arrays of length N. */
function fftRadix2(re, im) {
  const n = re.length
  let j = 0
  for (let i = 0; i < n; i++) {
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp
      tmp = im[i]; im[i] = im[j]; im[j] = tmp
    }
    let m = n >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let k = 0; k < half; k++) {
        const i0 = i + k
        const i1 = i0 + half
        const tr = wr * re[i1] - wi * im[i1]
        const ti = wr * im[i1] + wi * re[i1]
        re[i1] = re[i0] - tr
        im[i1] = im[i0] - ti
        re[i0] += tr
        im[i0] += ti
        const nwr = wr * wRe - wi * wIm
        wi = wr * wIm + wi * wRe
        wr = nwr
      }
    }
  }
}

/**
 * Compute magnitude spectrum (linear) from mono Float32 PCM.
 * @returns {{ magnitudes: Float32Array, freqs: Float32Array, sampleRate: number, fftSize: number }}
 */
export function computeMagnitudeSpectrum(samples, sampleRate, options) {
  const opts = options || {}
  const minSize = opts.fftSize || 4096
  const n = nextPow2(Math.max(minSize, 256))
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  const win = hannWindow(Math.min(samples.length, n))
  const copyLen = Math.min(samples.length, n)
  for (let i = 0; i < copyLen; i++) {
    re[i] = samples[i] * (win[i] || 0)
  }
  fftRadix2(re, im)
  const half = n / 2 + 1
  const magnitudes = new Float32Array(half)
  const freqs = new Float32Array(half)
  for (let i = 0; i < half; i++) {
    magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n
    freqs[i] = (i * sampleRate) / n
  }
  return { magnitudes, freqs, sampleRate, fftSize: n }
}

export function magnitudeToDb(mag, floorDb) {
  const floor = floorDb != null ? floorDb : -100
  if (!mag || mag <= 0) return floor
  return Math.max(floor, 20 * Math.log10(mag))
}

export function rmsDb(samples) {
  if (!samples || !samples.length) return -100
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  const rms = Math.sqrt(sum / samples.length)
  return magnitudeToDb(rms)
}

export function spectralCentroidHz(magnitudes, freqs) {
  let num = 0
  let den = 0
  for (let i = 0; i < magnitudes.length; i++) {
    num += freqs[i] * magnitudes[i]
    den += magnitudes[i]
  }
  if (den <= 0) return 0
  return num / den
}

export function bandEnergyDb(magnitudes, freqs, minHz, maxHz) {
  let sum = 0
  for (let i = 0; i < magnitudes.length; i++) {
    if (freqs[i] >= minHz && freqs[i] < maxHz) sum += magnitudes[i] * magnitudes[i]
  }
  return magnitudeToDb(Math.sqrt(sum))
}

export function computeBandDb(magnitudes, freqs) {
  return {
    bass: bandEnergyDb(magnitudes, freqs, BAND_LIMITS_HZ.bass.min, BAND_LIMITS_HZ.bass.max),
    body: bandEnergyDb(magnitudes, freqs, BAND_LIMITS_HZ.body.min, BAND_LIMITS_HZ.body.max),
    mid: bandEnergyDb(magnitudes, freqs, BAND_LIMITS_HZ.mid.min, BAND_LIMITS_HZ.mid.max),
    presence: bandEnergyDb(magnitudes, freqs, BAND_LIMITS_HZ.presence.min, BAND_LIMITS_HZ.presence.max)
  }
}

function magAtHz(magnitudes, freqs, hz, halfWidthHz) {
  const hw = halfWidthHz != null ? halfWidthHz : 8
  let best = 0
  for (let i = 0; i < freqs.length; i++) {
    if (Math.abs(freqs[i] - hz) <= hw && magnitudes[i] > best) best = magnitudes[i]
  }
  return best
}

/**
 * Peak-pick harmonic magnitudes near n * f0.
 * @returns {number[]} dB levels for H1..H8
 */
export function harmonicLevelsDb(magnitudes, freqs, f0, count) {
  const n = count || 8
  const out = []
  if (!f0 || f0 <= 0) {
    for (let i = 0; i < n; i++) out.push(-100)
    return out
  }
  const binHz = freqs.length > 1 ? freqs[1] - freqs[0] : 1
  const halfWidth = Math.max(8, binHz * 2)
  for (let h = 1; h <= n; h++) {
    out.push(magnitudeToDb(magAtHz(magnitudes, freqs, f0 * h, halfWidth)))
  }
  return out
}

export function harmonicRichness(harmonicsDb) {
  if (!harmonicsDb || harmonicsDb.length < 2) return 0
  const h1Lin = Math.pow(10, harmonicsDb[0] / 20)
  if (h1Lin <= 0) return 0
  let sum = 0
  for (let i = 1; i < harmonicsDb.length; i++) {
    sum += Math.pow(10, harmonicsDb[i] / 20)
  }
  return sum / h1Lin
}

/**
 * Pitch stability from a list of cents samples (or frequencies vs target).
 */
export function pitchStatsFromCents(centsSamples) {
  const samples = (centsSamples || []).filter(function(c) { return c != null && Number.isFinite(c) })
  if (!samples.length) {
    return { f0StdCents: null, inTuneRatio: 0, timeToLockMs: null }
  }
  let sum = 0
  samples.forEach(function(c) { sum += c })
  const mean = sum / samples.length
  let varSum = 0
  samples.forEach(function(c) { varSum += (c - mean) * (c - mean) })
  const std = Math.sqrt(varSum / samples.length)
  const inTune = samples.filter(function(c) { return Math.abs(c) <= 15 }).length
  return {
    f0StdCents: std,
    inTuneRatio: inTune / samples.length,
    meanCents: mean
  }
}

/**
 * Simple wolf / problem-note score 0..1 from jitter, in-tune ratio, and weak H1.
 */
export function wolfScoreFromFeatures(features) {
  if (!features) return 0
  let score = 0
  const jitter = features.f0StdCents
  if (jitter != null) {
    if (jitter > 12) score += 0.45
    else if (jitter > 6) score += 0.25
    else if (jitter > 3) score += 0.1
  }
  if (features.inTuneRatio != null && features.inTuneRatio < 0.5) score += 0.3
  else if (features.inTuneRatio != null && features.inTuneRatio < 0.7) score += 0.15
  const harms = features.harmonicsDb || []
  if (harms.length && harms[0] < -40) score += 0.2
  if (features.richness != null && features.richness > 4 && jitter != null && jitter > 5) score += 0.1
  if (features.spectralFlatness != null && features.spectralFlatness > 0.35) score += 0.15
  if (features.spectralFlux != null && features.spectralFlux > 0.25) score += 0.1
  return Math.min(1, score)
}

/** Geometric/arithmetic mean flatness (Meyda-style), 0≈tone 1≈noise. */
export function spectralFlatness(magnitudes) {
  if (!magnitudes || !magnitudes.length) return 0
  let logSum = 0
  let sum = 0
  let n = 0
  for (let i = 1; i < magnitudes.length; i++) {
    const m = magnitudes[i]
    if (m <= 1e-12) continue
    logSum += Math.log(m)
    sum += m
    n++
  }
  if (!n || sum <= 0) return 0
  const geo = Math.exp(logSum / n)
  const arith = sum / n
  return Math.min(1, Math.max(0, geo / arith))
}

export function spectralRolloffHz(magnitudes, freqs, fraction) {
  const frac = fraction != null ? fraction : 0.85
  let total = 0
  for (let i = 0; i < magnitudes.length; i++) total += magnitudes[i]
  if (total <= 0) return 0
  let cum = 0
  const target = total * frac
  for (let i = 0; i < magnitudes.length; i++) {
    cum += magnitudes[i]
    if (cum >= target) return freqs[i]
  }
  return freqs[freqs.length - 1] || 0
}

export function spectralSpreadHz(magnitudes, freqs, centroid) {
  const c = centroid != null ? centroid : spectralCentroidHz(magnitudes, freqs)
  let num = 0
  let den = 0
  for (let i = 0; i < magnitudes.length; i++) {
    const d = freqs[i] - c
    num += magnitudes[i] * d * d
    den += magnitudes[i]
  }
  if (den <= 0) return 0
  return Math.sqrt(num / den)
}

/** Rough perceptual sharpness proxy from high-band vs total energy. */
export function perceptualSharpness(magnitudes, freqs) {
  let high = 0
  let total = 0
  for (let i = 0; i < magnitudes.length; i++) {
    const e = magnitudes[i] * magnitudes[i]
    total += e
    if (freqs[i] >= 2000) high += e
  }
  if (total <= 0) return 0
  return high / total
}

/**
 * Spectral flux vs a previous magnitude frame (L1 normalized).
 * If previous is null, returns 0.
 */
export function spectralFlux(magnitudes, previous) {
  if (!previous || !magnitudes || previous.length !== magnitudes.length) return 0
  let sum = 0
  let norm = 0
  for (let i = 0; i < magnitudes.length; i++) {
    const diff = magnitudes[i] - previous[i]
    if (diff > 0) sum += diff
    norm += magnitudes[i]
  }
  if (norm <= 0) return 0
  return Math.min(1, sum / norm)
}

/** Compact MFCC-like mel log energies (8 bands) for timbre distance. */
export function melBandEnergies(magnitudes, freqs, bandCount) {
  const n = bandCount || 8
  const maxF = freqs[freqs.length - 1] || 8000
  const bands = new Array(n)
  for (let b = 0; b < n; b++) bands[b] = 0
  for (let i = 0; i < magnitudes.length; i++) {
    const f = freqs[i]
    if (f <= 0 || f > maxF) continue
    const mel = 2595 * Math.log10(1 + f / 700)
    const melMax = 2595 * Math.log10(1 + maxF / 700)
    const idx = Math.min(n - 1, Math.floor((mel / melMax) * n))
    bands[idx] += magnitudes[i] * magnitudes[i]
  }
  return bands.map(function(e) { return magnitudeToDb(Math.sqrt(e)) })
}

export function mfccDistance(a, b) {
  if (!a || !b || !a.length || a.length !== b.length) return null
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum / a.length)
}

/** Find spectral peaks in a Hz range (for tap body-mode map). */
export function findSpectralPeaks(magnitudes, freqs, options) {
  const opts = options || {}
  const minHz = opts.minHz != null ? opts.minHz : 180
  const maxHz = opts.maxHz != null ? opts.maxHz : 1200
  const maxPeaks = opts.maxPeaks != null ? opts.maxPeaks : 8
  const minPromDb = opts.minPromDb != null ? opts.minPromDb : 6
  const candidates = []
  for (let i = 2; i < magnitudes.length - 2; i++) {
    const f = freqs[i]
    if (f < minHz || f > maxHz) continue
    const m = magnitudes[i]
    if (m <= magnitudes[i - 1] || m <= magnitudes[i + 1]) continue
    if (m <= magnitudes[i - 2] || m <= magnitudes[i + 2]) continue
    const neigh = (magnitudes[i - 2] + magnitudes[i + 2]) / 2
    const prom = magnitudeToDb(m) - magnitudeToDb(neigh)
    if (prom < minPromDb) continue
    candidates.push({ hz: f, db: magnitudeToDb(m), prominenceDb: prom })
  }
  candidates.sort(function(a, b) { return b.db - a.db })
  return candidates.slice(0, maxPeaks).sort(function(a, b) { return a.hz - b.hz })
}

/**
 * Extract features from a mono Float32Array buffer.
 */
export function extractNoteFeatures(samples, sampleRate, meta) {
  const m = meta || {}
  const spectrum = computeMagnitudeSpectrum(samples, sampleRate, { fftSize: m.fftSize })
  const bandDb = computeBandDb(spectrum.magnitudes, spectrum.freqs)
  const centroidHz = spectralCentroidHz(spectrum.magnitudes, spectrum.freqs)
  const f0 = m.f0Hz || 0
  const harmonicsDb = harmonicLevelsDb(spectrum.magnitudes, spectrum.freqs, f0, 8)
  const richness = harmonicRichness(harmonicsDb)
  const pitch = pitchStatsFromCents(m.centsSamples)
  const flatness = spectralFlatness(spectrum.magnitudes)
  const rolloffHz = spectralRolloffHz(spectrum.magnitudes, spectrum.freqs, 0.85)
  const spreadHz = spectralSpreadHz(spectrum.magnitudes, spectrum.freqs, centroidHz)
  const sharpness = perceptualSharpness(spectrum.magnitudes, spectrum.freqs)
  const flux = spectralFlux(spectrum.magnitudes, m.previousMagnitudes || null)
  const melBands = melBandEnergies(spectrum.magnitudes, spectrum.freqs, 8)
  const peaks = m.findPeaks
    ? findSpectralPeaks(spectrum.magnitudes, spectrum.freqs, m.peakOptions)
    : null

  const features = {
    f0Mean: f0 || null,
    f0StdCents: pitch.f0StdCents,
    timeToLockMs: m.timeToLockMs != null ? m.timeToLockMs : null,
    inTuneRatio: pitch.inTuneRatio,
    rmsDb: rmsDb(samples),
    centroidHz: centroidHz,
    bandDb: bandDb,
    harmonicsDb: harmonicsDb,
    richness: richness,
    spectralFlatness: flatness,
    spectralRolloffHz: rolloffHz,
    spectralSpreadHz: spreadHz,
    perceptualSharpness: sharpness,
    spectralFlux: flux,
    melBands: melBands,
    peaks: peaks,
    spectrumDb: Array.from(spectrum.magnitudes).map(function(mag) { return magnitudeToDb(mag) }),
    spectrumFreqs: Array.from(spectrum.freqs)
  }
  features.wolfScore = wolfScoreFromFeatures(features)
  return features
}

function avg(nums) {
  const v = (nums || []).filter(function(n) { return n != null && Number.isFinite(n) })
  if (!v.length) return null
  return v.reduce(function(a, b) { return a + b }, 0) / v.length
}

export function summarizeSetFeatures(notes) {
  const list = notes || []
  return {
    noteCount: list.length,
    rmsDb: avg(list.map(function(n) { return n.features && n.features.rmsDb })),
    centroidHz: avg(list.map(function(n) { return n.features && n.features.centroidHz })),
    richness: avg(list.map(function(n) { return n.features && n.features.richness })),
    f0StdCents: avg(list.map(function(n) { return n.features && n.features.f0StdCents })),
    inTuneRatio: avg(list.map(function(n) { return n.features && n.features.inTuneRatio })),
    wolfMean: avg(list.map(function(n) { return n.features && n.features.wolfScore })),
    spectralFlatness: avg(list.map(function(n) { return n.features && n.features.spectralFlatness })),
    spectralRolloffHz: avg(list.map(function(n) { return n.features && n.features.spectralRolloffHz })),
    spectralSpreadHz: avg(list.map(function(n) { return n.features && n.features.spectralSpreadHz })),
    perceptualSharpness: avg(list.map(function(n) { return n.features && n.features.perceptualSharpness })),
    spectralFlux: avg(list.map(function(n) { return n.features && n.features.spectralFlux })),
    bandDb: {
      bass: avg(list.map(function(n) { return n.features && n.features.bandDb && n.features.bandDb.bass })),
      body: avg(list.map(function(n) { return n.features && n.features.bandDb && n.features.bandDb.body })),
      mid: avg(list.map(function(n) { return n.features && n.features.bandDb && n.features.bandDb.mid })),
      presence: avg(list.map(function(n) { return n.features && n.features.bandDb && n.features.bandDb.presence }))
    }
  }
}

export function deltaSummary(baselineSummary, candidateSummary) {
  function d(a, b) {
    if (a == null || b == null) return null
    return b - a
  }
  const a = baselineSummary || {}
  const b = candidateSummary || {}
  const ab = a.bandDb || {}
  const bb = b.bandDb || {}
  return {
    rmsDb: d(a.rmsDb, b.rmsDb),
    centroidHz: d(a.centroidHz, b.centroidHz),
    richness: d(a.richness, b.richness),
    f0StdCents: d(a.f0StdCents, b.f0StdCents),
    inTuneRatio: d(a.inTuneRatio, b.inTuneRatio),
    wolfMean: d(a.wolfMean, b.wolfMean),
    spectralFlatness: d(a.spectralFlatness, b.spectralFlatness),
    spectralRolloffHz: d(a.spectralRolloffHz, b.spectralRolloffHz),
    spectralSpreadHz: d(a.spectralSpreadHz, b.spectralSpreadHz),
    perceptualSharpness: d(a.perceptualSharpness, b.perceptualSharpness),
    spectralFlux: d(a.spectralFlux, b.spectralFlux),
    bandDb: {
      bass: d(ab.bass, bb.bass),
      body: d(ab.body, bb.body),
      mid: d(ab.mid, bb.mid),
      presence: d(ab.presence, bb.presence)
    }
  }
}

/** Plain-language timbre chips from B−A deltas. */
export function timbreChipsFromDelta(delta) {
  const d = delta || {}
  const chips = []
  if (d.centroidHz != null && Math.abs(d.centroidHz) > 60) {
    chips.push(d.centroidHz > 0 ? 'B is brighter than A' : 'B is darker than A')
  }
  if (d.richness != null && Math.abs(d.richness) > 0.12) {
    chips.push(d.richness > 0 ? 'B is richer than A' : 'B is thinner than A')
  }
  if (d.spectralFlatness != null && Math.abs(d.spectralFlatness) > 0.04) {
    chips.push(d.spectralFlatness > 0 ? 'B is noisier than A' : 'B is cleaner than A')
  }
  if (d.perceptualSharpness != null && Math.abs(d.perceptualSharpness) > 0.04) {
    chips.push(d.perceptualSharpness > 0 ? 'B is sharper than A' : 'B is softer than A')
  }
  if (d.f0StdCents != null && Math.abs(d.f0StdCents) > 1) {
    chips.push(d.f0StdCents > 0 ? 'B is less stable than A' : 'B is more stable than A')
  }
  return chips
}

export function playingQcWarnings(baselineSummary, candidateSummary) {
  const warnings = []
  const a = baselineSummary || {}
  const b = candidateSummary || {}
  if (a.rmsDb != null && b.rmsDb != null && Math.abs(b.rmsDb - a.rmsDb) > 4) {
    warnings.push('Overall level differs by more than 4 dB — bow force or mic distance may explain part of the change.')
  }
  if (a.spectralFlux != null && b.spectralFlux != null && Math.abs(b.spectralFlux - a.spectralFlux) > 0.12) {
    warnings.push('Spectral flux differs a lot — one take may be less steady (scratchier or more variable).')
  }
  if (a.inTuneRatio != null && b.inTuneRatio != null && Math.abs(b.inTuneRatio - a.inTuneRatio) > 0.2) {
    warnings.push('In-tune lock rate differs substantially — compare playability carefully.')
  }
  return warnings
}

export function averageMelBands(notes) {
  const list = (notes || []).filter(function(n) {
    return n.features && n.features.melBands && n.features.melBands.length
  })
  if (!list.length) return null
  const len = list[0].features.melBands.length
  const out = new Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = avg(list.map(function(n) { return n.features.melBands[i] }))
  }
  return out
}

export function isBowedFamilyInstrument(instrument) {
  return BOWED_FAMILY.indexOf(instrument) !== -1
}

/**
 * Caveated soundpost move suggestions from B−A deltas.
 * @returns {{ bullets: string[], disclaimer: string }|null}
 */
export function recommendSoundpostMoves(delta, options) {
  const opts = options || {}
  const instrumentA = opts.instrumentA
  const instrumentB = opts.instrumentB
  if (!isBowedFamilyInstrument(instrumentA) || !isBowedFamilyInstrument(instrumentB)) {
    return null
  }
  const d = delta || {}
  const bands = d.bandDb || {}
  const scored = []

  function push(score, text) {
    scored.push({ score: score, text: text })
  }

  if ((bands.bass != null && bands.bass < -1.5) || (bands.body != null && bands.body < -1.5)) {
    const drop = Math.min(bands.bass != null ? bands.bass : 0, bands.body != null ? bands.body : 0)
    push(Math.abs(drop), 'Bass/body energy dropped. Check post fit/contact (leaning or loose), then try a slightly firmer fit or a small move that improves low-frequency coupling — often slightly toward the bridge. Re-measure after one change.')
  }
  if ((bands.bass != null && bands.bass > 1.5) && (bands.presence != null && bands.presence < -1)) {
    push(Math.abs(bands.bass) + Math.abs(bands.presence), 'Bass rose but presence/brightness fell. Post may be over-coupling the bass side — try a small move toward the treble f-hole or slightly closer to the bridge, then re-record.')
  }
  if ((bands.presence != null && bands.presence > 1.5) || (d.centroidHz != null && d.centroidHz > 80)) {
    const score = Math.max(Math.abs(bands.presence || 0), Math.abs((d.centroidHz || 0) / 40))
    push(score, 'Sound got brighter/sharper (presence or centroid up). That often means the post is closer to the bridge; to soften, try a small move away from the bridge.')
  }
  if ((d.wolfMean != null && d.wolfMean > 0.08) || (d.f0StdCents != null && d.f0StdCents > 1.5)) {
    push(Math.abs(d.wolfMean || 0) * 10 + Math.abs(d.f0StdCents || 0), 'Pitch stability worsened or problem-note score rose. Try a small lateral move to shift body modes (toward the center tends to raise B1±; toward the treble f-hole tends to lower them), and re-test the unstable notes.')
  }
  if (d.inTuneRatio != null && d.inTuneRatio < -0.08) {
    push(Math.abs(d.inTuneRatio) * 20, 'Fewer notes locked in tune easily. Prioritize evenness over peak brightness — small lateral moves and re-run the full note grid.')
  }
  if (d.rmsDb != null && d.rmsDb < -2 && (bands.bass == null || Math.abs(bands.bass) < 1)) {
    push(Math.abs(d.rmsDb), 'Overall level fell with a similar band shape. Check fit/contact before chasing position.')
  }
  if (d.richness != null && d.richness > 0.15) {
    push(Math.abs(d.richness) * 5, 'Harmonic richness increased (more overtone energy relative to the fundamental). Keep mic distance and bow force matched so this reflects the instrument, not playing.')
  }
  if (d.richness != null && d.richness < -0.15) {
    push(Math.abs(d.richness) * 5, 'Harmonic richness decreased (thinner tone). If unintended, try modest moves that restore mid/presence balance and re-check open strings.')
  }

  scored.sort(function(a, b) { return b.score - a.score })
  const bullets = scored.slice(0, 3).map(function(s) { return s.text })
  if (!bullets.length) {
    bullets.push('Changes look small or mixed. Make one small (~1 mm) adjustment at a time and re-record the same sequence for a clearer signal.')
  }
  bullets.push('Re-record after a single change. Bow force strongly affects brightness — keep bowing as consistent as possible.')

  return {
    bullets: bullets,
    disclaimer: 'These are heuristics from radiated-sound comparisons, not lab admittance measurements. They do not prescribe a “correct” post position — use ears and feel, and consult a luthier for invasive work.'
  }
}

/**
 * Average spectrumDb arrays (same length) from notes that have spectrum data.
 * @param {Array} notes
 * @param {string} [featuresKey] — 'features' (default / L) or 'featuresR' (R / piezo)
 */
export function averageSpectrum(notes, featuresKey) {
  const key = featuresKey || 'features'
  const withSpec = (notes || []).filter(function(n) {
    return n[key] && n[key].spectrumDb && n[key].spectrumDb.length
  })
  if (!withSpec.length) return null
  const len = withSpec[0][key].spectrumDb.length
  const avgDb = new Array(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    let count = 0
    withSpec.forEach(function(n) {
      if (n[key].spectrumDb[i] != null) {
        sum += n[key].spectrumDb[i]
        count++
      }
    })
    avgDb[i] = count ? sum / count : -100
  }
  return {
    spectrumDb: avgDb,
    spectrumFreqs: withSpec[0][key].spectrumFreqs
  }
}
