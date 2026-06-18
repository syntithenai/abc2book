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

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  element.href = url;
  element.download = filename;
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(url);
}

export async function downloadAndCacheExternalMedia(options) {
  const {
    tuneId,
    linkIndex,
    src,
    srcType,
    youtubeGetId,
    filename,
    accessToken,
  } = options;

  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, src);
  const existing = await getCachedExternalMediaBlob(cacheKey);
  if (existing && existing.blob) {
    downloadBlob(filename, existing.blob);
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
  downloadBlob(filename, blob);
  return { cached: false, duration: decoded.duration };
}

export async function clearExternalMediaCache() {
  await store.clear();
}
