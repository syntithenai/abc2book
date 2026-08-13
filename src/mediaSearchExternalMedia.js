import { isMusicCollectionLinkUri } from './musicCollectionLinkUtils';
import { requiresResolverProxiedPlayback } from './mediaProxyClient';
import { isMusicCollectionResult, isDeviceFileResult } from './mediaLinkSearchDisplay';

function candidateLink(candidate) {
  return String(candidate && candidate.link ? candidate.link : '').trim();
}

function candidateYoutubeId(candidate) {
  if (!candidate) return '';
  if (candidate.youtubeId) return String(candidate.youtubeId).trim();
  if (candidate.source === 'youtube' && candidate.id) return String(candidate.id).trim();
  return '';
}

export function isMusicCollectionSearchCandidate(candidate) {
  if (!candidate) return false;
  if (isMusicCollectionResult(candidate)) return true;
  const link = candidateLink(candidate);
  return !!link && isMusicCollectionLinkUri(link);
}

export function isResolverProxiedSearchCandidate(candidate) {
  if (!candidate) return false;
  const link = candidateLink(candidate);
  if (!link) return false;
  if (isMusicCollectionLinkUri(link)) return false;
  return requiresResolverProxiedPlayback(link);
}

/**
 * Normalize a media-search hit into queue / standalone playback metadata.
 */
export function externalMediaFromCandidate(candidate) {
  if (!candidate) return null;

  const youtubeId = candidateYoutubeId(candidate);
  if (youtubeId) {
    return Object.assign({}, candidate, {
      source: candidate.source || 'youtube',
      youtubeId: youtubeId,
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

  const link = candidateLink(candidate);
  if (isMusicCollectionSearchCandidate(candidate) && (link || candidate.path)) {
    return {
      source: 'music-collection',
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
      collectionEntryId: candidate.id || '',
      collectionLink: link,
      collectionPath: candidate.path || '',
      image: candidate.image || '',
    };
  }

  if (link && /^https?:\/\//i.test(link)) {
    return {
      source: candidate.source || 'web-media',
      title: candidate.title || 'Track',
      artist: candidate.artist || '',
      mediaLink: link,
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
  if (externalMedia.mediaLink) return true;
  return false;
}
