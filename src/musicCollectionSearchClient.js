import {
  fetchViaMediaProxy,
  isMediaProxyConfigured,
} from './mediaProxyClient';
import { getActiveResolverAccessToken, getMediaResolverHealthState } from './mediaResolverHealthStore';
import { resolverHasFeature } from './resolverFeatures';
import { resolveResolverAccessToken } from './resolverAccessToken';

function resolveCollectionAccessToken(options) {
  const opts = options || {};
  return resolveResolverAccessToken(opts.accessToken || opts.token)
    || getActiveResolverAccessToken()
    || '';
}

function emptyResult() {
  return { empty: true, candidates: [] };
}

export function isMusicCollectionAvailable() {
  if (!isMediaProxyConfigured()) return false;
  const health = getMediaResolverHealthState();
  if (!health || !health.available || !health.status) return false;
  const status = health.status;
  if (resolverHasFeature(status, 'musicCollection')) return true;
  return typeof status.musicCollectionCount === 'number' && status.musicCollectionCount > 0;
}

/**
 * Search the resolver-hosted personal music collection.
 */
export async function searchMusicCollection(options) {
  const opts = options || {};
  const title = String(opts.title || opts.query || '').trim();
  const artist = String(opts.artist || '').trim();
  if (!title && !artist) {
    return emptyResult();
  }
  if (!isMusicCollectionAvailable()) {
    return emptyResult();
  }

  const accessToken = resolveCollectionAccessToken(opts) || null;
  const maxResults = opts.maxResults || 8;
  const response = await fetchViaMediaProxy('/search-music-collection', accessToken, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: title,
      artist: artist,
      query: title,
      limit: maxResults,
      maxResults: maxResults,
    }),
    signal: opts.signal,
  });

  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Music collection search returned an unreadable response');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return emptyResult();
    }
    throw new Error(body && body.error ? body.error : 'Music collection search failed');
  }

  const candidates = Array.isArray(body && body.candidates) ? body.candidates : [];
  if (candidates.length === 0) {
    return emptyResult();
  }
  if (candidates.length === 1) {
    return Object.assign({ empty: false, multiple: false }, candidates[0]);
  }
  return { empty: false, multiple: true, candidates: candidates };
}
