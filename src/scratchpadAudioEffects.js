import { decodeAudioBlob } from './audioSilenceUtils'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'

function extractSelection(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate
  const start = Math.max(0, Math.floor(startSec * sampleRate))
  const end = Math.min(buffer.length, Math.ceil(endSec * sampleRate))
  const length = Math.max(1, end - start)
  const offline = new OfflineAudioContext(buffer.numberOfChannels, length, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0, start / sampleRate, length / sampleRate)
  return offline.startRendering()
}

function replaceSelection(fullBuffer, selectionBuffer, startSec) {
  const sampleRate = fullBuffer.sampleRate
  const channels = fullBuffer.numberOfChannels
  const startSample = Math.floor(Math.max(0, startSec) * sampleRate)
  const outLength = Math.max(fullBuffer.length, startSample + selectionBuffer.length)
  const offline = new OfflineAudioContext(channels, outLength, sampleRate)
  const dest = offline.createGain()
  dest.connect(offline.destination)
  const before = offline.createBufferSource()
  before.buffer = fullBuffer
  before.connect(dest)
  before.start(0, 0, startSample / sampleRate)
  const mid = offline.createBufferSource()
  mid.buffer = selectionBuffer
  mid.connect(dest)
  mid.start(startSample / sampleRate)
  const afterStart = (startSample + selectionBuffer.length) / sampleRate
  if (afterStart * sampleRate < fullBuffer.length) {
    const after = offline.createBufferSource()
    after.buffer = fullBuffer
    after.connect(dest)
    after.start(afterStart, afterStart, (fullBuffer.length / sampleRate) - afterStart)
  }
  return offline.startRendering()
}

function peakDb(buffer) {
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i += 1) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  if (peak <= 0) return -Infinity
  return 20 * Math.log10(peak)
}

function applyGainBuffer(buffer, gainLinear) {
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  )
  const gain = offline.createGain()
  gain.gain.value = gainLinear
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(gain)
  gain.connect(offline.destination)
  source.start(0)
  return offline.startRendering()
}

export function computeNormalizeGain(buffer, targetDb) {
  const current = peakDb(buffer)
  if (!Number.isFinite(current) || current === -Infinity) return 1
  const target = targetDb != null ? targetDb : -1
  const dbDiff = target - current
  return Math.pow(10, dbDiff / 20)
}

export function computeAmplifyGain(db) {
  return Math.pow(10, (Number(db) || 0) / 20)
}

async function applyEq(buffer, opts) {
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  )
  const low = offline.createBiquadFilter()
  low.type = 'lowshelf'
  low.frequency.value = opts.lowFreq || 200
  low.gain.value = opts.lowGainDb || 0
  const mid = offline.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = opts.midFreq || 1000
  mid.Q.value = opts.midQ || 1
  mid.gain.value = opts.midGainDb || 0
  const high = offline.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = opts.highFreq || 4000
  high.gain.value = opts.highGainDb || 0
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(low)
  low.connect(mid)
  mid.connect(high)
  high.connect(offline.destination)
  source.start(0)
  return offline.startRendering()
}

function buildImpulse(sampleRate, durationSec) {
  const length = Math.floor(sampleRate * durationSec)
  const impulse = new AudioBuffer({ numberOfChannels: 2, length: length, sampleRate: sampleRate })
  for (let ch = 0; ch < 2; ch += 1) {
    const data = impulse.getChannelData(ch)
    data[0] = 1
    for (let i = 1; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5)
    }
  }
  return impulse
}

async function applyCompressor(buffer, opts) {
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  )
  const comp = offline.createDynamicsCompressor()
  comp.threshold.value = opts.threshold != null ? opts.threshold : -24
  comp.knee.value = opts.knee != null ? opts.knee : 30
  comp.ratio.value = opts.ratio != null ? opts.ratio : 12
  comp.attack.value = opts.attack != null ? opts.attack : 0.003
  comp.release.value = opts.release != null ? opts.release : 0.25
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(comp)
  comp.connect(offline.destination)
  source.start(0)
  return offline.startRendering()
}

async function applyFilter(buffer, type, opts) {
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  )
  const filter = offline.createBiquadFilter()
  filter.type = type
  filter.frequency.value = opts.frequency || (type === 'highpass' ? 80 : 8000)
  filter.Q.value = opts.q != null ? opts.q : 0.7
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(filter)
  filter.connect(offline.destination)
  source.start(0)
  return offline.startRendering()
}

async function applyPlaybackRate(buffer, rate) {
  const r = Math.max(0.25, Math.min(4, Number(rate) || 1))
  const outLength = Math.max(1, Math.floor(buffer.length / r))
  const offline = new OfflineAudioContext(buffer.numberOfChannels, outLength, buffer.sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = r
  source.connect(offline.destination)
  source.start(0)
  return offline.startRendering()
}

async function applyNoiseReduction(buffer, opts) {
  const threshold = opts.threshold != null ? opts.threshold : 0.02
  const reduction = opts.reduction != null ? opts.reduction : 0.5
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch)
    const dst = out.getChannelData(ch)
    for (let i = 0; i < src.length; i += 1) {
      const v = src[i]
      dst[i] = Math.abs(v) < threshold ? v * reduction : v
    }
  }
  return out
}

async function applyReverb(buffer, opts) {
  const sampleRate = buffer.sampleRate
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length + Math.floor(sampleRate * (opts.decay || 1.5)),
    sampleRate
  )
  const convolver = offline.createConvolver()
  convolver.buffer = buildImpulse(sampleRate, opts.decay || 1.5)
  const dry = offline.createGain()
  const wet = offline.createGain()
  const mix = opts.mix != null ? opts.mix : 0.35
  dry.gain.value = 1 - mix
  wet.gain.value = mix
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(dry)
  source.connect(convolver)
  convolver.connect(wet)
  dry.connect(offline.destination)
  wet.connect(offline.destination)
  source.start(0)
  return offline.startRendering()
}

async function processBuffer(buffer, effectId, params, selection) {
  let working = buffer
  if (selection && selection.end > selection.start) {
    working = await extractSelection(buffer, selection.start, selection.end)
  }
  let processed = working
  if (effectId === 'normalize') {
    const gain = computeNormalizeGain(working, params.targetDb)
    processed = await applyGainBuffer(working, gain)
  } else if (effectId === 'amplify') {
    processed = await applyGainBuffer(working, computeAmplifyGain(params.db))
  } else if (effectId === 'eq') {
    processed = await applyEq(working, params || {})
  } else if (effectId === 'reverb') {
    processed = await applyReverb(working, params || {})
  } else if (effectId === 'compressor') {
    processed = await applyCompressor(working, params || {})
  } else if (effectId === 'highpass') {
    processed = await applyFilter(working, 'highpass', params || {})
  } else if (effectId === 'lowpass') {
    processed = await applyFilter(working, 'lowpass', params || {})
  } else if (effectId === 'changeTempo') {
    processed = await applyPlaybackRate(working, params.rate || 1)
  } else if (effectId === 'changePitch') {
    processed = await applyPlaybackRate(working, params.semitones != null ? Math.pow(2, params.semitones / 12) : 1)
  } else if (effectId === 'noiseReduction') {
    processed = await applyNoiseReduction(working, params || {})
  }
  if (selection && selection.end > selection.start) {
    return replaceSelection(buffer, processed, selection.start)
  }
  return processed
}

export async function applyAudioEffectToBlob(blob, effectId, params, selection) {
  const buffer = await decodeAudioBlob(blob)
  const result = await processBuffer(buffer, effectId, params || {}, selection)
  return encodeAudioBufferToWav(result)
}

export const AUDIO_EFFECTS = [
  { id: 'normalize', label: 'Normalize', defaultParams: { targetDb: -1 } },
  { id: 'amplify', label: 'Amplify', defaultParams: { db: 3 } },
  { id: 'eq', label: 'EQ', defaultParams: { lowGainDb: 0, midGainDb: 0, highGainDb: 0 } },
  { id: 'reverb', label: 'Reverb', defaultParams: { mix: 0.35, decay: 1.5 } },
  { id: 'compressor', label: 'Compressor', defaultParams: { threshold: -24, ratio: 12 } },
  { id: 'highpass', label: 'High-pass filter', defaultParams: { frequency: 80 } },
  { id: 'lowpass', label: 'Low-pass filter', defaultParams: { frequency: 8000 } },
  { id: 'changeTempo', label: 'Change tempo', defaultParams: { rate: 1.1 } },
  { id: 'changePitch', label: 'Change pitch', defaultParams: { semitones: 2 } },
  { id: 'noiseReduction', label: 'Noise reduction', defaultParams: { threshold: 0.02, reduction: 0.5 } },
]
