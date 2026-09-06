/**
 * Native Android foreground-service media player (ExoPlayer).
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TunebookMedia, isNativeMediaPlayerAvailable } from './capacitor/tunebookPlugins';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import { logPlaybackDebug, agentDebugLog } from './playbackDebug';

let listenerHandles = [];
let active = false;
let currentUri = null;
let loadChain = Promise.resolve();

const NATIVE_LOAD_TIMEOUT_MS = 20000;

export function isBenignNativeLoadError(err) {
  const msg = err && err.message ? String(err.message) : String(err || '');
  return msg.indexOf('Superseded by new load') >= 0
    || msg.indexOf('Stopped') >= 0;
}

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
      // #region agent log
      agentDebugLog('nativeMediaPlayer.js:waitForNativeLoadComplete', 'timeout', {
        shouldPlay: !!shouldPlay,
        timeoutMs: NATIVE_LOAD_TIMEOUT_MS,
        uriTail: currentUri ? String(currentUri).slice(-48) : null,
      }, 'H-B')
      // #endregion
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
  const run = async function() {
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
      if (!isBenignNativeLoadError(e)) {
        active = false;
        currentUri = null;
      }
      // #region agent log
      agentDebugLog('nativeMediaPlayer.js:loadNativePlayer', 'error', {
        message: e && e.message ? String(e.message).slice(0, 160) : 'unknown',
        benign: isBenignNativeLoadError(e),
        uriTail: uri ? String(uri).slice(-48) : null,
      }, 'H-F');
      // #endregion
      throw e;
    }
  };
  // Serialize loads so concurrent callers cannot race ExoPlayer into "Superseded".
  const result = loadChain.then(run, run);
  loadChain = result.then(function() {}, function() {});
  return result;
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
  if (!isNativeMediaPlayerAvailable()) {
    active = false;
    currentUri = null;
    return;
  }
  const run = async function() {
    // #region agent log
    agentDebugLog('nativeMediaPlayer.js:stopNativePlayer', 'run', {
      hadActive: active,
      uriTail: currentUri ? String(currentUri).slice(-48) : null,
    }, 'H-G');
    // #endregion
    active = false;
    currentUri = null;
    await TunebookMedia.stop();
  };
  // Keep stop on the same chain as load so a prior stop cannot land after a new load.
  const result = loadChain.then(run, run);
  loadChain = result.then(function() {}, function() {});
  return result;
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
