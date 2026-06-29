import { AUDIO_FILTER_KEYS, STEM_NAME_BY_FILTER } from './pitchTempoUtils';

// Returns a buffer at the AudioContext's sample rate. SoundTouch derives its read
// position from `audioContext.sampleRate`, so any buffer whose own sample rate
// differs will have its position math overrun (silent-but-advancing playback).
export function resampleBufferToContextRate(audioContext, buffer) {
  if (!audioContext || !buffer) return buffer;
  const targetRate = audioContext.sampleRate;
  const srcRate = buffer.sampleRate || targetRate;
  if (srcRate === targetRate) return buffer;

  const channels = Math.max(1, buffer.numberOfChannels);
  const length = Math.max(1, Math.ceil((buffer.length / srcRate) * targetRate));
  const out = audioContext.createBuffer(channels, length, targetRate);
  const step = srcRate / targetRate;
  const lastIndex = buffer.length - 1;

  for (let ch = 0; ch < channels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const srcPos = i * step;
      const i0 = Math.floor(srcPos);
      if (i0 >= lastIndex) {
        dst[i] = src[lastIndex];
        continue;
      }
      const frac = srcPos - i0;
      dst[i] = src[i0] + (src[i0 + 1] - src[i0]) * frac;
    }
  }
  return out;
}

function resolveGain(audioFilters, filterKey) {
  const value = audioFilters && audioFilters[filterKey] !== undefined
    ? parseFloat(audioFilters[filterKey])
    : 1;
  return isFinite(value) ? value : 1;
}

// Builds a single stereo buffer from the separated stems with per-stem gains.
//
// The output buffer MUST be created at the AudioContext's sample rate. SoundTouch
// computes its read position as `ratio * duration * audioContext.sampleRate`, so a
// buffer created at a different rate (e.g. 44.1kHz stems played in a 48kHz context)
// makes the position overrun the buffer: extract() then returns no frames, time
// keeps advancing, and playback is silent (but "still playing"). Resampling each
// stem to the context rate keeps the buffer length consistent with that math.
export function mixStemBuffers(audioContext, stemBuffers, audioFilters) {
  if (!audioContext || !stemBuffers) {
    return null;
  }

  const buffers = AUDIO_FILTER_KEYS
    .map(function(key) { return stemBuffers[STEM_NAME_BY_FILTER[key]]; })
    .filter(Boolean);

  if (buffers.length === 0) {
    return null;
  }

  const targetRate = audioContext.sampleRate;
  const maxDuration = buffers.reduce(function(max, buffer) {
    const rate = buffer.sampleRate || targetRate;
    return Math.max(max, buffer.length / rate);
  }, 0);
  const length = Math.max(1, Math.ceil(maxDuration * targetRate));

  const mixed = audioContext.createBuffer(2, length, targetRate);
  const left = mixed.getChannelData(0);
  const right = mixed.getChannelData(1);

  AUDIO_FILTER_KEYS.forEach(function(filterKey) {
    const stemName = STEM_NAME_BY_FILTER[filterKey];
    const buffer = stemBuffers[stemName];
    if (!buffer) return;
    const gain = resolveGain(audioFilters, filterKey);
    if (gain <= 0) return;

    const srcLeft = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : null;
    if (!srcLeft) return;
    const srcRight = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcLeft;
    const srcRate = buffer.sampleRate || targetRate;

    if (srcRate === targetRate) {
      const count = Math.min(length, buffer.length);
      for (let i = 0; i < count; i += 1) {
        left[i] += srcLeft[i] * gain;
        right[i] += srcRight[i] * gain;
      }
      return;
    }

    // Linear resample from the stem rate to the context rate.
    const step = srcRate / targetRate;
    const lastIndex = buffer.length - 1;
    for (let i = 0; i < length; i += 1) {
      const srcPos = i * step;
      const i0 = Math.floor(srcPos);
      if (i0 >= lastIndex) break;
      const frac = srcPos - i0;
      const i1 = i0 + 1;
      left[i] += (srcLeft[i0] + (srcLeft[i1] - srcLeft[i0]) * frac) * gain;
      right[i] += (srcRight[i0] + (srcRight[i1] - srcRight[i0]) * frac) * gain;
    }
  });

  return mixed;
}
