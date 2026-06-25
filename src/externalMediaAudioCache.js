import localforage from 'localforage';
import MP3Converter from './MP3Converter';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';

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
    return { blob: existing.blob, duration: existing.duration, cached: true };
  }

  const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
  const converter = new MP3Converter();
  const blob = await converter.convertAudioBuffer(decoded.audioBuffer, { bitRate: 96 });
  await store.setItem(cacheKey, {
    duration: decoded.duration,
    blob: blob,
    cachedAt: Date.now(),
  });
  return { blob: blob, duration: decoded.duration, cached: false };
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
    return { cached: true, duration: existing.duration };
  }

  const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
  const converter = new MP3Converter();
  const blob = await converter.convertAudioBuffer(decoded.audioBuffer, { bitRate: 96 });
  await store.setItem(cacheKey, {
    duration: decoded.duration,
    blob: blob,
    cachedAt: Date.now(),
  });
  return { cached: false, duration: decoded.duration };
}

export async function clearExternalMediaCache() {
  await store.clear();
}
