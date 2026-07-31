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
import { loadNativePlayer, stopNativePlayer } from './nativeMediaPlayer';
import { hardSilenceWebViewOutputs } from './androidPlaybackGate';

export { externalMediaFromCandidate, isStandaloneExternalMedia } from './mediaSearchExternalMedia';

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

export async function playMediaCandidate(candidate, mediaController, options) {
  const opts = options || {};
  if (!candidate) return false;
  if (mediaController && mediaController.preparePlaybackFromUserGesture) {
    mediaController.preparePlaybackFromUserGesture();
  }
  if (isDeviceFileResult(candidate) && candidate.uri) {
    if (!prefersNativeMediaPlayback()) {
      throw new Error('Device file playback is only available in the Android app');
    }
    await stopNativePlayer();
    if (mediaController) {
      hardSilenceWebViewOutputs(mediaController);
    }
    await playAndroidNativeUri(candidate.uri, {
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
      play: opts.play !== false,
    });
    return true;
  }
  if (isMusicCollectionSearchCandidate(candidate)) {
    await playCollectionCandidate(candidate, opts);
    return true;
  }
  if (candidate.link || candidate.mediaLink) {
    await playResolverProxiedCandidate(candidate, opts);
    return true;
  }
  return false;
}

export async function playExternalMediaItem(externalMedia, mediaController, options) {
  if (!externalMedia) return false;
  if (externalMedia.youtubeId) {
    return false;
  }
  if (externalMedia.uri) {
    if (!prefersNativeMediaPlayback()) {
      throw new Error('Device file playback is only available in the Android app');
    }
    await stopNativePlayer();
    if (mediaController) {
      hardSilenceWebViewOutputs(mediaController);
    }
    await playAndroidNativeUri(externalMedia.uri, {
      title: externalMedia.title || 'Track',
      artist: externalMedia.artist || '',
      play: options && options.play !== false,
    });
    return true;
  }
  if (externalMedia.mediaLink) {
    await playResolverProxiedCandidate(externalMedia, options || {});
    return true;
  }
  if (externalMedia.collectionLink || externalMedia.collectionPath) {
    await playCollectionCandidate({
      title: externalMedia.title,
      artist: externalMedia.artist,
      path: externalMedia.collectionPath,
      link: externalMedia.collectionLink,
    }, options || {});
    return true;
  }
  return false;
}
