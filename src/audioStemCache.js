const memoryCache = new Map();

export function getStemCacheKey(tuneId, linkIndex, src, cacheId) {
  return 'stems:' + tuneId + ':' + linkIndex + ':' + cacheId + ':' + src;
}

export async function getCachedStemSet(cacheKey) {
  return memoryCache.get(cacheKey) || null;
}

export async function saveCachedStemSet(cacheKey, payload) {
  memoryCache.set(cacheKey, payload);
}
