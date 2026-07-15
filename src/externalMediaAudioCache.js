import localforage from 'localforage';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { scheduleMediaCacheStorageCheck, tuneIdFromExternalMediaCacheKey } from './mediaCacheStorage';
import { encodeAudioBufferWithSetting } from './audioCompressEncode';

const store = localforage.createInstance({ name: 'externalmediacache' });

export function getExternalMediaCacheKey(tuneId, linkIndex, src) {
  return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src;
}

export async function getCachedExternalMediaBlob(cacheKey) {
  const cached = await store.getItem(cacheKey);
  if (cached && cached.blob) {
    return cached;
  }
  return null;
}

export async function isExternalMediaCached(tuneId, linkIndex, src) {
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, src);
  const existing = await getCachedExternalMediaBlob(cacheKey);
  return !!(existing && existing.blob);
}

async function encodeAndStoreExternalMedia(cacheKey, decoded) {
  const encoded = await encodeAudioBufferWithSetting(decoded.audioBuffer);
  await store.setItem(cacheKey, {
    duration: decoded.duration,
    blob: encoded.blob,
    audioFormat: encoded.format,
    cachedAt: Date.now(),
  });
  scheduleMediaCacheStorageCheck();
  return {
    blob: encoded.blob,
    duration: decoded.duration,
    audioFormat: encoded.format,
    cached: false,
  };
}

/** Cached compressed linked media blob (format follows Compress Audio setting). */
export async function getExternalMediaMp3Blob(options) {
  const {
    tuneId,
    linkIndex,
    src,
    srcType,
    youtubeGetId,
    accessToken,
  } = options;

  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, src);
  const existing = await getCachedExternalMediaBlob(cacheKey);
  if (existing && existing.blob) {
    return {
      blob: existing.blob,
      duration: existing.duration,
      audioFormat: existing.audioFormat || null,
      cached: true,
    };
  }

  const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
  return encodeAndStoreExternalMedia(cacheKey, decoded);
}

export async function downloadAndCacheExternalMedia(options) {
  const {
    tuneId,
    linkIndex,
    src,
    srcType,
    youtubeGetId,
    accessToken,
  } = options;

  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, src);
  const existing = await getCachedExternalMediaBlob(cacheKey);
  if (existing && existing.blob) {
    return {
      cached: true,
      duration: existing.duration,
      audioFormat: existing.audioFormat || null,
    };
  }

  const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
  const stored = await encodeAndStoreExternalMedia(cacheKey, decoded);
  return {
    cached: false,
    duration: stored.duration,
    audioFormat: stored.audioFormat,
  };
}

export async function putExternalMediaCache(cacheKey, blob, duration, audioFormat) {
  await store.setItem(cacheKey, {
    duration: duration || null,
    blob: blob,
    audioFormat: audioFormat || null,
    cachedAt: Date.now(),
  });
  scheduleMediaCacheStorageCheck();
}

export async function clearExternalMediaCache(lockedTuneIds) {
  if (!lockedTuneIds || Object.keys(lockedTuneIds).length === 0) {
    await store.clear();
  } else {
    const keysToRemove = [];
    await store.iterate(function(_value, key) {
      const tuneId = tuneIdFromExternalMediaCacheKey(key);
      if (!tuneId || !lockedTuneIds[tuneId]) {
        keysToRemove.push(key);
      }
    });
    for (let i = 0; i < keysToRemove.length; i++) {
      await store.removeItem(keysToRemove[i]);
    }
  }
  scheduleMediaCacheStorageCheck(0);
}
