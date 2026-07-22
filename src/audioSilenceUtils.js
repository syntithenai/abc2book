/**
 * Conservative silence detection and trim suggestions for audio scratchpad items.
 */

const DEFAULT_MIN_PADDING_SEC = 2.5
const DEFAULT_MAX_TRIM_RATIO = 0.15
const DEFAULT_SEGMENT_GAP_SEC = 1.5

export function rmsForWindow(samples, start, end) {
  let sum = 0
  const len = Math.max(0, end - start)
  if (len === 0) return 0
  for (let i = start; i < end; i += 1) {
    const v = samples[i] || 0
    sum += v * v
  }
  return Math.sqrt(sum / len)
}

export function detectSilenceRegions(channelData, sampleRate, options) {
  const opts = options || {}
  const threshold = opts.threshold != null ? opts.threshold : 0.015
  const minSilenceSec = opts.minSilenceSec != null ? opts.minSilenceSec : 0.35
  const minSilenceSamples = Math.floor(minSilenceSec * sampleRate)
  const regions = []
  let runStart = null

  for (let i = 0; i < channelData.length; i += Math.floor(sampleRate / 50)) {
    const windowEnd = Math.min(channelData.length, i + Math.floor(sampleRate / 50))
    const rms = rmsForWindow(channelData, i, windowEnd)
    const silent = rms < threshold
    if (silent && runStart == null) runStart = i
    if (!silent && runStart != null) {
      if (windowEnd - runStart >= minSilenceSamples) {
        regions.push({
          start: runStart / sampleRate,
          end: windowEnd / sampleRate,
        })
      }
      runStart = null
    }
  }
  if (runStart != null && channelData.length - runStart >= minSilenceSamples) {
    regions.push({
      start: runStart / sampleRate,
      end: channelData.length / sampleRate,
    })
  }
  return regions
}

export function suggestConservativeTrim(durationSec, silences, options) {
  const opts = options || {}
  const minPad = opts.minPaddingSec != null ? opts.minPaddingSec : DEFAULT_MIN_PADDING_SEC
  const maxTrimRatio = opts.maxTrimRatio != null ? opts.maxTrimRatio : DEFAULT_MAX_TRIM_RATIO
  const d = Math.max(0, durationSec || 0)
  if (d <= 0) return { start: 0, end: 0, duration: 0 }

  let start = 0
  let end = d

  const leading = silences.find(function(s) { return s.start <= minPad })
  if (leading) {
    const candidate = Math.max(0, leading.end - minPad * 0.25)
    const maxTrim = d * maxTrimRatio
    start = Math.min(candidate, maxTrim)
  }

  const trailing = silences.slice().reverse().find(function(s) {
    return s.end >= d - minPad
  })
  if (trailing) {
    const candidate = Math.min(d, trailing.start + minPad * 0.25)
    const maxTrim = d * maxTrimRatio
    end = Math.max(d - maxTrim, candidate)
  }

  if (end - start < d * 0.5) {
    return { start: 0, end: d, duration: d, conservativeFallback: true }
  }

  return { start: start, end: end, duration: Math.max(0, end - start) }
}

export function suggestSegmentMarkers(durationSec, silences, options) {
  const opts = options || {}
  const gap = opts.segmentGapSec != null ? opts.segmentGapSec : DEFAULT_SEGMENT_GAP_SEC
  const markers = [{ time: 0, label: 'Start' }]
  silences.forEach(function(region, index) {
    const gapLen = region.end - region.start
    if (gapLen >= gap) {
      const time = (region.start + region.end) / 2
      if (time > 0.5 && time < durationSec - 0.5) {
        markers.push({ time: time, label: 'Section ' + (markers.length) })
      }
    }
  })
  markers.push({ time: durationSec, label: 'End' })
  return markers
}

export async function analyzeAudioBuffer(audioBuffer, options) {
  const channel = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration
  const silences = detectSilenceRegions(channel, sampleRate, options)
  const trim = suggestConservativeTrim(duration, silences, options)
  const markers = suggestSegmentMarkers(duration, silences, options)
  return { silences: silences, trim: trim, markers: markers, duration: duration }
}

export async function decodeAudioBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    ctx.close()
  }
}

export function trimAudioBuffer(audioBuffer, startSec, endSec) {
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.max(0, Math.floor(startSec * sampleRate))
  const endSample = Math.min(audioBuffer.length, Math.ceil(endSec * sampleRate))
  const length = Math.max(0, endSample - startSample)
  const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, length, sampleRate)
  const trimmed = offlineCtx.createBuffer(audioBuffer.numberOfChannels, length, sampleRate)
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
    trimmed.getChannelData(ch).set(
      audioBuffer.getChannelData(ch).subarray(startSample, endSample)
    )
  }
  return trimmed
}

export function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataLength = audioBuffer.length * blockAlign
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < audioBuffer.length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function trimAudioBlob(blob, startSec, endSec) {
  const audioBuffer = await decodeAudioBlob(blob)
  const trimmed = trimAudioBuffer(audioBuffer, startSec, endSec)
  return audioBufferToWavBlob(trimmed)
}
