import localforage from 'localforage';

const memoryCache = new Map();
const store = localforage.createInstance({ name: 'stemcache' });

export function getStemSourceCacheKey(tuneId, linkIndex, src, model) {
  const modelSuffix = model ? ':' + model : '';
  return 'stems:' + tuneId + ':' + linkIndex + ':' + src + modelSuffix;
}

// Legacy alias kept for callers that still pass cacheId.
export function getStemCacheKey(tuneId, linkIndex, src, cacheId, model) {
  return getStemSourceCacheKey(tuneId, linkIndex, src, model || cacheId);
}

async function decodeStemWavBytes(arrayBuffer) {
  const decodeModule = await import('audio-decode');
  const decode = decodeModule.default || decodeModule;
  return decode(arrayBuffer);
}

async function hydrateStemBuffers(stemWavBytes) {
  if (!stemWavBytes || typeof stemWavBytes !== 'object') {
    return null;
  }
  const stemBuffers = {};
  const names = Object.keys(stemWavBytes);
  await Promise.all(names.map(async function(stemName) {
    const bytes = stemWavBytes[stemName];
    if (!bytes) return;
    stemBuffers[stemName] = await decodeStemWavBytes(bytes);
  }));
  return Object.keys(stemBuffers).length > 0 ? stemBuffers : null;
}

function normalizeCachedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.stemBuffers) {
    return payload;
  }
  if (payload.stemWavBytes) {
    return {
      separation: payload.separation || null,
      stemWavBytes: payload.stemWavBytes,
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

  const stemBuffers = await hydrateStemBuffers(stored.stemWavBytes);
  if (!stemBuffers) {
    return null;
  }

  const hydrated = {
    separation: stored.separation || null,
    stemBuffers: stemBuffers,
  };
  memoryCache.set(cacheKey, hydrated);
  return hydrated;
}

export async function saveCachedStemSet(cacheKey, payload) {
  const next = {
    separation: payload && payload.separation ? payload.separation : null,
    stemBuffers: payload && payload.stemBuffers ? payload.stemBuffers : null,
    stemWavBytes: payload && payload.stemWavBytes ? payload.stemWavBytes : null,
  };
  if (next.stemBuffers) {
    memoryCache.set(cacheKey, {
      separation: next.separation,
      stemBuffers: next.stemBuffers,
    });
  }
  const persistable = {
    separation: next.separation,
    stemWavBytes: next.stemWavBytes,
    cachedAt: Date.now(),
  };
  if (!persistable.stemWavBytes) {
    return;
  }
  await store.setItem(cacheKey, persistable);
}

export async function clearStemCache() {
  memoryCache.clear();
  await store.clear();
}
