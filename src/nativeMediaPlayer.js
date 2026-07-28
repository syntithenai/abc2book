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

export function isNativePlayerActive() {
  return active;
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
  currentUri = uri;
  active = true;
  await TunebookMedia.load({
    uri: uri,
    title: opts.title || 'Tunebook',
    artist: opts.artist || '',
    positionMs: opts.positionMs || 0,
  });
  if (opts.play !== false) {
    await TunebookMedia.play();
  }
  return uri;
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
    return { isPlaying: false, positionMs: 0, durationMs: 0 };
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
  if (Capacitor.convertFileSrc) {
    return Capacitor.convertFileSrc(filePath);
  }
  return 'file://' + filePath;
}
