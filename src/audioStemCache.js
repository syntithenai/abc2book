import localforage from 'localforage';
import { scheduleMediaCacheStorageCheck, tuneIdFromStemCacheKey } from './mediaCacheStorage';
import { encodeAudioBuffer, blobToArrayBuffer } from './audioCompressEncode';
import { getAudioCompressFormat, getAudioCompressExtension } from './audioCompressSettings';

const memoryCache = new Map();
const store = localforage.createInstance({ name: 'stemcache' });

export function forgetStemCacheKeys(keys) {
  (keys || []).forEach(function(key) {
    memoryCache.delete(key);
  });
}

export function getStemSourceCacheKey(tuneId, linkIndex, src, model) {
  const modelSuffix = model ? ':' + model : '';
  return 'stems:' + tuneId + ':' + linkIndex + ':' + src + modelSuffix;
}

// Legacy alias kept for callers that still pass cacheId.
export function getStemCacheKey(tuneId, linkIndex, src, cacheId, model) {
  return getStemSourceCacheKey(tuneId, linkIndex, src, model || cacheId);
}

async function decodeStemAudioBytes(arrayBuffer) {
  const decodeModule = await import('audio-decode');
  const decode = decodeModule.default || decodeModule;
  return decode(arrayBuffer);
}

function getStoredStemBytes(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.stemAudioBytes && typeof payload.stemAudioBytes === 'object') {
    return payload.stemAudioBytes;
  }
  if (payload.stemWavBytes && typeof payload.stemWavBytes === 'object') {
    return payload.stemWavBytes;
  }
  return null;
}

async function hydrateStemBuffers(stemBytes) {
  if (!stemBytes || typeof stemBytes !== 'object') {
    return null;
  }
  const stemBuffers = {};
  const names = Object.keys(stemBytes);
  await Promise.all(names.map(async function(stemName) {
    const bytes = stemBytes[stemName];
    if (!bytes) return;
    stemBuffers[stemName] = await decodeStemAudioBytes(bytes);
  }));
  return Object.keys(stemBuffers).length > 0 ? stemBuffers : null;
}

async function encodeStemBuffers(stemBuffers, format) {
  const stemAudioBytes = {};
  const names = Object.keys(stemBuffers || {});
  let actualFormat = format;
  await Promise.all(names.map(async function(stemName) {
    const buffer = stemBuffers[stemName];
    if (!buffer) return;
    const encoded = await encodeAudioBuffer(buffer, format);
    actualFormat = encoded.format;
    stemAudioBytes[stemName] = await blobToArrayBuffer(encoded.blob);
  }));
  return {
    stemAudioBytes: stemAudioBytes,
    audioFormat: actualFormat,
  };
}

function normalizeCachedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.stemBuffers) {
    return payload;
  }
  const stemBytes = getStoredStemBytes(payload);
  if (stemBytes) {
    return {
      separation: payload.separation || null,
      stemAudioBytes: stemBytes,
      stemWavBytes: stemBytes,
      audioFormat: payload.audioFormat || (payload.stemWavBytes && !payload.stemAudioBytes ? 'wav' : null),
    };
  }
  return null;
}

export async function getCachedStemSet(cacheKey) {
  const memory = memoryCache.get(cacheKey);
  if (memory && memory.stemBuffers) {
    return memory;
  }

  const stored = normalizeCachedPayload(await store.getItem(cacheKey));
  if (!stored) {
    return null;
  }

  if (stored.stemBuffers) {
    memoryCache.set(cacheKey, stored);
    return stored;
  }

  const stemBytes = getStoredStemBytes(stored);
  const stemBuffers = await hydrateStemBuffers(stemBytes);
  if (!stemBuffers) {
    return null;
  }

  const hydrated = {
    separation: stored.separation || null,
    stemBuffers: stemBuffers,
    stemAudioBytes: stemBytes,
    stemWavBytes: stemBytes,
    audioFormat: stored.audioFormat || null,
  };
  memoryCache.set(cacheKey, hydrated);
  return hydrated;
}

export async function saveCachedStemSet(cacheKey, payload) {
  const separation = payload && payload.separation ? payload.separation : null;
  let stemBuffers = payload && payload.stemBuffers ? payload.stemBuffers : null;
  let stemAudioBytes = payload && payload.stemAudioBytes ? payload.stemAudioBytes : null;
  let audioFormat = payload && payload.audioFormat ? payload.audioFormat : null;

  // Prefer encoding from decoded buffers so we persist the global compress format.
  if (stemBuffers && Object.keys(stemBuffers).length > 0) {
    const encoded = await encodeStemBuffers(stemBuffers, getAudioCompressFormat());
    stemAudioBytes = encoded.stemAudioBytes;
    audioFormat = encoded.audioFormat;
  } else if (!stemAudioBytes && payload && payload.stemWavBytes) {
    // Legacy callers may only pass WAV bytes — decode then encode.
    stemBuffers = await hydrateStemBuffers(payload.stemWavBytes);
    if (stemBuffers) {
      const encoded = await encodeStemBuffers(stemBuffers, getAudioCompressFormat());
      stemAudioBytes = encoded.stemAudioBytes;
      audioFormat = encoded.audioFormat;
    } else {
      stemAudioBytes = payload.stemWavBytes;
      audioFormat = 'wav';
    }
  }

  if (stemBuffers || stemAudioBytes) {
    memoryCache.set(cacheKey, {
      separation: separation,
      stemBuffers: stemBuffers,
      stemAudioBytes: stemAudioBytes,
      stemWavBytes: stemAudioBytes,
      audioFormat: audioFormat,
    });
  }

  if (!stemAudioBytes) {
    return;
  }

  await store.setItem(cacheKey, {
    separation: separation,
    stemAudioBytes: stemAudioBytes,
    // Keep legacy key for older readers during rollout.
    stemWavBytes: stemAudioBytes,
    audioFormat: audioFormat || getAudioCompressFormat(),
    cachedAt: Date.now(),
  });
  scheduleMediaCacheStorageCheck();
}

export function getStemDownloadExtension(audioFormat) {
  return getAudioCompressExtension(audioFormat || getAudioCompressFormat());
}

export async function clearStemCache(lockedTuneIds) {
  if (!lockedTuneIds || Object.keys(lockedTuneIds).length === 0) {
    memoryCache.clear();
    await store.clear();
  } else {
    const keysToRemove = [];
    await store.iterate(function(_value, key) {
      const tuneId = tuneIdFromStemCacheKey(key);
      if (!tuneId || !lockedTuneIds[tuneId]) {
        keysToRemove.push(key);
      }
    });
    forgetStemCacheKeys(keysToRemove);
    for (let i = 0; i < keysToRemove.length; i++) {
      await store.removeItem(keysToRemove[i]);
    }
  }
  scheduleMediaCacheStorageCheck(0);
}
