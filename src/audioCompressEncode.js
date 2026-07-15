import MP3Converter from './MP3Converter';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import {
  getAudioCompressExtension,
  getAudioCompressFormat,
  getAudioCompressMimeType,
  normalizeAudioCompressFormat,
} from './audioCompressSettings';

export const COMPRESS_BIT_RATE = 96000;

const MEDIA_RECORDER_AAC_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
];

function getAudioEncoder() {
  return typeof window !== 'undefined' ? window.AudioEncoder : undefined;
}

function getAudioData() {
  return typeof window !== 'undefined' ? window.AudioData : undefined;
}

export function pickMediaRecorderAacMimeType() {
  try {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
      return null;
    }
    const MediaRecorderApi = window.MediaRecorder;
    if (typeof MediaRecorderApi.isTypeSupported !== 'function') {
      return null;
    }
    for (let i = 0; i < MEDIA_RECORDER_AAC_TYPES.length; i += 1) {
      const mimeType = MEDIA_RECORDER_AAC_TYPES[i];
      if (MediaRecorderApi.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

export function isMediaRecorderAacSupported() {
  return !!pickMediaRecorderAacMimeType();
}

async function checkWebCodecsAacSupported() {
  const AudioEncoderApi = getAudioEncoder();
  const AudioDataApi = getAudioData();
  if (!AudioEncoderApi || !AudioDataApi || typeof AudioEncoderApi.isConfigSupported !== 'function') {
    return false;
  }
  try {
    const result = await AudioEncoderApi.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: COMPRESS_BIT_RATE,
    });
    return !!(result && result.supported);
  } catch (e) {
    return false;
  }
}

let aacSupportPromise = null;

/** Reset cached capability probe (tests). */
export function resetAudioCompressCapabilityCache() {
  aacSupportPromise = null;
}

/**
 * True when AAC can be encoded via WebCodecs or MediaRecorder.
 */
export async function checkAacEncodeSupported() {
  if (!aacSupportPromise) {
    aacSupportPromise = checkWebCodecsAacSupported().then(function(webCodecsOk) {
      if (webCodecsOk) return true;
      return isMediaRecorderAacSupported();
    });
  }
  return aacSupportPromise;
}

export async function getAudioCompressCapabilities() {
  const aac = await checkAacEncodeSupported();
  return {
    wav: true,
    mp3: true,
    aac: !!aac,
  };
}

/** Prefer requested format when supported; otherwise MP3 then WAV. */
export function coerceAudioCompressFormat(format, capabilities) {
  const requested = normalizeAudioCompressFormat(format);
  if (!capabilities) {
    return requested;
  }
  if (capabilities[requested]) {
    return requested;
  }
  if (capabilities.mp3) {
    return 'mp3';
  }
  return 'wav';
}

function resultForFormat(blob, format) {
  const normalized = normalizeAudioCompressFormat(format);
  return {
    blob: blob,
    mimeType: getAudioCompressMimeType(normalized),
    extension: getAudioCompressExtension(normalized),
    format: normalized,
  };
}

async function encodeMp3(audioBuffer) {
  const converter = new MP3Converter();
  const blob = await converter.convertAudioBuffer(audioBuffer, { bitRate: 96 });
  return resultForFormat(blob, 'mp3');
}

function copyPlanarChunk(audioBuffer, startFrame, frameCount) {
  const channels = audioBuffer.numberOfChannels;
  const data = new Float32Array(frameCount * channels);
  for (let ch = 0; ch < channels; ch += 1) {
    const channel = audioBuffer.getChannelData(ch);
    data.set(channel.subarray(startFrame, startFrame + frameCount), ch * frameCount);
  }
  return data;
}

async function encodeAacViaWebCodecs(audioBuffer) {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const numberOfChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: target,
    audio: {
      codec: 'aac',
      numberOfChannels: numberOfChannels,
      sampleRate: sampleRate,
    },
    fastStart: 'in-memory',
  });

  const AudioEncoderApi = getAudioEncoder();
  const AudioDataApi = getAudioData();
  if (!AudioEncoderApi || !AudioDataApi) {
    throw new Error('WebCodecs AAC encoding is not supported in this browser');
  }

  let encodeError = null;
  const encoder = new AudioEncoderApi({
    output: function(chunk, meta) {
      muxer.addAudioChunk(chunk, meta);
    },
    error: function(err) {
      encodeError = err;
    },
  });

  const config = {
    codec: 'mp4a.40.2',
    sampleRate: sampleRate,
    numberOfChannels: numberOfChannels,
    bitrate: COMPRESS_BIT_RATE,
  };
  const support = await AudioEncoderApi.isConfigSupported(config);
  if (!support || !support.supported) {
    encoder.close();
    throw new Error('WebCodecs AAC encoding is not supported in this browser');
  }
  encoder.configure(config);

  const framesPerChunk = 1024;
  let frameOffset = 0;
  while (frameOffset < audioBuffer.length) {
    const frameCount = Math.min(framesPerChunk, audioBuffer.length - frameOffset);
    let payload = copyPlanarChunk(audioBuffer, frameOffset, frameCount);
    if (audioBuffer.numberOfChannels > numberOfChannels) {
      payload = new Float32Array(frameCount * numberOfChannels);
      for (let ch = 0; ch < numberOfChannels; ch += 1) {
        payload.set(
          audioBuffer.getChannelData(ch).subarray(frameOffset, frameOffset + frameCount),
          ch * frameCount
        );
      }
    }

    const audioData = new AudioDataApi({
      format: 'f32-planar',
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
      numberOfFrames: frameCount,
      timestamp: Math.round((frameOffset / sampleRate) * 1e6),
      data: payload,
    });
    encoder.encode(audioData);
    audioData.close();
    frameOffset += frameCount;
    if (encodeError) {
      encoder.close();
      throw encodeError;
    }
  }

  await encoder.flush();
  encoder.close();
  if (encodeError) {
    throw encodeError;
  }
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'audio/mp4' });
  return resultForFormat(blob, 'aac');
}

async function encodeAacViaMediaRecorder(audioBuffer) {
  const mimeType = pickMediaRecorderAacMimeType();
  if (!mimeType) {
    throw new Error('MediaRecorder AAC encoding is not supported in this browser');
  }
  if (typeof window.AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') {
    throw new Error('AudioContext is required for MediaRecorder AAC encoding');
  }

  const AudioContextApi = window.AudioContext || window.webkitAudioContext;
  const numberOfChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate || 44100;
  const ctx = new AudioContextApi({ sampleRate: sampleRate });

  try {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      await ctx.resume();
    }

    const rendered = ctx.createBuffer(numberOfChannels, Math.max(1, audioBuffer.length), sampleRate);
    for (let ch = 0; ch < numberOfChannels; ch += 1) {
      const sourceChannel = audioBuffer.getChannelData(Math.min(ch, audioBuffer.numberOfChannels - 1));
      rendered.copyToChannel(sourceChannel.slice(0, rendered.length), ch);
    }

    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = rendered;
    source.connect(destination);

    const chunks = [];
    const recorder = new window.MediaRecorder(destination.stream, {
      mimeType: mimeType,
      audioBitsPerSecond: COMPRESS_BIT_RATE,
    });

    const stopped = new Promise(function(resolve, reject) {
      recorder.ondataavailable = function(event) {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = function() {
        reject(new Error('MediaRecorder AAC encode failed'));
      };
      recorder.onstop = function() {
        const containerType = mimeType.indexOf('audio/aac') === 0 ? 'audio/aac' : 'audio/mp4';
        resolve(new Blob(chunks, { type: containerType }));
      };
    });

    recorder.start(50);
    await new Promise(function(resolve, reject) {
      source.onended = resolve;
      try {
        source.start(0);
      } catch (e) {
        reject(e);
      }
    });
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    const blob = await stopped;
    if (!blob || !blob.size) {
      throw new Error('MediaRecorder AAC encode produced an empty blob');
    }
    return resultForFormat(blob, 'aac');
  } finally {
    if (typeof ctx.close === 'function') {
      try {
        await ctx.close();
      } catch (e) {
        // ignore close errors
      }
    }
  }
}

async function encodeAac(audioBuffer) {
  if (await checkWebCodecsAacSupported()) {
    try {
      return await encodeAacViaWebCodecs(audioBuffer);
    } catch (e) {
      // Fall through to MediaRecorder when WebCodecs configure/encode fails.
    }
  }
  return encodeAacViaMediaRecorder(audioBuffer);
}

/**
 * Encode an AudioBuffer to the requested compress format.
 * If AAC is requested but unavailable, falls back to MP3 and returns format: 'mp3'.
 */
export async function encodeAudioBuffer(audioBuffer, format) {
  const requested = normalizeAudioCompressFormat(format);
  if (!audioBuffer) {
    throw new Error('No audio buffer to encode');
  }

  if (requested === 'wav') {
    return resultForFormat(encodeAudioBufferToWav(audioBuffer), 'wav');
  }

  if (requested === 'mp3') {
    return encodeMp3(audioBuffer);
  }

  try {
    if (!(await checkAacEncodeSupported())) {
      return encodeMp3(audioBuffer);
    }
    return await encodeAac(audioBuffer);
  } catch (e) {
    return encodeMp3(audioBuffer);
  }
}

export async function encodeAudioBufferWithSetting(audioBuffer) {
  const capabilities = await getAudioCompressCapabilities();
  const format = coerceAudioCompressFormat(getAudioCompressFormat(), capabilities);
  return encodeAudioBuffer(audioBuffer, format);
}

export async function blobToArrayBuffer(blob) {
  if (!blob) return null;
  if (blob instanceof ArrayBuffer) return blob;
  return blob.arrayBuffer();
}
