import { fetchViaMediaProxy, fetchDirectOrProxy } from './mediaProxyClient';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';
import { isDeviceFileResult } from './mediaLinkSearchDisplay';
import {
  externalMediaFromCandidate,
  isMusicCollectionSearchCandidate,
  isStandaloneExternalMedia,
} from './mediaSearchExternalMedia';
import { shouldAutoCacheMediaLink } from './mediaLinkAutoCache';
import {
  getCachedExternalMediaBlob,
  getStandaloneProxiedMediaCacheKey,
  cacheExternalMediaBytes,
} from './externalMediaAudioCache';
import { playAndroidNativeUri } from './androidNativePlayback';
import { prefersNativeMediaPlayback } from './platformUtils';
import { applyStoredOutputDeviceToElement } from './outputDeviceSupport';
import {
  loadNativePlayer,
  stopNativePlayer,
  pauseNativePlayer,
  playNativePlayer,
  addNativePlayerListener,
  getNativePlayerState,
  isNativePlayerActive,
  getNativePlayerUri,
} from './nativeMediaPlayer';
import { hardSilenceWebViewOutputs } from './androidPlaybackGate';

export { externalMediaFromCandidate, isStandaloneExternalMedia } from './mediaSearchExternalMedia';

let activeCandidate = null;
let activePlaying = false;
let activeHtmlAudio = null;
let playbackListeners = new Set();
let nativeListenersBound = false;
let standalonePlaybackEndedHandler = null;

export function setStandaloneMediaPlaybackEndedHandler(handler) {
  standalonePlaybackEndedHandler = typeof handler === 'function' ? handler : null;
}

export function standaloneMediaCandidateKey(candidate) {
  if (!candidate) return '';
  return [
    String(candidate.source || ''),
    String(candidate.uri || candidate.link || candidate.mediaLink || candidate.path || candidate.id || ''),
  ].join('::');
}

function emitStandaloneMediaPlaybackChange() {
  playbackListeners.forEach(function(listener) {
    try {
      listener();
    } catch (e) { /* ignore */ }
  });
}

function stopHtmlAudio() {
  if (!activeHtmlAudio) return;
  try {
    activeHtmlAudio.pause();
    activeHtmlAudio.currentTime = 0;
  } catch (e) { /* ignore */ }
  activeHtmlAudio = null;
}

function setActiveStandaloneMedia(candidate, playing) {
  activeCandidate = candidate || null;
  activePlaying = !!playing && !!candidate;
  emitStandaloneMediaPlaybackChange();
}

function bindStandaloneNativeListeners() {
  if (nativeListenersBound) return;
  nativeListenersBound = true;
  addNativePlayerListener('stateChange', function(event) {
    if (!activeCandidate) return;
    if (event && event.isPlaying) {
      activePlaying = true;
      emitStandaloneMediaPlaybackChange();
      return;
    }
    if (event && !event.hasMedia) {
      activeCandidate = null;
      activePlaying = false;
      emitStandaloneMediaPlaybackChange();
      return;
    }
    activePlaying = !!(event && event.isPlaying);
    emitStandaloneMediaPlaybackChange();
  });
  addNativePlayerListener('ended', function() {
    activeCandidate = null;
    activePlaying = false;
    emitStandaloneMediaPlaybackChange();
    if (standalonePlaybackEndedHandler) {
      try {
        standalonePlaybackEndedHandler();
      } catch (e) { /* ignore */ }
    }
  });
  addNativePlayerListener('error', function() {
    activeCandidate = null;
    activePlaying = false;
    emitStandaloneMediaPlaybackChange();
    if (standalonePlaybackEndedHandler) {
      try {
        standalonePlaybackEndedHandler();
      } catch (e) { /* ignore */ }
    }
  });
}

export function getStandaloneHtmlAudioElement() {
  return activeHtmlAudio;
}

export function subscribeStandaloneMediaPlayback(listener) {
  if (!listener) return function() {};
  playbackListeners.add(listener);
  return function unsubscribe() {
    playbackListeners.delete(listener);
  };
}

export async function syncStandaloneMediaPlaybackState() {
  if (activeHtmlAudio && !activeHtmlAudio.paused && !activeHtmlAudio.ended) {
    activePlaying = true;
    emitStandaloneMediaPlaybackChange();
    return;
  }
  if (!isNativePlayerActive()) {
    if (activePlaying && activeCandidate) {
      emitStandaloneMediaPlaybackChange();
      return;
    }
    if (activeCandidate || activePlaying) {
      activeCandidate = null;
      activePlaying = false;
      emitStandaloneMediaPlaybackChange();
    }
    return;
  }
  try {
    const state = await getNativePlayerState();
    const nativeUri = getNativePlayerUri();
    if (!state || !state.hasMedia) {
      activeCandidate = null;
      activePlaying = false;
    } else {
      activePlaying = !!state.isPlaying;
      if (activeCandidate && nativeUri && activeCandidate.uri
          && String(activeCandidate.uri) !== String(nativeUri)) {
        activeCandidate = Object.assign({}, activeCandidate, { uri: nativeUri });
      }
    }
    emitStandaloneMediaPlaybackChange();
  } catch (e) { /* ignore */ }
}

export function isStandaloneExternalPlaybackEngaged() {
  if (activeHtmlAudio && !activeHtmlAudio.ended) return true;
  if (!activeCandidate) return false;
  return activePlaying || isNativePlayerActive();
}

export function isStandaloneExternalPlaybackActive() {
  if (activeHtmlAudio && !activeHtmlAudio.paused && !activeHtmlAudio.ended) return true;
  return activePlaying;
}

export function getStandalonePlaybackSnapshot() {
  return {
    candidate: activeCandidate,
    isPlaying: isStandaloneExternalPlaybackActive(),
    isEngaged: isStandaloneExternalPlaybackEngaged(),
  };
}

export function isStandaloneMediaCandidateEngaged(candidate) {
  if (!candidate || !activeCandidate) return false;
  if (standaloneMediaCandidateKey(candidate) !== standaloneMediaCandidateKey(activeCandidate)) {
    return false;
  }
  return isStandaloneExternalPlaybackEngaged();
}

export function isStandaloneMediaCandidatePlaying(candidate) {
  if (!isStandaloneMediaCandidateEngaged(candidate)) return false;
  if (activeHtmlAudio && !activeHtmlAudio.paused && !activeHtmlAudio.ended) return true;
  return activePlaying;
}

export async function pauseStandaloneMediaPlayback() {
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
    } catch (e) { /* ignore */ }
    activePlaying = false;
    emitStandaloneMediaPlaybackChange();
    return;
  }
  if (isNativePlayerActive() && activeCandidate) {
    await pauseNativePlayer();
    activePlaying = false;
    emitStandaloneMediaPlaybackChange();
  }
}

export async function resumeStandaloneMediaPlayback() {
  if (activeHtmlAudio && activeHtmlAudio.paused) {
    await activeHtmlAudio.play();
    activePlaying = true;
    emitStandaloneMediaPlaybackChange();
    return;
  }
  if (isNativePlayerActive() && activeCandidate) {
    await playNativePlayer();
    activePlaying = true;
    emitStandaloneMediaPlaybackChange();
  }
}

export async function stopStandaloneMediaPlayback() {
  stopHtmlAudio();
  activeCandidate = null;
  activePlaying = false;
  emitStandaloneMediaPlaybackChange();
  await stopNativePlayer();
}

function buildCollectionProxyPath(candidate) {
  const path = String(candidate.path || '').trim();
  if (!path) return '';
  if (path.indexOf('/music-collection/') === 0) return path;
  return '/music-collection/' + path.split('/').map(encodeURIComponent).join('/');
}

function resolverAccessToken(accessToken) {
  return resolveResolverAccessToken(accessToken) || getActiveResolverAccessToken() || '';
}

async function playAudioBlob(blob, meta, options) {
  const opts = options || {};
  const title = meta && meta.title ? meta.title : 'Track';
  const artist = meta && meta.artist ? meta.artist : '';
  if (!blob || !blob.size) throw new Error('Empty audio');
  if (prefersNativeMediaPlayback()) {
    await loadNativePlayer({
      blob: blob,
      filename: title + '.mp3',
      title: title,
      artist: artist,
      play: opts.play !== false,
    });
    return true;
  }
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';
  stopHtmlAudio();
  activeHtmlAudio = audio;
  applyStoredOutputDeviceToElement(audio).catch(function() {});
  audio.addEventListener('ended', function() {
    if (activeHtmlAudio === audio) {
      activeHtmlAudio = null;
      activeCandidate = null;
      activePlaying = false;
      emitStandaloneMediaPlaybackChange();
      if (standalonePlaybackEndedHandler) {
        try {
          standalonePlaybackEndedHandler();
        } catch (e) { /* ignore */ }
      }
    }
  });
  if (opts.play !== false) {
    await audio.play();
  }
  return true;
}

async function playCollectionCandidate(candidate, options) {
  const opts = options || {};
  const proxyPath = buildCollectionProxyPath(candidate);
  if (!proxyPath) throw new Error('Missing collection path');
  const response = await fetchViaMediaProxy(proxyPath, resolverAccessToken(opts.accessToken));
  const blob = await response.blob();
  return playAudioBlob(blob, candidate, opts);
}

async function fetchResolverProxiedAudioBlob(mediaLink, options) {
  const opts = options || {};
  const token = resolverAccessToken(opts.accessToken);
  const cacheKey = getStandaloneProxiedMediaCacheKey(mediaLink);
  const cached = await getCachedExternalMediaBlob(cacheKey);
  if (cached && cached.blob) {
    return cached.blob;
  }
  const { response } = await fetchDirectOrProxy({
    src: mediaLink,
    srcType: 'audio',
    accessToken: token,
  });
  const blob = await response.blob();
  if (shouldAutoCacheMediaLink(mediaLink)) {
    const mime = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('Content-Type')
      : null;
    blob.arrayBuffer().then(function(arrayBuffer) {
      return cacheExternalMediaBytes(cacheKey, arrayBuffer, mime);
    }).catch(function() {});
  }
  return blob;
}

async function playResolverProxiedCandidate(candidate, options) {
  const opts = options || {};
  const mediaLink = String(candidate.link || candidate.mediaLink || '').trim();
  if (!mediaLink) throw new Error('Missing media link');
  const blob = await fetchResolverProxiedAudioBlob(mediaLink, opts);
  return playAudioBlob(blob, candidate, opts);
}

function markStandaloneMediaStarted(candidate) {
  bindStandaloneNativeListeners();
  setActiveStandaloneMedia(candidate, true);
}

export async function playMediaCandidate(candidate, mediaController, options) {
  const opts = options || {};
  if (!candidate) return false;
  if (mediaController && mediaController.preparePlaybackFromUserGesture) {
    mediaController.preparePlaybackFromUserGesture();
  }
  await stopStandaloneMediaPlayback();
  if (isDeviceFileResult(candidate) && candidate.uri) {
    if (!prefersNativeMediaPlayback()) {
      throw new Error('Device file playback is only available in the Android app');
    }
    if (mediaController) {
      hardSilenceWebViewOutputs(mediaController);
    }
    await playAndroidNativeUri(candidate.uri, {
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
      play: opts.play !== false,
    });
    markStandaloneMediaStarted(candidate);
    return true;
  }
  if (isMusicCollectionSearchCandidate(candidate)) {
    await playCollectionCandidate(candidate, opts);
    markStandaloneMediaStarted(candidate);
    return true;
  }
  if (candidate.link || candidate.mediaLink) {
    await playResolverProxiedCandidate(candidate, opts);
    markStandaloneMediaStarted(candidate);
    return true;
  }
  return false;
}

export async function playExternalMediaItem(externalMedia, mediaController, options) {
  if (!externalMedia) return false;
  if (externalMedia.youtubeId) {
    return false;
  }
  if (mediaController && mediaController.abortPlayingIntent) {
    mediaController.abortPlayingIntent();
  }
  await stopStandaloneMediaPlayback();
  if (externalMedia.uri) {
    if (!prefersNativeMediaPlayback()) {
      throw new Error('Device file playback is only available in the Android app');
    }
    if (mediaController) {
      hardSilenceWebViewOutputs(mediaController);
    }
    await playAndroidNativeUri(externalMedia.uri, {
      title: externalMedia.title || 'Track',
      artist: externalMedia.artist || '',
      play: options && options.play !== false,
    });
    markStandaloneMediaStarted({
      source: 'device-file',
      uri: externalMedia.uri,
      title: externalMedia.title,
      artist: externalMedia.artist,
    });
    return true;
  }
  if (externalMedia.mediaLink) {
    await playResolverProxiedCandidate(externalMedia, options || {});
    markStandaloneMediaStarted({
      source: externalMedia.source || 'external',
      link: externalMedia.mediaLink,
      title: externalMedia.title,
      artist: externalMedia.artist,
    });
    return true;
  }
  if (externalMedia.collectionLink || externalMedia.collectionPath) {
    const collectionCandidate = {
      title: externalMedia.title,
      artist: externalMedia.artist,
      path: externalMedia.collectionPath,
      link: externalMedia.collectionLink,
      source: 'music-collection',
    };
    await playCollectionCandidate(collectionCandidate, options || {});
    markStandaloneMediaStarted(collectionCandidate);
    return true;
  }
  return false;
}
