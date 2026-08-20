import { isArchiveOrgLinkUri } from './archiveOrgLinkUtils';
import { isBandcampLinkUri } from './bandcampLinkUtils';
import { isLocGovLinkUri } from './locGovLinkUtils';
import { isMusicCollectionLinkUri } from './musicCollectionLinkUtils';
import {
  cacheExternalMediaFromSrc,
  getStandaloneProxiedMediaCacheKey,
  isExternalMediaCached,
} from './externalMediaAudioCache';
import { resolveUriPlaybackSrcType } from './mediaLinkSrcType';
import * as mediaCacheQueue from './mediaCacheQueue';

/**
 * Archive / library sources that are slow to stream through the resolver and
 * safe to cache locally without the explicit "cache played media" toggle.
 */
export function shouldAutoCacheMediaLink(src, isYoutubeLink) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(trimmed)) return false;
  return isArchiveOrgLinkUri(trimmed)
    || isLocGovLinkUri(trimmed)
    || isBandcampLinkUri(trimmed);
}

/** Any non-YouTube audio link chosen in the media/links manager should be cached. */
export function shouldCacheSelectedMediaLink(src, srcType, isYoutubeLink) {
  if (!src || srcType !== 'audio') return false;
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(src)) return false;
  return true;
}

export function shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, autocacheOnPlay) {
  if (!src) return false;
  const isYoutube = srcType === 'youtube'
    || (typeof isYoutubeLink === 'function' && isYoutubeLink(src));
  if (isYoutube) return !!autocacheOnPlay;
  if (srcType !== 'audio') return false;
  if (autocacheOnPlay) return true;
  return shouldAutoCacheMediaLink(src, isYoutubeLink);
}

function enqueueCacheJobForLink(tune, linkIndex, link, options) {
  const opts = options || {};
  if (!tune || !tune.id || linkIndex === null || linkIndex === undefined || !link) {
    return null;
  }
  const src = String(link.link || '').trim();
  if (!src) return null;
  const isYoutubeLink = opts.isYoutubeLink;
  const srcType = resolveUriPlaybackSrcType(src, isYoutubeLink);
  if (opts.selectedInLinksEditor) {
    if (!shouldCacheSelectedMediaLink(src, srcType, isYoutubeLink)) return null;
  } else if (!shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, !!opts.autocacheOnPlay)) {
    return null;
  }
  return mediaCacheQueue.enqueueCacheJob({
    tuneId: tune.id,
    linkIndex: linkIndex,
    src: src,
    srcType: srcType,
    tuneName: tune.name || '',
    linkTitle: link.title || '',
    youtubeGetId: opts.youtubeGetId,
    accessToken: opts.accessToken || null,
  });
}

export function enqueueAutoCacheMediaLink(tune, linkIndex, link, options) {
  return enqueueCacheJobForLink(tune, linkIndex, link, options);
}

export function enqueueAutoCacheForTuneLinks(tune, options) {
  const jobIds = [];
  if (!tune || !tune.id || !Array.isArray(tune.links)) return jobIds;
  tune.links.forEach(function(link, linkIndex) {
    const jobId = enqueueCacheJobForLink(tune, linkIndex, link, options);
    if (jobId) jobIds.push(jobId);
  });
  return jobIds;
}

export function startMediaLinkAutoCacheQueue() {
  if (!mediaCacheQueue.getState().running) {
    mediaCacheQueue.start();
  }
}

export async function scheduleMediaLinkCacheIfNeeded(tune, linkIndex, link, options) {
  const opts = options || {};
  if (!tune || !tune.id || linkIndex === null || linkIndex === undefined || !link) {
    return false;
  }
  const src = String(link.link || '').trim();
  if (!src) return false;
  const isYoutubeLink = opts.isYoutubeLink;
  const srcType = resolveUriPlaybackSrcType(src, isYoutubeLink);
  if (!shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, !!opts.autocacheOnPlay)) {
    return false;
  }
  const cached = await isExternalMediaCached(tune.id, linkIndex, src);
  if (cached) return true;
  const jobId = enqueueCacheJobForLink(tune, linkIndex, link, opts);
  if (jobId) {
    startMediaLinkAutoCacheQueue();
    return false;
  }
  return false;
}

function scheduleStandaloneMediaLinkCache(link, options) {
  const opts = options || {};
  const src = String(link && link.link || '').trim();
  if (!src) return false;
  const isYoutubeLink = opts.isYoutubeLink;
  const srcType = resolveUriPlaybackSrcType(src, isYoutubeLink);
  if (!shouldCacheSelectedMediaLink(src, srcType, isYoutubeLink)) {
    return false;
  }
  const cacheKey = getStandaloneProxiedMediaCacheKey(src);
  Promise.resolve(
    cacheExternalMediaFromSrc(cacheKey, {
      src: src,
      srcType: srcType,
      youtubeGetId: opts.youtubeGetId,
      accessToken: opts.accessToken,
    })
  ).catch(function() {});
  return true;
}

/**
 * Start caching a media link selected in the links editor (non-YouTube).
 */
export function scheduleSelectedMediaLinkCache(link, tune, options) {
  const opts = options || {};
  const src = String(link && link.link || '').trim();
  if (!src) return false;
  const isYoutubeLink = opts.isYoutubeLink;
  const srcType = resolveUriPlaybackSrcType(src, isYoutubeLink);
  if (!shouldCacheSelectedMediaLink(src, srcType, isYoutubeLink)) {
    return false;
  }
  if (tune && tune.id && Array.isArray(tune.links)) {
    let linkIndex = -1;
    for (let i = 0; i < tune.links.length; i += 1) {
      if (String(tune.links[i] && tune.links[i].link || '').trim() === src) {
        linkIndex = i;
        break;
      }
    }
    if (linkIndex < 0) linkIndex = 0;
    const jobId = enqueueCacheJobForLink(tune, linkIndex, link, Object.assign({}, opts, {
      selectedInLinksEditor: true,
    }));
    if (jobId) {
      startMediaLinkAutoCacheQueue();
      return true;
    }
    return false;
  }
  return scheduleStandaloneMediaLinkCache(link, opts);
}
