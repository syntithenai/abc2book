/**
 * Coordinates ExoPlayer native playback for the Android app build.
 */
import {
  loadNativePlayer,
  playNativePlayer,
  pauseNativePlayer,
  seekNativePlayer,
  setNativePlayerSpeed,
  stopNativePlayer,
  getNativePlayerState,
  isNativePlayerActive,
  addNativePlayerListener,
  writeBlobToCacheUri,
  openBatteryOptimizationSettings,
  resolveNativePlaybackUri,
  markNativePlayerActive,
} from './nativeMediaPlayer';
import { prefersNativeMediaPlayback } from './platformUtils';
import { renderAbcToAudioBuffer } from './notationAudioExport';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { fetchYoutubeAudioFilePathViaNative, playYoutubeAudioNative } from './youtubeNativeClient';
import { logPlaybackDebug } from './playbackDebug';

let removeListeners = null;
let callbacks = {
  onStateChange: null,
  onEnded: null,
  onError: null,
};

let abcNativePlayGeneration = 0;
let abcNativePlayInFlight = false;

export function shouldUseAndroidNativePlayer() {
  return prefersNativeMediaPlayback();
}

export function isAbcNativePlayInFlight() {
  return abcNativePlayInFlight;
}

export function cancelAbcNativePlayback() {
  abcNativePlayGeneration += 1;
  abcNativePlayInFlight = false;
}

export function ensureAndroidNativeListeners(handlers) {
  if (!shouldUseAndroidNativePlayer()) return;
  callbacks = Object.assign({}, callbacks, handlers || {});
  if (removeListeners) return;
  const removes = [];
  removes.push(addNativePlayerListener('stateChange', function(event) {
    if (callbacks.onStateChange) {
      callbacks.onStateChange(event);
    }
  }));
  removes.push(addNativePlayerListener('ended', function() {
    if (callbacks.onEnded) {
      callbacks.onEnded();
    }
  }));
  removes.push(addNativePlayerListener('error', function(event) {
    if (callbacks.onError) {
      callbacks.onError(event);
    }
  }));
  removeListeners = function() {
    removes.forEach(function(remove) { remove(); });
    removeListeners = null;
  };
}

export function teardownAndroidNativeListeners() {
  if (removeListeners) removeListeners();
}

export async function playAndroidNativeBlob(blob, options) {
  if (!shouldUseAndroidNativePlayer()) return false;
  const opts = options || {};
  await loadNativePlayer({
    blob: blob,
    filename: opts.filename || ('playback-' + Date.now() + '.wav'),
    title: opts.title || 'Tunebook',
    artist: opts.artist || '',
    positionMs: (opts.positionSec || 0) * 1000,
    play: opts.play !== false,
  });
  if (opts.tempo && opts.tempo !== 1) {
    await setNativePlayerSpeed(opts.tempo);
  }
  return true;
}

export async function playAndroidNativeUri(uri, options) {
  if (!shouldUseAndroidNativePlayer()) return false;
  const opts = options || {};
  if (uri && uri.startsWith('blob:')) {
    return playAndroidNativeBlobUrl(uri, opts);
  }
  let resolvedUri = resolveNativePlaybackUri(uri);
  await loadNativePlayer({
    uri: resolvedUri,
    title: opts.title || 'Tunebook',
    artist: opts.artist || '',
    positionMs: (opts.positionSec || 0) * 1000,
    play: opts.play !== false,
    requestHeaders: opts.requestHeaders || undefined,
  });
  if (opts.tempo && opts.tempo !== 1) {
    await setNativePlayerSpeed(opts.tempo);
  }
  return true;
}

export async function playAndroidNativeBlobUrl(blobUrl, options) {
  if (!shouldUseAndroidNativePlayer()) return false;
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return playAndroidNativeBlob(blob, options);
}

function getAbcNativeCachePath(tuneId, tempo) {
  const tempoKey = Math.round((tempo > 0 ? tempo : 1) * 1000);
  return 'playback/abc-' + String(tuneId || 'unknown') + '-' + tempoKey + '.wav';
}

async function readAbcNativeCacheUri(tuneId, tempo) {
  const path = getAbcNativeCachePath(tuneId, tempo);
  try {
    const stat = await Filesystem.stat({ path: path, directory: Directory.Cache });
    if (!stat || !stat.size || stat.size < 1024) {
      return null;
    }
    const uriResult = await Filesystem.getUri({ path: path, directory: Directory.Cache });
    return uriResult.uri;
  } catch (e) {
    return null;
  }
}

async function writeAbcNativeCache(tuneId, tempo, blob) {
  const path = getAbcNativeCachePath(tuneId, tempo);
  const filename = path.replace(/^playback\//, '');
  return writeBlobToCacheUri(blob, filename);
}

function isGenerationCurrent(generation) {
  return generation === abcNativePlayGeneration;
}

export async function renderAndPlayAbcNative(abc, options) {
  if (!shouldUseAndroidNativePlayer()) return false;
  const generation = ++abcNativePlayGeneration;
  abcNativePlayInFlight = true;
  const opts = options || {};
  const tuneId = opts.tune && opts.tune.id ? opts.tune.id : null;
  const tempo = opts.tempo > 0 ? opts.tempo : 1;
  try {
    let playUri = tuneId ? await readAbcNativeCacheUri(tuneId, tempo) : null;
    if (!isGenerationCurrent(generation)) return false;

    if (playUri) {
      logPlaybackDebug('abc-native-cache-hit', { tuneId: tuneId });
    } else {
      logPlaybackDebug('abc-native-render', { tuneId: tuneId });
      const buffer = await renderAbcToAudioBuffer(abc, {
        tune: opts.tune,
        tunebook: opts.tunebook,
        chordsOff: opts.chordsOff,
      });
      if (!isGenerationCurrent(generation)) return false;
      const blob = encodeAudioBufferToWav(buffer);
      if (tuneId) {
        playUri = await writeAbcNativeCache(tuneId, tempo, blob);
      } else {
        playUri = await writeBlobToCacheUri(blob, 'playback-' + Date.now() + '.wav');
      }
      if (!isGenerationCurrent(generation)) return false;
    }

    await playAndroidNativeUri(playUri, {
      title: opts.title,
      artist: opts.artist,
      positionSec: opts.positionSec || 0,
      play: opts.play !== false,
      tempo: opts.tempo,
    });
    if (!isGenerationCurrent(generation)) return false;
    markNativePlayerActive(playUri);
    return true;
  } finally {
    if (isGenerationCurrent(generation)) {
      abcNativePlayInFlight = false;
    }
  }
}

export async function pauseAndroidNativePlayer() {
  if (!isNativePlayerActive()) return false;
  await pauseNativePlayer();
  return true;
}

export async function playAndroidNativeYoutube(src, options) {
  if (!shouldUseAndroidNativePlayer()) return { ok: false, error: 'Not Android native' };
  const opts = options || {};
  const getId = opts.youtubeGetId;
  if (!getId || !src) return { ok: false, error: 'Missing YouTube source' };
  const videoId = getId(src);
  if (!videoId) return { ok: false, error: 'Invalid YouTube id' };

  try {
    let filePath = opts.filePath || null;
    let fetchVia = 'cache';
    logPlaybackDebug('youtube-native-fetch-start', { videoId: videoId, cached: !!filePath });
    if (!filePath) {
      const played = await playYoutubeAudioNative(videoId, {
        title: opts.title || 'Tunebook',
        artist: opts.artist || '',
        positionSec: opts.positionSec || 0,
        play: opts.play !== false,
      });
      filePath = played.filePath || null;
      fetchVia = played.via || 'native';
      markNativePlayerActive(filePath || played.streamUrl || null);
      return {
        ok: true,
        filePath: filePath,
        streamUrl: played.streamUrl || null,
        videoId: videoId,
        via: fetchVia,
      };
    }

    const playUri = filePath;
    logPlaybackDebug('youtube-native-load-start', {
      videoId: videoId,
      via: fetchVia,
      cached: true,
    });
    await playAndroidNativeUri(playUri, {
      title: opts.title || 'Tunebook',
      artist: opts.artist || '',
      positionSec: opts.positionSec || 0,
      tempo: opts.tempo,
      play: opts.play !== false,
    });
    return { ok: true, filePath: filePath, videoId: videoId, via: fetchVia };
  } catch (e) {
    let message = e && e.message ? String(e.message) : 'YouTube playback failed';
    if (message.indexOf('Playability UNPLAYABLE') >= 0) {
      message = 'This YouTube video cannot be played in the app';
    } else if (message.indexOf('Could not reach any media resolver') >= 0
      || message.indexOf('media resolver') >= 0) {
      message = 'YouTube audio unavailable';
    }
    logPlaybackDebug('youtube-native-error', { videoId: videoId, message: message });
    return { ok: false, error: message, videoId: videoId };
  }
}

export async function playAndroidNativePlayer() {
  if (!isNativePlayerActive()) return false;
  await playNativePlayer();
  return true;
}

export async function resumeAndroidNativePlayback() {
  if (!shouldUseAndroidNativePlayer()) return false;
  if (!isNativePlayerActive()) return false;
  const state = await getNativePlayerState();
  if (state.isPlaying) return true;
  await playNativePlayer();
  return true;
}

export { getNativePlayerState };

export async function seekAndroidNativePlayer(positionSec) {
  if (!isNativePlayerActive()) return false;
  await seekNativePlayer(Math.round(positionSec * 1000));
  return true;
}

export async function stopAndroidNativePlayer() {
  if (!shouldUseAndroidNativePlayer()) return false;
  await stopNativePlayer();
  return true;
}

export function isAndroidNativePlayerActive() {
  return isNativePlayerActive();
}

export { openBatteryOptimizationSettings };
