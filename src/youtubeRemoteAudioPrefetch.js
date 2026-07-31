import { isAndroidApp } from './platformUtils';
import {
  fetchYoutubeAudioViaExtension,
  isYoutubeExtensionConnected,
} from './youtubeExtensionClient';
import {
  fetchYoutubeAudioViaNative,
  isYoutubeNativeConnected,
} from './youtubeNativeClient';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function extensionForMime(mime) {
  const type = String(mime || '').toLowerCase();
  if (type.indexOf('webm') >= 0) return '.webm';
  if (type.indexOf('mpeg') >= 0 || type.indexOf('mp3') >= 0) return '.mp3';
  return '.m4a';
}

/**
 * When the resolver cannot fetch YouTube Topic / licensed tracks, download audio in
 * the browser (extension or Android native) and attach it for cast/snapcast upload.
 */
export async function enrichPayloadWithYoutubeAudioPrefetch(payload, youtubeGetId) {
  if (!payload || payload.sourceType !== 'youtube' || payload.audioBase64) return payload;
  const getId = typeof youtubeGetId === 'function' ? youtubeGetId : null;
  const videoId = getId ? getId(payload.source) : null;
  if (!videoId) return payload;

  let fetched = null;
  if (isAndroidApp() && (await isYoutubeNativeConnected())) {
    try {
      fetched = await fetchYoutubeAudioViaNative(videoId);
    } catch (e) {
      console.log(e);
    }
  }
  if (!fetched && (await isYoutubeExtensionConnected())) {
    try {
      fetched = await fetchYoutubeAudioViaExtension(videoId);
    } catch (e) {
      console.log(e);
    }
  }
  if (!fetched || !fetched.arrayBuffer) return payload;

  const mime = fetched.mime || 'audio/mp4';
  return Object.assign({}, payload, {
    audioBase64: arrayBufferToBase64(fetched.arrayBuffer),
    audioMime: mime,
    audioFilename: videoId + extensionForMime(mime),
  });
}

export function __arrayBufferToBase64ForTests(buffer) {
  return arrayBufferToBase64(buffer);
}
