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
 * Download YouTube audio to device cache and return the native file path only.
 * Avoids reading the file back through the WebView (unreliable on Capacitor).
 */
export async function fetchYoutubeAudioFilePathViaNative(videoId) {
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
  if (result && result.filePath) {
    return {
      filePath: result.filePath,
      mime: result.mime || 'audio/mp4',
      title: result.title || null,
      client: result.client || null,
      via: 'native',
    };
  }
  if (result && result.streamUrl) {
    const requestHeaders = result.requestHeaders || null;
    return {
      streamUrl: result.streamUrl,
      requestHeaders: requestHeaders,
      mime: result.mime || 'audio/mp4',
      title: result.title || null,
      client: result.client || null,
      via: 'native-stream',
    };
  }
  throw new Error('YouTube fetch returned no audio');
}

/** Fetch + load into ExoPlayer entirely in Kotlin (avoids bridge header loss). */
export async function playYoutubeAudioNative(videoId, options) {
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
  const opts = options || {};
  const result = await TunebookYoutube.playYoutubeAudio({
    videoId: id,
    title: opts.title || 'Tunebook',
    artist: opts.artist || '',
    positionMs: Math.round((opts.positionSec || 0) * 1000),
    autoplay: opts.play !== false,
  });
  if (!result || !result.ok) {
    throw new Error('YouTube native playback failed');
  }
  return {
    ok: true,
    filePath: result.filePath || null,
    streamUrl: result.streamUrl || null,
    videoId: result.videoId || id,
    client: result.client || null,
    via: result.via || 'native',
  };
}

/**
 * @param {string} videoId
 * @returns {Promise<{ arrayBuffer: ArrayBuffer, mime: string, title: string|null, filePath: string, via: 'native' }>}
 */
export async function fetchYoutubeAudioViaNative(videoId) {
  const fetched = await fetchYoutubeAudioFilePathViaNative(videoId);
  const webPath = Capacitor.convertFileSrc(fetched.filePath);
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error('Could not read downloaded YouTube audio');
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    arrayBuffer: arrayBuffer,
    mime: fetched.mime,
    title: fetched.title,
    filePath: fetched.filePath,
    client: fetched.client,
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
