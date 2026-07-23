import { decodeAudioBlob, detectSilenceRegions } from './audioSilenceUtils'

export function measurePeakAndRms(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate
  const start = Math.floor(Math.max(0, startSec || 0) * sampleRate)
  const end = Math.ceil(Math.min(buffer.duration, endSec != null ? endSec : buffer.duration) * sampleRate)
  let peak = 0
  let sumSq = 0
  let count = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = start; i < end && i < data.length; i += 1) {
      const v = data[i]
      const abs = Math.abs(v)
      if (abs > peak) peak = abs
      sumSq += v * v
      count += 1
    }
  }
  const rms = count > 0 ? Math.sqrt(sumSq / count) : 0
  return {
    peak: peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    rms: rms,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
  }
}

export function findClippingRegions(buffer, threshold) {
  const t = threshold != null ? threshold : 0.999
  const sampleRate = buffer.sampleRate
  const regions = []
  let runStart = null
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) {
    const clipped = Math.abs(data[i]) >= t
    if (clipped && runStart == null) runStart = i
    if (!clipped && runStart != null) {
      regions.push({ start: runStart / sampleRate, end: i / sampleRate })
      runStart = null
    }
  }
  if (runStart != null) {
    regions.push({ start: runStart / sampleRate, end: data.length / sampleRate })
  }
  return regions
}

export function computeSpectrum(buffer, startSec, endSec, fftSize) {
  const size = fftSize || 2048
  const sampleRate = buffer.sampleRate
  const start = Math.floor(Math.max(0, startSec || 0) * sampleRate)
  const data = buffer.getChannelData(0)
  const windowed = new Float32Array(size)
  for (let i = 0; i < size && start + i < data.length; i += 1) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
    windowed[i] = (data[start + i] || 0) * w
  }
  const bins = []
  const binCount = Math.floor(size / 2)
  for (let k = 0; k < binCount; k += 1) {
    let re = 0
    let im = 0
    for (let n = 0; n < size; n += 1) {
      const angle = (-2 * Math.PI * k * n) / size
      re += windowed[n] * Math.cos(angle)
      im += windowed[n] * Math.sin(angle)
    }
    const mag = Math.sqrt(re * re + im * im) / size
    const freq = (k * sampleRate) / size
    bins.push({ freq: freq, magnitude: mag, db: mag > 0 ? 20 * Math.log10(mag) : -120 })
  }
  return bins
}

export function labelSoundsFromBuffer(buffer, options) {
  const opts = options || {}
  const gap = opts.minGapSec != null ? opts.minGapSec : 0.5
  const data = buffer.getChannelData(0)
  const silences = detectSilenceRegions(data, buffer.sampleRate, {
    threshold: opts.threshold || 0.02,
    minSilenceSec: gap,
  })
  const markers = []
  let lastEnd = 0
  silences.forEach(function(s, i) {
    if (s.start > lastEnd + 0.05) {
      markers.push({
        time: (lastEnd + s.start) / 2,
        label: 'Section ' + (markers.length + 1),
      })
    }
    lastEnd = s.end
  })
  if (lastEnd < buffer.duration - 0.05) {
    markers.push({ time: (lastEnd + buffer.duration) / 2, label: 'Section ' + (markers.length + 1) })
  }
  return markers
}

export function beatFinderMarkers(buffer, options) {
  const opts = options || {}
  const threshold = opts.thresholdPercent != null ? opts.thresholdPercent : 0.3
  const sampleRate = buffer.sampleRate
  const data = buffer.getChannelData(0)
  const window = Math.floor(sampleRate * 0.05)
  const energies = []
  for (let i = 0; i < data.length; i += window) {
    let sum = 0
    const end = Math.min(data.length, i + window)
    for (let j = i; j < end; j += 1) sum += data[j] * data[j]
    energies.push({ time: i / sampleRate, energy: Math.sqrt(sum / Math.max(1, end - i)) })
  }
  const maxE = energies.reduce(function(m, e) { return Math.max(m, e.energy) }, 0)
  const thresh = maxE * threshold
  const markers = []
  energies.forEach(function(e, i) {
    const prev = energies[i - 1]
    const next = energies[i + 1]
    if (e.energy >= thresh && (!prev || e.energy >= prev.energy) && (!next || e.energy >= next.energy)) {
      markers.push({ time: e.time, label: 'Beat' })
    }
  })
  return markers
}

export async function analyzeBlob(blob, type, selection, options) {
  const buffer = await decodeAudioBlob(blob)
  const start = selection && selection.start != null ? selection.start : 0
  const end = selection && selection.end > selection.start ? selection.end : buffer.duration
  if (type === 'rms') return measurePeakAndRms(buffer, start, end)
  if (type === 'clipping') return findClippingRegions(buffer)
  if (type === 'spectrum') return computeSpectrum(buffer, start, end)
  if (type === 'labelSounds') return labelSoundsFromBuffer(buffer, options)
  if (type === 'beats') return beatFinderMarkers(buffer, options)
  return null
}
