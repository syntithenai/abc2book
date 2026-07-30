import { fetchViaMediaProxy } from './mediaProxyClient';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';
import { isMusicCollectionResult, isDeviceFileResult } from './mediaLinkSearchDisplay';
import { playAndroidNativeUri } from './androidNativePlayback';
import { prefersNativeMediaPlayback } from './platformUtils';
import { loadNativePlayer, stopNativePlayer } from './nativeMediaPlayer';
import { hardSilenceWebViewOutputs } from './androidPlaybackGate';

function buildCollectionProxyPath(candidate) {
  const path = String(candidate.path || '').trim();
  if (!path) return '';
  if (path.indexOf('/music-collection/') === 0) return path;
  return '/music-collection/' + path.split('/').map(encodeURIComponent).join('/');
}

export function externalMediaFromCandidate(candidate) {
  if (!candidate) return null;
  if (candidate.youtubeId) {
    return Object.assign({}, candidate, {
      source: candidate.source || 'youtube',
      title: candidate.title || 'Lesson track',
    });
  }
  if (isDeviceFileResult(candidate) && candidate.uri) {
    return {
      source: 'device-file',
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
      uri: candidate.uri,
      path: candidate.path || '',
    };
  }
  if (isMusicCollectionResult(candidate) && (candidate.link || candidate.path)) {
    return {
      source: 'music-collection',
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
      collectionLink: candidate.link || '',
      collectionPath: candidate.path || '',
      image: candidate.image || '',
    };
  }
  return null;
}

export function isStandaloneExternalMedia(externalMedia) {
  if (!externalMedia) return false;
  if (externalMedia.youtubeId) return true;
  if (externalMedia.uri) return true;
  if (externalMedia.collectionLink || externalMedia.collectionPath) return true;
  return false;
}

async function playCollectionCandidate(candidate, options) {
  const opts = options || {};
  const proxyPath = buildCollectionProxyPath(candidate);
  if (!proxyPath) throw new Error('Missing collection path');
  const token = resolveResolverAccessToken(opts.accessToken) || getActiveResolverAccessToken() || '';
  const response = await fetchViaMediaProxy(proxyPath, token);
  const blob = await response.blob();
  if (!blob || !blob.size) throw new Error('Empty audio');
  if (prefersNativeMediaPlayback()) {
    await loadNativePlayer({
      blob: blob,
      filename: (candidate.title || 'track') + '.mp3',
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
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
  if (isMusicCollectionResult(candidate)) {
    await playCollectionCandidate(candidate, opts);
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
