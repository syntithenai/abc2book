import { Filesystem, Directory } from '@capacitor/filesystem';
import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './platformUtils';

const TunebookMediaCache = registerPlugin('TunebookMediaCache', {
  web: function() {
    return {
      registerEntry: async function() { return { ok: false }; },
      removeEntry: async function() { return { ok: false }; },
      clearAll: async function() { return { ok: false }; },
      hasEntry: async function() { return { cached: false }; },
      hashKey: async function(opts) {
        return { fileName: await sha256Hex(String((opts && opts.cacheKey) || '')) };
      },
    };
  },
});

export const SHARED_MEDIA_CACHE_DIR = 'shared_media_cache';
/** One-shot: drop IndexedDB blobs after ensuring disk files exist. */
const DISK_PRIMARY_FLAG = 'tunebook_media_cache_disk_primary_v1';

function blobToBase64(blob) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function() {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = function() {
      reject(reader.error || new Error('Failed to read blob'));
    };
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime || 'audio/mpeg' });
}

async function sha256Hex(text) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(function(b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }
  const res = await TunebookMediaCache.hashKey({ cacheKey: text });
  return res.fileName;
}

/**
 * Android primary write: bytes on disk + ContentProvider index.
 * Returns { fileName, size, mime } or null on failure / non-Android.
 */
export async function persistExternalMediaToDisk(cacheKey, blob, mime) {
  if (!isAndroidApp() || !cacheKey || !blob) return null;
  try {
    const fileName = await sha256Hex(cacheKey);
    const resolvedMime = mime || (blob.type) || 'audio/mpeg';
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: SHARED_MEDIA_CACHE_DIR + '/' + fileName,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    await TunebookMediaCache.registerEntry({
      cacheKey: cacheKey,
      fileName: fileName,
      mime: resolvedMime,
    });
    let size = typeof blob.size === 'number' ? blob.size : 0;
    if (!size) {
      try {
        const st = await Filesystem.stat({
          path: SHARED_MEDIA_CACHE_DIR + '/' + fileName,
          directory: Directory.Data,
        });
        size = st && st.size ? st.size : 0;
      } catch (e) {
        /* ignore */
      }
    }
    return { fileName: fileName, size: size, mime: resolvedMime };
  } catch (e) {
    console.warn('media cache disk persist failed', e);
    return null;
  }
}

/** @deprecated Use persistExternalMediaToDisk — kept for call-site compatibility. */
export async function mirrorExternalMediaCacheEntry(cacheKey, blob, mime) {
  return persistExternalMediaToDisk(cacheKey, blob, mime);
}

/**
 * Read a disk-cached entry as a Blob for WebView playback.
 */
export async function readExternalMediaFromDisk(cacheKey, fileName, mime) {
  if (!isAndroidApp() || !cacheKey) return null;
  const name = fileName || (await sha256Hex(cacheKey));
  const resolvedMime = mime || 'audio/mpeg';
  try {
    const result = await Filesystem.readFile({
      path: SHARED_MEDIA_CACHE_DIR + '/' + name,
      directory: Directory.Data,
    });
    const data = result && result.data;
    if (!data) return null;
    if (typeof data === 'string') {
      return base64ToBlob(data, resolvedMime);
    }
    // Some Capacitor versions return Blob/ArrayBuffer
    if (data instanceof Blob) return data;
    return new Blob([data], { type: resolvedMime });
  } catch (e) {
    return null;
  }
}

export async function diskMediaCacheHasEntry(cacheKey) {
  if (!isAndroidApp() || !cacheKey) return { cached: false };
  try {
    return await TunebookMediaCache.hasEntry({ cacheKey: cacheKey });
  } catch (e) {
    return { cached: false };
  }
}

export async function removeDiskMediaCacheEntry(cacheKey) {
  if (!isAndroidApp() || !cacheKey) return;
  try {
    await TunebookMediaCache.removeEntry({ cacheKey: cacheKey });
  } catch (e) {
    /* ignore */
  }
}

export async function clearDiskMediaCache() {
  if (!isAndroidApp()) return;
  try {
    await TunebookMediaCache.clearAll();
  } catch (e) {
    /* ignore */
  }
}

/** @deprecated aliases */
export const removeMirroredMediaCacheEntry = removeDiskMediaCacheEntry;
export const clearMirroredMediaCache = clearDiskMediaCache;

/**
 * One-shot migration: ensure disk files exist, then drop IndexedDB blobs
 * so Android keeps a single byte copy on disk.
 */
export async function migrateExternalMediaCacheToDiskPrimaryIfNeeded() {
  if (!isAndroidApp()) return;
  try {
    if (localStorage.getItem(DISK_PRIMARY_FLAG) === '1') return;
  } catch (e) {
    /* continue */
  }

  try {
    const {
      iterateExternalMediaCache,
      rewriteExternalMediaCacheMetadataOnly,
    } = await import('./externalMediaAudioCache');
    let migrated = 0;
    const ops = [];
    await iterateExternalMediaCache(function(value, key) {
      ops.push({ key: key, value: value });
    });
    for (let i = 0; i < ops.length; i++) {
      const key = ops[i].key;
      const value = ops[i].value;
      if (!value) continue;
      const mime =
        value.audioFormat ||
        (value.blob && value.blob.type) ||
        'audio/mpeg';
      let fileName = value.fileName || null;
      let size = typeof value.size === 'number' ? value.size : 0;

      if (value.blob) {
        const disk = await diskMediaCacheHasEntry(key);
        if (!disk.cached) {
          const persisted = await persistExternalMediaToDisk(key, value.blob, mime);
          if (!persisted) continue;
          fileName = persisted.fileName;
          size = persisted.size;
        } else {
          fileName = fileName || (await sha256Hex(key));
          if (!size && value.blob.size) size = value.blob.size;
          // Ensure native index knows this key even if file already existed.
          try {
            await TunebookMediaCache.registerEntry({
              cacheKey: key,
              fileName: fileName,
              mime: mime,
            });
          } catch (e) {
            /* file missing — re-persist */
            const persisted = await persistExternalMediaToDisk(key, value.blob, mime);
            if (!persisted) continue;
            fileName = persisted.fileName;
            size = persisted.size;
          }
        }
        await rewriteExternalMediaCacheMetadataOnly(key, {
          duration: value.duration || null,
          audioFormat: value.audioFormat || mime,
          cachedAt: value.cachedAt || Date.now(),
          fileName: fileName,
          size: size || (value.blob && value.blob.size) || 0,
        });
        migrated += 1;
      } else if (value.fileName || (await diskMediaCacheHasEntry(key)).cached) {
        // Already metadata-only; ensure size/fileName filled when possible.
        if (!value.fileName || !value.size) {
          const name = value.fileName || (await sha256Hex(key));
          let resolvedSize = value.size || 0;
          if (!resolvedSize) {
            try {
              const st = await Filesystem.stat({
                path: SHARED_MEDIA_CACHE_DIR + '/' + name,
                directory: Directory.Data,
              });
              resolvedSize = st && st.size ? st.size : 0;
            } catch (e) {
              /* ignore */
            }
          }
          await rewriteExternalMediaCacheMetadataOnly(key, {
            duration: value.duration || null,
            audioFormat: value.audioFormat || mime,
            cachedAt: value.cachedAt || Date.now(),
            fileName: name,
            size: resolvedSize,
          });
        }
      }
    }
    try {
      localStorage.setItem(DISK_PRIMARY_FLAG, '1');
      // Legacy mirror flag no longer needed.
      localStorage.removeItem('tunebook_media_cache_reindexed_v1');
    } catch (e) {
      /* ignore */
    }
    if (migrated > 0) {
      console.info(
        'Migrated ' + migrated + ' Tunebook media cache entries to disk-primary',
      );
    }
  } catch (e) {
    console.warn('media cache disk-primary migration failed', e);
  }
}

/** @deprecated */
export async function reindexExternalMediaCacheToDiskIfNeeded() {
  return migrateExternalMediaCacheToDiskPrimaryIfNeeded();
}

export { TunebookMediaCache };
