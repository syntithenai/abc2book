import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import { mixStemBuffers } from './audioStemMixer';
import { fetchStemBuffers, separateStemsFromSource } from './mediaStemClient';
import { getCachedStemSet, getStemSourceCacheKey, saveCachedStemSet } from './audioStemCache';

export { encodeAudioBufferToWav };

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
        stemWavBytes: cached.stemWavBytes || cached.stemAudioBytes || null,
        stemAudioBytes: cached.stemAudioBytes || cached.stemWavBytes || null,
        audioFormat: cached.audioFormat || null,
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
      stemWavBytes: cachedAfterSeparation.stemWavBytes || cachedAfterSeparation.stemAudioBytes || null,
      stemAudioBytes: cachedAfterSeparation.stemAudioBytes || cachedAfterSeparation.stemWavBytes || null,
      audioFormat: cachedAfterSeparation.audioFormat || null,
      fromCache: true,
    };
  }

  const fetched = await fetchStemBuffers(separation, cacheOptions.accessToken, opts.signal, {
    onProgress: opts.onProgress,
  });
  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Caching stems locally...', 95);
  }
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
  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Stems ready', 100);
  }
  const cachedAfterSave = await getCachedStemSet(saveKey);
  return {
    separation: separation,
    stemBuffers: fetched.stemBuffers,
    stemWavBytes: (cachedAfterSave && (cachedAfterSave.stemAudioBytes || cachedAfterSave.stemWavBytes)) || fetched.stemWavBytes,
    stemAudioBytes: cachedAfterSave && (cachedAfterSave.stemAudioBytes || cachedAfterSave.stemWavBytes),
    audioFormat: cachedAfterSave && cachedAfterSave.audioFormat,
    fromCache: false,
  };
}

export function mixStemBuffersOffline(stemBuffers, audioFilters) {
  const buffers = Object.values(stemBuffers).filter(Boolean);
  if (buffers.length === 0) {
    return null;
  }

  const nominalRate = buffers[0].sampleRate || 44100;
  const maxDuration = buffers.reduce(function(max, buffer) {
    const rate = buffer.sampleRate || nominalRate;
    return Math.max(max, buffer.length / rate);
  }, 0);
  // OfflineAudioContext may use the hardware rate instead of the requested one.
  const targetRate = new OfflineAudioContext(2, 1, nominalRate).sampleRate;
  const length = Math.max(1, Math.ceil(maxDuration * targetRate));
  const offline = new OfflineAudioContext(2, length, targetRate);
  return mixStemBuffers(offline, stemBuffers, audioFilters);
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
