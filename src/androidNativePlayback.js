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
  getBatteryOptimizationStatus,
  openBatteryOptimizationSettings,
  resolveNativePlaybackUri,
  markNativePlayerActive,
  isBenignNativeLoadError,
} from './nativeMediaPlayer';
import { prefersNativeMediaPlayback } from './platformUtils';
import { renderAbcToAudioBuffer, estimateAbcAudioDurationSec } from './notationAudioExport';
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { fetchYoutubeAudioFilePathViaNative, playYoutubeAudioNative } from './youtubeNativeClient';
import { logPlaybackDebug } from './playbackDebug'

let removeListeners = null;
let callbacks = {
  onStateChange: null,
  onEnded: null,
  onError: null,
};

let abcNativePlayGeneration = 0;
let abcNativePlayInFlight = false;
// Serialize Exo loads so a superseded render cannot overwrite a newer track's
 // media/title after cancelAbcNativePlayback bumps the generation.
let abcNativeLoadChain = Promise.resolve();

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

function enqueueAbcNativeExoLoad(generation, loadFn) {
  const run = abcNativeLoadChain.then(function() {
    if (!isGenerationCurrent(generation)) {
      return false
    }
    return Promise.resolve()
      .then(function() { return loadFn() })
      .then(function() {
        if (!isGenerationCurrent(generation)) {
          return false
        }
        return true
      })
  })
  abcNativeLoadChain = run.then(function() {}, function() {})
  return run
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
  // v3: programOffsets aligned with live playback (no original-bank offsets on remap).
  return 'playback/abc-v3-' + String(tuneId || 'unknown') + '-' + tempoKey + '.wav';
}

function parseWavDurationSec(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 44) return 0;
  const view = new DataView(arrayBuffer);
  const byteRate = view.getUint32(28, true);
  if (!(byteRate > 0)) return 0;
  const dataSize = view.getUint32(40, true);
  if (!(dataSize > 0)) return 0;
  return dataSize / byteRate;
}

async function readWavDurationFromUri(uri) {
  if (!uri) return 0;
  try {
    const response = await fetch(uri);
    const buf = await response.arrayBuffer();
    return parseWavDurationSec(buf);
  } catch (e) {
    return 0;
  }
}

async function readAbcNativeCacheUri(tuneId, tempo, minDurationSec) {
  const path = getAbcNativeCachePath(tuneId, tempo);
  try {
    const stat = await Filesystem.stat({ path: path, directory: Directory.Cache });
    if (!stat || !stat.size || stat.size < 4096) {
      return null;
    }
    const uriResult = await Filesystem.getUri({ path: path, directory: Directory.Cache });
    const uri = uriResult.uri;
    const cachedDuration = await readWavDurationFromUri(uri);
    const minAccept = minDurationSec > 0 ? Math.min(minDurationSec * 0.85, minDurationSec - 0.25) : 3;
    const floor = minDurationSec > 0 ? Math.max(1, minAccept) : 3;
    if (!(cachedDuration >= floor)) {
      try {
        await Filesystem.deleteFile({ path: path, directory: Directory.Cache });
      } catch (e) { /* ignore */ }
      return null;
    }
    return uri;
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
  let minDurationSec = opts.minDurationSec > 0 ? opts.minDurationSec : 0;
  if (!(minDurationSec > 0) && abc) {
    minDurationSec = estimateAbcAudioDurationSec(abc, {
      tune: opts.tune,
      tunebook: opts.tunebook,
    });
  }
  try {
    let playUri = tuneId ? await readAbcNativeCacheUri(tuneId, tempo, minDurationSec) : null;
    let fromCache = !!playUri;
    if (!isGenerationCurrent(generation)) {
      return false;
    }

    if (playUri) {
      logPlaybackDebug('abc-native-cache-hit', { tuneId: tuneId });
    } else {
      fromCache = false;
      logPlaybackDebug('abc-native-render', { tuneId: tuneId });
      const rendered = await renderAbcToAudioBuffer(abc, {
        tune: opts.tune,
        tunebook: opts.tunebook,
        chordsOff: opts.chordsOff,
        includeMeta: true,
      });
      const buffer = rendered && rendered.buffer ? rendered.buffer : rendered;
      if (!isGenerationCurrent(generation)) return false;
      logPlaybackDebug('abc-native-rendered', {
        tuneId: tuneId,
        durationSec: buffer.duration,
      });
      if (typeof opts.onPlaybackMeta === 'function') {
        opts.onPlaybackMeta({
          soundingWrittenMap: rendered.soundingWrittenMap || null,
          audibleMsPerMeasure: rendered.audibleMsPerMeasure || 0,
          durationSec: buffer.duration,
        });
      }
      const blob = encodeAudioBufferToWav(buffer);
      if (minDurationSec > 0 && buffer.duration < minDurationSec * 0.85) {
        throw new Error('Rendered notation audio is too short (' + buffer.duration.toFixed(2) + 's)');
      }
      if (buffer.duration < 1) {
        throw new Error('Rendered notation audio is too short (' + buffer.duration.toFixed(2) + 's)');
      }
      if (tuneId) {
        playUri = await writeAbcNativeCache(tuneId, tempo, blob);
      } else {
        playUri = await writeBlobToCacheUri(blob, 'playback-' + Date.now() + '.wav');
      }
      if (!isGenerationCurrent(generation)) return false;
    }

    const loadedOk = await enqueueAbcNativeExoLoad(generation, function() {
      return playAndroidNativeUri(playUri, {
        title: opts.title,
        artist: opts.artist,
        positionSec: opts.positionSec || 0,
        play: opts.play !== false,
        tempo: opts.tempo,
      });
    });
    if (!loadedOk) {
      return false;
    }
    markNativePlayerActive(playUri);
    return true;
  } catch (err) {
    if (isBenignNativeLoadError(err)) {
      return false
    }
    throw err
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
      if (opts.play !== false && opts.tempo && opts.tempo !== 1) {
        await setNativePlayerSpeed(opts.tempo);
      }
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

export { getBatteryOptimizationStatus, openBatteryOptimizationSettings };
export { abcMidiUsesAndroidNativePrerender } from './playbackRouter';
