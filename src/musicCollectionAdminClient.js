import { fetchViaMediaProxy } from './mediaProxyClient';
import { getActiveResolverAccessToken, getMediaResolverHealthState } from './mediaResolverHealthStore';
import { resolverHasFeature } from './resolverFeatures';
import { resolveResolverAccessToken } from './resolverAccessToken';

function resolveCollectionAdminToken(options) {
  const opts = options || {};
  return resolveResolverAccessToken(opts.accessToken || opts.token)
    || getActiveResolverAccessToken()
    || '';
}

export function getMusicCollectionStatusFromHealth(status) {
  const src = status || {};
  return {
    enabled: resolverHasFeature(src, 'musicCollection'),
    count: typeof src.musicCollectionCount === 'number' ? src.musicCollectionCount : 0,
    dir: src.musicCollectionDir || null,
    indexPath: src.musicCollectionIndex || null,
    statsPath: src.musicCollectionStats || null,
    builtAt: src.musicCollectionBuiltAt || null,
    summary: src.musicCollectionSummary || null,
    resolverBase: src.activeBase || null,
  };
}

export function isMusicCollectionSettingsAvailable(status) {
  if (!status || !status.available) return false;
  return resolverHasFeature(status, 'musicCollection');
}

export function readMusicCollectionSettingsStatus() {
  const health = getMediaResolverHealthState();
  if (!isMusicCollectionSettingsAvailable(health.status)) {
    return {
      available: false,
      count: 0,
      dir: null,
      indexPath: null,
      resolverBase: null,
    };
  }
  const details = getMusicCollectionStatusFromHealth(health.status);
  return Object.assign({ available: true }, details);
}

export async function rebuildMusicCollectionIndex(options) {
  const opts = options || {};
  const accessToken = resolveCollectionAdminToken(opts) || null;
  const response = await fetchViaMediaProxy('/rebuild-music-collection-index', accessToken, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      extractArt: opts.extractArt === true,
      resume: opts.resume === true,
      background: opts.background !== false,
    }),
    signal: opts.signal,
  });

  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Music collection rebuild returned an unreadable response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Music collection rebuild failed');
  }

  return {
    ok: true,
    started: body.started === true,
    background: body.background === true,
    pid: typeof body.pid === 'number' ? body.pid : null,
    count: typeof body.musicCollectionCount === 'number'
      ? body.musicCollectionCount
      : (typeof body.count === 'number' ? body.count : 0),
    tokens: typeof body.tokens === 'number' ? body.tokens : 0,
    dir: body.musicCollectionDir || body.root || null,
    indexPath: body.musicCollectionIndex || body.indexPath || null,
    summary: body.musicCollectionSummary || null,
    stats: body.stats || null,
  };
}

export async function fetchMusicCollectionStats(options) {
  const opts = options || {};
  const accessToken = resolveCollectionAdminToken(opts) || null;
  const response = await fetchViaMediaProxy('/music-collection-stats', accessToken, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: opts.signal,
  });

  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Music collection stats returned an unreadable response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Music collection stats failed');
  }

  return {
    ok: true,
    count: typeof body.count === 'number' ? body.count : 0,
    builtAt: body.builtAt || null,
    stats: body.stats || null,
    progress: body.progress || null,
    buildRunning: body.buildRunning === true,
    recentErrors: Array.isArray(body.recentErrors) ? body.recentErrors : [],
    summary: body.musicCollectionSummary || null,
  };
}
