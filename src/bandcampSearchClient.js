import {
  fetchViaMediaProxy,
} from './mediaProxyClient';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';
import { isResolverMediaSearchAvailable } from './mediaSearchResolverClient';

function resolveBandcampAccessToken(options) {
  const opts = options || {};
  return resolveResolverAccessToken(opts.accessToken || opts.token)
    || getActiveResolverAccessToken()
    || '';
}

function emptyResult() {
  return { empty: true, candidates: [] };
}

export function isBandcampSearchAvailable() {
  return isResolverMediaSearchAvailable();
}

/**
 * Search Bandcamp tracks via the media resolver fuzzysearch proxy.
 */
export async function searchBandcamp(options) {
  const opts = options || {};
  const title = String(opts.title || opts.query || '').trim();
  const artist = String(opts.artist || '').trim();
  const query = String(opts.query || '').trim() || [title, artist].filter(Boolean).join(' ').trim();
  if (!query && !title && !artist) {
    return emptyResult();
  }
  if (!isBandcampSearchAvailable()) {
    return emptyResult();
  }

  const accessToken = resolveBandcampAccessToken(opts) || null;
  const maxResults = opts.maxResults || 20;
  const response = await fetchViaMediaProxy('/search-bandcamp', accessToken, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: title || query,
      artist: artist,
      query: query || title,
      limit: maxResults,
      maxResults: maxResults,
    }),
    signal: opts.signal,
  });

  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Bandcamp search returned an unreadable response');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return emptyResult();
    }
    throw new Error(body && body.error ? body.error : 'Bandcamp search failed');
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
