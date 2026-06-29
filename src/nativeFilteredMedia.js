import { mixStemBuffers } from './audioStemMixer';
import { fetchStemBuffers, separateStemsFromSource } from './mediaStemClient';
import { getCachedStemSet, getStemSourceCacheKey, saveCachedStemSet } from './audioStemCache';

export function getNativeFilteredBlobCacheKey(cacheOptions, separationCacheId, audioFilters) {
  return [
    cacheOptions.tuneId,
    cacheOptions.linkIndex,
    cacheOptions.src,
    separationCacheId,
    JSON.stringify(audioFilters),
  ].join('|');
}

export async function loadStemBuffersForSource(cacheOptions, options) {
  const opts = options || {};
  const source = {
    kind: 'link',
    src: cacheOptions.src,
    srcType: cacheOptions.srcType,
    label: cacheOptions.label || '',
  };
  const cacheKey = getStemSourceCacheKey(
    cacheOptions.tuneId,
    cacheOptions.linkIndex,
    cacheOptions.src,
    cacheOptions.demucsModel || (opts.model || '')
  );

  if (!opts.forceRefresh) {
    const cached = await getCachedStemSet(cacheKey);
    if (cached && cached.stemBuffers) {
      return {
        separation: cached.separation,
        stemBuffers: cached.stemBuffers,
        fromCache: true,
      };
    }
  }

  if (!opts.allowNetworkSeparation) {
    return {
      separation: null,
      stemBuffers: null,
      fromCache: false,
    };
  }

  const separation = await separateStemsFromSource({
    source: source,
    accessToken: cacheOptions.accessToken,
    signal: opts.signal,
    onProgress: opts.onProgress,
    onStatus: opts.onStatus,
  });

  const cachedAfterSeparation = opts.forceRefresh ? null : await getCachedStemSet(cacheKey);
  if (cachedAfterSeparation && cachedAfterSeparation.stemBuffers) {
    return {
      separation: cachedAfterSeparation.separation || separation,
      stemBuffers: cachedAfterSeparation.stemBuffers,
      fromCache: true,
    };
  }

  const fetched = await fetchStemBuffers(separation, cacheOptions.accessToken, opts.signal);
  const saveKey = getStemSourceCacheKey(
    cacheOptions.tuneId,
    cacheOptions.linkIndex,
    cacheOptions.src,
    separation.model || cacheOptions.demucsModel || ''
  );
  await saveCachedStemSet(saveKey, {
    separation: separation,
    stemBuffers: fetched.stemBuffers,
    stemWavBytes: fetched.stemWavBytes,
  });
  return {
    separation: separation,
    stemBuffers: fetched.stemBuffers,
    fromCache: false,
  };
}

export function mixStemBuffersOffline(stemBuffers, audioFilters) {
  const buffers = Object.values(stemBuffers).filter(Boolean);
  if (buffers.length === 0) {
    return null;
  }

  const sampleRate = buffers[0].sampleRate || 44100;
  const maxDuration = buffers.reduce(function(max, buffer) {
    const rate = buffer.sampleRate || sampleRate;
    return Math.max(max, buffer.length / rate);
  }, 0);
  const length = Math.max(1, Math.ceil(maxDuration * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);
  return mixStemBuffers(offline, stemBuffers, audioFilters);
}

export function encodeAudioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let pos = 0;

  function writeString(value) {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(pos, value.charCodeAt(i));
      pos += 1;
    }
  }

  function writeUint32(value) {
    view.setUint32(pos, value, true);
    pos += 4;
  }

  function writeUint16(value) {
    view.setUint16(pos, value, true);
    pos += 2;
  }

  writeString('RIFF');
  writeUint32(36 + dataSize);
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16);
  writeUint16(1);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * blockAlign);
  writeUint16(blockAlign);
  writeUint16(16);
  writeString('data');
  writeUint32(dataSize);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch += 1) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, intSample, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function buildFilteredMediaBlob(cacheOptions, audioFilters, options) {
  const { separation, stemBuffers } = await loadStemBuffersForSource(cacheOptions, options);
  const mixed = mixStemBuffersOffline(stemBuffers, audioFilters);
  if (!mixed) {
    throw new Error('Stem mix produced no audio');
  }
  return {
    blob: encodeAudioBufferToWav(mixed),
    duration: mixed.duration,
    separation: separation,
  };
}
