/**
 * Native Android foreground-service media player (ExoPlayer).
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TunebookMedia, isNativeMediaPlayerAvailable } from './capacitor/tunebookPlugins';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';

let listenerHandles = [];
let active = false;
let currentUri = null;

const NATIVE_LOAD_TIMEOUT_MS = 20000;

export function isNativePlayerActive() {
  return active;
}

export function markNativePlayerActive(uri) {
  active = true;
  if (uri) currentUri = uri;
}

export function getNativePlayerUri() {
  return currentUri;
}

function blobToBase64(blob) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function() {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function writeBlobToCacheUri(blob, filename) {
  const base64 = await blobToBase64(blob);
  const path = 'playback/' + filename;
  await Filesystem.writeFile({
    path: path,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  const uriResult = await Filesystem.getUri({
    path: path,
    directory: Directory.Cache,
  });
  return uriResult.uri;
}

export async function writeAudioBufferToCacheUri(buffer, filename) {
  const blob = encodeAudioBufferToWav(buffer);
  return writeBlobToCacheUri(blob, filename);
}

function waitForNativeLoadComplete(shouldPlay) {
  return new Promise(function(resolve, reject) {
    let settled = false
    const timeout = setTimeout(function() {
      if (settled) return
      settled = true
      remove()
      reject(new Error('Native playback load timeout'))
    }, NATIVE_LOAD_TIMEOUT_MS)
    function finish(ok, err) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      remove()
      if (ok) resolve()
      else reject(err || new Error('Native playback failed'))
    }
    const remove = addNativePlayerListener('stateChange', function(event) {
      if (!event) return
      if (shouldPlay) {
        if (event.isPlaying) finish(true)
        return
      }
      if (event.hasMedia || (event.durationMs && event.durationMs > 0)) {
        finish(true)
      }
    })
    getNativePlayerState().then(function(state) {
      if (settled) return
      if (shouldPlay && state.isPlaying) {
        finish(true)
        return
      }
      if (!shouldPlay && state.hasMedia) {
        finish(true)
      }
    }).catch(function() {})
  })
}

export async function loadNativePlayer(options) {
  if (!isNativeMediaPlayerAvailable()) {
    throw new Error('Native media player is only available in the Android app');
  }
  const opts = options || {};
  let uri = opts.uri;
  if (!uri && opts.blob) {
    uri = await writeBlobToCacheUri(opts.blob, opts.filename || ('track-' + Date.now() + '.wav'));
  }
  if (!uri) {
    throw new Error('uri or blob is required for native playback');
  }
  uri = resolveNativePlaybackUri(uri);
  currentUri = uri;
  const shouldPlay = opts.play !== false;
  try {
    await TunebookMedia.load({
      uri: uri,
      title: opts.title || 'Tunebook',
      artist: opts.artist || '',
      positionMs: opts.positionMs || 0,
      autoplay: shouldPlay,
      requestHeaders: opts.requestHeaders || undefined,
    });
    await waitForNativeLoadComplete(shouldPlay);
    active = true;
    if (shouldPlay && opts.tempo && opts.tempo !== 1) {
      await setNativePlayerSpeed(opts.tempo);
    }
    return uri;
  } catch (e) {
    active = false;
    currentUri = null;
    throw e;
  }
}

export async function playNativePlayer() {
  if (!isNativeMediaPlayerAvailable()) return false;
  await TunebookMedia.play();
  return true;
}

export async function pauseNativePlayer() {
  if (!isNativeMediaPlayerAvailable()) return false;
  await TunebookMedia.pause();
  return true;
}

export async function seekNativePlayer(positionMs) {
  if (!isNativeMediaPlayerAvailable()) return false;
  await TunebookMedia.seekTo({ positionMs: positionMs });
  return true;
}

export async function setNativePlayerSpeed(speed) {
  if (!isNativeMediaPlayerAvailable()) return false;
  await TunebookMedia.setPlaybackSpeed({ speed: speed });
  return true;
}

export async function getNativePlayerState() {
  if (!isNativeMediaPlayerAvailable()) {
    return { isPlaying: false, positionMs: 0, durationMs: 0, hasMedia: false };
  }
  return TunebookMedia.getState();
}

export async function stopNativePlayer() {
  if (!isNativeMediaPlayerAvailable()) return;
  active = false;
  currentUri = null;
  await TunebookMedia.stop();
}

export function addNativePlayerListener(eventName, handler) {
  if (!isNativeMediaPlayerAvailable()) return function() {};
  const token = TunebookMedia.addListener(eventName, handler);
  listenerHandles.push(token);
  return function remove() {
    token.remove();
    listenerHandles = listenerHandles.filter(function(t) { return t !== token; });
  };
}

export async function openBatteryOptimizationSettings() {
  if (!isNativeMediaPlayerAvailable()) return false;
  await TunebookMedia.openBatterySettings();
  return true;
}

export function convertNativeFilePath(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('file://') || filePath.startsWith('content://')) {
    return filePath;
  }
  if (filePath.startsWith('/')) {
    return 'file://' + filePath;
  }
  if (Capacitor.convertFileSrc) {
    return Capacitor.convertFileSrc(filePath);
  }
  return 'file://' + filePath;
}

/** URI suitable for ExoPlayer in the native plugin (not WebView bridge URLs). */
export function resolveNativePlaybackUri(uri) {
  if (!uri) return uri;
  if (uri.startsWith('http://') || uri.startsWith('https://')
    || uri.startsWith('content://') || uri.startsWith('file://')) {
    if (uri.indexOf('/_capacitor_file_/') >= 0) {
      const path = uri.split('/_capacitor_file_').pop() || '';
      return path.startsWith('/') ? 'file://' + path : 'file:///' + path;
    }
    return uri;
  }
  if (uri.startsWith('/')) {
    return 'file://' + uri;
  }
  return convertNativeFilePath(uri);
}
