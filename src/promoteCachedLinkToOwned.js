import {
  getCachedExternalMediaBlob,
  getExternalMediaCacheKey,
} from './externalMediaAudioCache';
import { requiresResolverProxiedPlayback } from './mediaProxyClient';
import { shouldAutoCacheMediaLink } from './mediaLinkAutoCache';
import { createOwnedMediaLink, isOwnedMediaLink } from './linkRecording';
import { resolveUriPlaybackSrcType } from './mediaLinkSrcType';

export function tuneHasPromotableLinkCandidates(tune, isYoutubeLink) {
  if (!tune || !Array.isArray(tune.links)) return false;
  return tune.links.some(function(link) {
    const src = String(link && link.link ? link.link : '').trim();
    return canPromoteCachedLinkToOwned(link, src, isYoutubeLink);
  });
}

export function canPromoteCachedLinkToOwned(link, src, isYoutubeLink) {
  if (!link || isOwnedMediaLink(link)) return false;
  const trimmed = String(src || link.link || '').trim();
  if (!trimmed) return false;
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(trimmed)) return false;
  if (requiresResolverProxiedPlayback(trimmed)) return true;
  return shouldAutoCacheMediaLink(trimmed, isYoutubeLink);
}

export async function promoteCachedLinkToOwned(tune, linkIndex, options) {
  const opts = options || {};
  if (!tune || !tune.id || linkIndex === null || linkIndex === undefined) {
    throw new Error('Missing tune or link index');
  }
  const links = Array.isArray(tune.links) ? tune.links.slice() : [];
  const link = links[linkIndex];
  if (!link) {
    throw new Error('Link not found');
  }
  const src = String(link.link || '').trim();
  if (!canPromoteCachedLinkToOwned(link, src, opts.isYoutubeLink)) {
    throw new Error('This link cannot be saved to Drive');
  }

  const cacheKey = getExternalMediaCacheKey(tune.id, linkIndex, src);
  const cached = await getCachedExternalMediaBlob(cacheKey);
  if (!cached || !cached.blob) {
    throw new Error('Play or cache this link on this device first');
  }

  const token = opts.token;
  const driveApi = opts.driveApi;
  if (!token || !driveApi) {
    throw new Error('Log in with Google to save to Drive');
  }

  const srcType = resolveUriPlaybackSrcType(src, opts.isYoutubeLink);
  const created = await createOwnedMediaLink({
    tune: tune,
    audioBlob: cached.blob,
    title: link.title || tune.name || 'Cached track',
    source: 'promoted-cache',
    linkIndex: linkIndex,
    token: token,
    driveApi: driveApi,
    uploadToDrive: true,
    mediaKind: srcType === 'midifile' ? 'midi' : 'audio',
  });

  links[linkIndex] = Object.assign({}, created.link, {
    title: link.title || created.link.title || '',
    startAt: link.startAt || '',
    endAt: link.endAt || '',
  });

  return {
    tune: Object.assign({}, tune, { links: links }),
    uploaded: !!(created.link && created.link.googleId),
    link: links[linkIndex],
  };
}
