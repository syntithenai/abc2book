import localforage from 'localforage';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import {
  blobForHtmlAudioPlayback,
  fetchPlayableAudioBlob,
  requiresResolverProxiedPlayback,
} from './mediaProxyClient';
import { scheduleMediaCacheStorageCheck, parseExternalMediaCacheKey, tuneIdFromExternalMediaCacheKey } from './mediaCacheStorage';
import { encodeAudioBufferWithSetting } from './audioCompressEncode';
import { isAndroidApp } from './platformUtils';
import {
  clearDiskMediaCache,
  diskMediaCacheHasEntry,
  persistExternalMediaToDisk,
  readExternalMediaFromDisk,
  removeDiskMediaCacheEntry,
} from './mediaCacheShare';

const store = localforage.createInstance({ name: 'externalmediacache' });

export function getExternalMediaCacheKey(tuneId, linkIndex, src) {
  return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src;
}

/**
 * Rewrite localforage row as metadata-only (no blob). Used by Android migration.
 */
export async function rewriteExternalMediaCacheMetadataOnly(cacheKey, meta) {
  await store.setItem(cacheKey, {
    duration: meta.duration || null,
    audioFormat: meta.audioFormat || null,
    cachedAt: meta.cachedAt || Date.now(),
    fileName: meta.fileName || null,
    size: typeof meta.size === 'number' ? meta.size : 0,
  });
}

async function hydrateFromDisk(cacheKey, meta) {
  const mime = (meta && meta.audioFormat) || 'audio/mpeg';
  let fileName = meta && meta.fileName;
  if (!fileName) {
    const disk = await diskMediaCacheHasEntry(cacheKey);
    if (!disk.cached) return null;
  }
  const blob = await readExternalMediaFromDisk(cacheKey, fileName, mime);
  if (!blob) return null;
  // Heal metadata if fileName/size missing.
  if (!meta.fileName || !meta.size) {
    try {
      await rewriteExternalMediaCacheMetadataOnly(cacheKey, {
        duration: meta.duration,
        audioFormat: meta.audioFormat || mime,
        cachedAt: meta.cachedAt || Date.now(),
        fileName: fileName || meta.fileName,
        size: meta.size || blob.size || 0,
      });
    } catch (e) {
      /* ignore */
    }
  }
  return {
    blob: blob,
    duration: meta.duration || null,
    audioFormat: meta.audioFormat || mime,
    cachedAt: meta.cachedAt || null,
    fileName: fileName || meta.fileName || null,
    size: meta.size || blob.size || 0,
  };
}

export async function getCachedExternalMediaBlob(cacheKey) {
  const cached = await store.getItem(cacheKey);
  if (!cached) {
    // Heal: disk index may have the file without localforage metadata.
    if (isAndroidApp()) {
      const disk = await diskMediaCacheHasEntry(cacheKey);
      if (disk.cached) {
        const mime = disk.mime || 'audio/mpeg';
        const blob = await readExternalMediaFromDisk(cacheKey, null, mime);
        if (blob) {
          await rewriteExternalMediaCacheMetadataOnly(cacheKey, {
            duration: null,
            audioFormat: mime,
            cachedAt: Date.now(),
            fileName: null,
            size: blob.size || disk.size || 0,
          });
          return {
            blob: blob,
            duration: null,
            audioFormat: mime,
            cachedAt: Date.now(),
            size: blob.size || 0,
          };
        }
      }
    }
    return null;
  }
  if (cached.blob) {
    return cached;
  }
  // Android metadata-only row
  if (isAndroidApp()) {
    return hydrateFromDisk(cacheKey, cached);
  }
  return null;
}

export function iterateExternalMediaCache(iterator) {
  return store.iterate(iterator);
}

async function restoreCachedMediaFromDriveBackup(cacheKey) {
  const parsed = parseExternalMediaCacheKey(cacheKey);
  if (!parsed || parsed.standalone || !parsed.tuneId || !parsed.src) return null;
  try {
    const backup = require('./mediaCacheDriveBackup');
    if (!backup || typeof backup.tryRestoreCachedMediaFromThisAccount !== 'function') return null;
    return await backup.tryRestoreCachedMediaFromThisAccount(parsed.tuneId, parsed.src, cacheKey);
  } catch (e) {
    return null;
  }
}

function notifyCachedMediaDriveBackup(cacheKey) {
  try {
    const backup = require('./mediaCacheDriveBackup');
    if (backup && typeof backup.enqueueCachedMediaDriveUpload === 'function') {
      Promise.resolve(backup.enqueueCachedMediaDriveUpload(cacheKey)).catch(function() {});
    }
  } catch (e) {}
}

export async function isExternalMediaCached(tuneId, linkIndex, src) {
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, src);
  if (isAndroidApp()) {
    const meta = await store.getItem(cacheKey);
    if (meta && meta.blob) return true;
    if (meta && (meta.fileName || meta.size)) {
      const disk = await diskMediaCacheHasEntry(cacheKey);
      return !!disk.cached;
    }
    const disk = await diskMediaCacheHasEntry(cacheKey);
    return !!disk.cached;
  }
  const existing = await getCachedExternalMediaBlob(cacheKey);
  return !!(existing && existing.blob);
}

async function encodeAndStoreExternalMedia(cacheKey, decoded) {
  const encoded = await encodeAudioBufferWithSetting(decoded.audioBuffer);
  await putExternalMediaCache(cacheKey, encoded.blob, decoded.duration, encoded.format);
  return {
    blob: encoded.blob,
    duration: decoded.duration,
    audioFormat: encoded.format,
    cached: false,
  };
}

export function getStandaloneProxiedMediaCacheKey(src) {
  return 'extmedia:src:' + String(src || '').trim();
}

async function storePlayableExternalMediaBlob(cacheKey, blob) {
  await putExternalMediaCache(cacheKey, blob, null, blob && blob.type ? blob.type : null);
  return {
    blob: blob,
    duration: null,
    audioFormat: blob && blob.type ? blob.type : null,
    cached: false,
  };
}

/** Store fetched resolver-proxied bytes without re-downloading. */
export async function cacheExternalMediaBytes(cacheKey, arrayBuffer, mime) {
  const existing = await getCachedExternalMediaBlob(cacheKey);
  if (existing && existing.blob) {
    return existing;
  }
  const raw = new Blob([arrayBuffer], { type: mime || 'application/octet-stream' });
  const playable = await blobForHtmlAudioPlayback(raw, mime);
  return storePlayableExternalMediaBlob(cacheKey, playable);
}

async function fetchAndStoreExternalMedia(cacheKey, options) {
  const { src, srcType, youtubeGetId, accessToken, collectionLink } = options;
  if (srcType === 'audio' && requiresResolverProxiedPlayback(src)) {
    const playable = await fetchPlayableAudioBlob(src, srcType, {
      youtubeGetId: youtubeGetId,
      accessToken: accessToken,
      collectionLink: collectionLink,
    });
    return storePlayableExternalMediaBlob(cacheKey, playable);
  }
  const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
  return encodeAndStoreExternalMedia(cacheKey, decoded);
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

  const restored = await restoreCachedMediaFromDriveBackup(cacheKey);
  if (restored && restored.blob) {
    return {
      blob: restored.blob,
      duration: restored.duration,
      audioFormat: restored.audioFormat || null,
      cached: true,
    };
  }

  return fetchAndStoreExternalMedia(cacheKey, {
    src: src,
    srcType: srcType,
    youtubeGetId: youtubeGetId,
    accessToken: accessToken,
  });
}

export async function cacheExternalMediaFromSrc(cacheKey, options) {
  const existing = await getCachedExternalMediaBlob(cacheKey);
  if (existing && existing.blob) {
    return existing;
  }
  const restored = await restoreCachedMediaFromDriveBackup(cacheKey);
  if (restored && restored.blob) return restored;
  return fetchAndStoreExternalMedia(cacheKey, options);
}

export async function downloadAndCacheExternalMedia(options) {
  const {
    tuneId,
    linkIndex,
    src,
    srcType,
    youtubeGetId,
    accessToken,
    collectionLink,
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

  const restored = await restoreCachedMediaFromDriveBackup(cacheKey);
  if (restored && restored.blob) {
    return {
      cached: true,
      duration: restored.duration,
      audioFormat: restored.audioFormat || null,
    };
  }

  const stored = await fetchAndStoreExternalMedia(cacheKey, {
    src: src,
    srcType: srcType,
    youtubeGetId: youtubeGetId,
    accessToken: accessToken,
    collectionLink: collectionLink,
  });
  return {
    cached: false,
    duration: stored.duration,
    audioFormat: stored.audioFormat,
  };
}

export async function putExternalMediaCache(cacheKey, blob, duration, audioFormat) {
  const mime = audioFormat || (blob && blob.type) || 'audio/mpeg';

  if (isAndroidApp()) {
    const persisted = await persistExternalMediaToDisk(cacheKey, blob, mime);
    if (!persisted) {
      // Fall back to blob storage if disk write fails so caching still works.
      await store.setItem(cacheKey, {
        duration: duration || null,
        blob: blob,
        audioFormat: mime,
        cachedAt: Date.now(),
      });
    } else {
      await store.setItem(cacheKey, {
        duration: duration || null,
        audioFormat: mime,
        cachedAt: Date.now(),
        fileName: persisted.fileName,
        size: persisted.size || (blob && blob.size) || 0,
      });
    }
  } else {
    await store.setItem(cacheKey, {
      duration: duration || null,
      blob: blob,
      audioFormat: mime,
      cachedAt: Date.now(),
    });
  }

  scheduleMediaCacheStorageCheck();
  notifyCachedMediaDriveBackup(cacheKey);
}

export async function clearExternalMediaCache(lockedTuneIds) {
  if (!lockedTuneIds || Object.keys(lockedTuneIds).length === 0) {
    await store.clear();
    await clearDiskMediaCache();
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
      await removeDiskMediaCacheEntry(keysToRemove[i]);
    }
  }
  scheduleMediaCacheStorageCheck(0);
}
