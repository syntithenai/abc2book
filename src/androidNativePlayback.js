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
  isNativePlayerActive,
  addNativePlayerListener,
  writeBlobToCacheUri,
  openBatteryOptimizationSettings,
} from './nativeMediaPlayer';
import { prefersNativeMediaPlayback } from './platformUtils';
import { renderAbcToAudioBuffer } from './notationAudioExport';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import { Capacitor } from '@capacitor/core';

let removeListeners = null;
let callbacks = {
  onStateChange: null,
  onEnded: null,
  onError: null,
};

export function shouldUseAndroidNativePlayer() {
  return prefersNativeMediaPlayback();
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
  let resolvedUri = uri;
  if (uri && !uri.startsWith('http') && !uri.startsWith('content') && !uri.startsWith('file')) {
    resolvedUri = Capacitor.convertFileSrc(uri);
  }
  await loadNativePlayer({
    uri: resolvedUri,
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

export async function playAndroidNativeBlobUrl(blobUrl, options) {
  if (!shouldUseAndroidNativePlayer()) return false;
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return playAndroidNativeBlob(blob, options);
}

export async function renderAndPlayAbcNative(abc, options) {
  if (!shouldUseAndroidNativePlayer()) return false;
  const opts = options || {};
  const buffer = await renderAbcToAudioBuffer(abc, {
    tune: opts.tune,
    tunebook: opts.tunebook,
    chordsOff: opts.chordsOff,
  });
  const blob = encodeAudioBufferToWav(buffer);
  await playAndroidNativeBlob(blob, {
    title: opts.title,
    artist: opts.artist,
    positionSec: opts.positionSec || 0,
    play: opts.play !== false,
    tempo: opts.tempo,
  });
  return true;
}

export async function pauseAndroidNativePlayer() {
  if (!isNativePlayerActive()) return false;
  await pauseNativePlayer();
  return true;
}

export async function playAndroidNativePlayer() {
  if (!isNativePlayerActive()) return false;
  await playNativePlayer();
  return true;
}

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
