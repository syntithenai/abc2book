/**
 * Native Android YouTube audio fetch (replaces browser extension on mobile).
 */
import { Capacitor } from '@capacitor/core';
import { TunebookYoutube, isNativeYoutubeAvailable } from './capacitor/tunebookPlugins';
import { isYoutubeHelperDisabled } from './youtubeHelperSettings';

const PING_CACHE_MS = 10000;
let cachedPing = null;
let cachedPingAt = 0;

export function isYoutubeNativeAvailableSync() {
  if (isYoutubeHelperDisabled()) return false;
  return isNativeYoutubeAvailable() && !!(cachedPing && cachedPing.ok);
}

export async function pingYoutubeNative(options) {
  const force = options && options.force;
  const now = Date.now();
  if (isYoutubeHelperDisabled()) {
    cachedPing = { ok: false, error: 'TuneBook Helper disabled in settings', disabled: true };
    cachedPingAt = now;
    return cachedPing;
  }
  if (!isNativeYoutubeAvailable()) {
    cachedPing = { ok: false, error: 'Not running in Android app' };
    cachedPingAt = now;
    return cachedPing;
  }
  if (!force && cachedPing && now - cachedPingAt < PING_CACHE_MS) {
    return cachedPing;
  }
  try {
    const result = await TunebookYoutube.ping();
    cachedPing = {
      ok: !!result.ok,
      version: result.version || '1.0.0',
      via: result.via || 'native',
    };
  } catch (err) {
    cachedPing = {
      ok: false,
      error: err && err.message ? String(err.message) : 'Native YouTube fetch unavailable',
    };
  }
  cachedPingAt = Date.now();
  return cachedPing;
}

export async function isYoutubeNativeConnected() {
  const result = await pingYoutubeNative();
  return !!result.ok;
}

export function isYoutubeNativeConnectedSync() {
  if (isYoutubeHelperDisabled()) return false;
  if (!isNativeYoutubeAvailable()) return false;
  return !!(cachedPing && cachedPing.ok);
}

/**
 * @param {string} videoId
 * @returns {Promise<{ arrayBuffer: ArrayBuffer, mime: string, title: string|null, filePath: string, via: 'native' }>}
 */
export async function fetchYoutubeAudioViaNative(videoId) {
  const id = String(videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new Error('Invalid YouTube video id');
  }
  if (isYoutubeHelperDisabled()) {
    throw new Error('TuneBook Helper disabled in settings');
  }
  const connected = await pingYoutubeNative({ force: true });
  if (!connected.ok) {
    throw new Error(connected.error || 'Native YouTube fetch is not available');
  }
  const result = await TunebookYoutube.fetchYoutubeAudio({ videoId: id });
  const webPath = Capacitor.convertFileSrc(result.filePath);
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error('Could not read downloaded YouTube audio');
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    arrayBuffer: arrayBuffer,
    mime: result.mime || 'audio/mp4',
    title: result.title || null,
    filePath: result.filePath,
    client: result.client || null,
    via: 'native',
  };
}

if (typeof window !== 'undefined' && isNativeYoutubeAvailable()) {
  pingYoutubeNative().catch(function() {});
}

export function __resetYoutubeNativePingCache() {
  cachedPing = null;
  cachedPingAt = 0;
}
