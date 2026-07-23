import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'

function renderTone(sampleRate, durationSec, channels, wave, frequency, amplitude) {
  const length = Math.max(1, Math.floor(durationSec * sampleRate))
  const buffer = new AudioBuffer({ numberOfChannels: channels, length: length, sampleRate: sampleRate })
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate
      let v = 0
      if (wave === 'sine') v = Math.sin(2 * Math.PI * frequency * t)
      else if (wave === 'square') v = Math.sin(2 * Math.PI * frequency * t) >= 0 ? 1 : -1
      else if (wave === 'sawtooth') v = 2 * ((frequency * t) % 1) - 1
      else v = 2 * Math.abs(2 * ((frequency * t) % 1) - 1) - 1
      data[i] = v * amplitude
    }
  }
  return buffer
}

function renderNoise(sampleRate, durationSec, channels, type, amplitude) {
  const length = Math.max(1, Math.floor(durationSec * sampleRate))
  const buffer = new AudioBuffer({ numberOfChannels: channels, length: length, sampleRate: sampleRate })
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      let v = white
      if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        v = b0 + b1 + b2 + white * 0.3104856
      } else if (type === 'brown') {
        b0 = (b0 + white * 0.02) / 1.02
        v = b0 * 3.5
      }
      data[i] = v * amplitude
    }
  }
  return buffer
}

export async function generateAudio(type, params) {
  const sampleRate = params.sampleRate || 48000
  const duration = Math.max(0.01, params.duration || 1)
  const channels = params.channels || 1
  const amplitude = params.amplitude != null ? params.amplitude : 0.5
  let buffer
  if (type === 'silence') {
    buffer = new AudioBuffer({
      numberOfChannels: channels,
      length: Math.floor(duration * sampleRate),
      sampleRate: sampleRate,
    })
  } else if (type === 'tone') {
    buffer = renderTone(sampleRate, duration, channels, params.wave || 'sine', params.frequency || 440, amplitude)
  } else if (type === 'noise') {
    buffer = renderNoise(sampleRate, duration, channels, params.noiseType || 'white', amplitude)
  } else if (type === 'rhythm') {
    const bpm = params.bpm || 120
    const beats = params.beats || 4
    const beatDur = 60 / bpm
    const total = beatDur * beats
    buffer = new AudioBuffer({
      numberOfChannels: channels,
      length: Math.floor(total * sampleRate),
      sampleRate: sampleRate,
    })
    for (let ch = 0; ch < channels; ch += 1) {
      const data = buffer.getChannelData(ch)
      for (let b = 0; b < beats; b += 1) {
        const start = Math.floor(b * beatDur * sampleRate)
        const clickLen = Math.min(Math.floor(0.02 * sampleRate), data.length - start)
        for (let i = 0; i < clickLen; i += 1) {
          data[start + i] = amplitude * (1 - i / clickLen)
        }
      }
    }
  } else {
    buffer = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: sampleRate })
  }
  return encodeAudioBufferToWav(buffer)
}

export const GENERATORS = [
  { id: 'silence', label: 'Silence' },
  { id: 'tone', label: 'Tone' },
  { id: 'noise', label: 'Noise' },
  { id: 'rhythm', label: 'Rhythm track' },
]
