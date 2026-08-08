import { isArchiveOrgLinkUri } from './archiveOrgLinkUtils';
import { isBandcampLinkUri } from './bandcampLinkUtils';
import { isLocGovLinkUri } from './locGovLinkUtils';
import { isMusicCollectionLinkUri } from './musicCollectionLinkUtils';
import {
  cacheExternalMediaBytes,
  getCachedExternalMediaBlob,
  getStandaloneProxiedMediaCacheKey,
  isExternalMediaCached,
} from './externalMediaAudioCache';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { resolveUriPlaybackSrcType } from './mediaLinkSrcType';
import * as mediaCacheQueue from './mediaCacheQueue';

/**
 * Archive / library sources that are slow to stream through the resolver and
 * safe to cache locally. YouTube is excluded (TOS).
 */
export function shouldAutoCacheMediaLink(src, isYoutubeLink) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(trimmed)) return false;
  return isArchiveOrgLinkUri(trimmed)
    || isLocGovLinkUri(trimmed)
    || isBandcampLinkUri(trimmed)
    || isMusicCollectionLinkUri(trimmed);
}

export function shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, autocacheOnPlay) {
  if (!src || srcType !== 'audio') return false;
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
  if (!shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, !!opts.autocacheOnPlay)) {
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
  if (!shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, false)) {
    return false;
  }
  const cacheKey = getStandaloneProxiedMediaCacheKey(src);
  Promise.resolve(
    getCachedExternalMediaBlob(cacheKey).then(function(existing) {
      if (existing && existing.blob) return null;
      return fetchAndDecodeExternalMedia(src, srcType, opts.youtubeGetId, opts.accessToken);
    }).then(function(decoded) {
      if (!decoded) return null;
      return cacheExternalMediaBytes(cacheKey, decoded.arrayBuffer, decoded.mime);
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
  if (!shouldScheduleMediaLinkCache(src, srcType, isYoutubeLink, false)) {
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
    const jobId = enqueueCacheJobForLink(tune, linkIndex, link, opts);
    if (jobId) {
      startMediaLinkAutoCacheQueue();
      return true;
    }
    return false;
  }
  return scheduleStandaloneMediaLinkCache(link, opts);
}
