import { fetchViaMediaProxy } from './mediaProxyClient';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';

function resolveToken(options) {
  const opts = options || {};
  return resolveResolverAccessToken(opts.accessToken || opts.token)
    || getActiveResolverAccessToken()
    || '';
}

export async function fetchMusicCollectionRegistry(options) {
  const response = await fetchViaMediaProxy('/music-collection-registry', resolveToken(options), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options && options.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Registry fetch failed');
  return body.registry || {};
}

export async function browseMusicCollection(options) {
  const opts = options || {};
  const params = new URLSearchParams();
  if (opts.phase) params.set('phase', opts.phase);
  if (opts.genre) params.set('genre', opts.genre);
  if (opts.artist) params.set('artist', opts.artist);
  if (opts.collectionId) params.set('collectionId', opts.collectionId);
  if (opts.triageStatus) params.set('triageStatus', opts.triageStatus);
  if (opts.unplayedOnly) params.set('unplayedOnly', 'true');
  if (opts.query) params.set('query', opts.query);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const response = await fetchViaMediaProxy('/browse-music-collection?' + params.toString(), resolveToken(opts), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Browse failed');
  return body;
}

export async function fetchMusicCollectionDuplicates(options) {
  const opts = options || {};
  const params = new URLSearchParams();
  if (opts.groupType) params.set('groupType', opts.groupType);
  if (opts.phase) params.set('phase', opts.phase);
  if (opts.songKey) params.set('songKey', opts.songKey);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const response = await fetchViaMediaProxy('/music-collection-duplicates?' + params.toString(), resolveToken(opts), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Duplicate fetch failed');
  return {
    groups: body.groups || [],
    total: typeof body.total === 'number' ? body.total : (body.groups || []).length,
    offset: body.offset || 0,
    limit: body.limit || opts.limit || 50,
  };
}

export async function fetchMusicCollectionArtists(options) {
  const opts = options || {};
  const params = new URLSearchParams();
  if (opts.phase) params.set('phase', opts.phase);
  if (opts.query) params.set('query', opts.query);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const response = await fetchViaMediaProxy('/music-collection-artists?' + params.toString(), resolveToken(opts), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Artist list failed');
  return body;
}

export async function fetchMusicCollectionChunks(options) {
  const opts = options || {};
  const params = new URLSearchParams();
  if (opts.phase) params.set('phase', opts.phase);
  if (opts.query) params.set('query', opts.query);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const response = await fetchViaMediaProxy('/music-collection-chunks?' + params.toString(), resolveToken(opts), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Folder list failed');
  return body;
}

export async function setMusicCollectionTriageBulk(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy('/music-collection-triage/bulk', resolveToken(opts), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scope: opts.scope,
      value: opts.value || '',
      phase: opts.phase || '',
      status: opts.status,
      playCountMin: opts.playCountMin,
      playCountMax: opts.playCountMax,
      triageUnsetOnly: opts.triageUnsetOnly === true,
      note: opts.note || '',
    }),
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Bulk triage failed');
  return body;
}

export async function setMusicCollectionTriage(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy('/music-collection-triage', resolveToken(opts), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      entryId: opts.entryId,
      status: opts.status,
      note: opts.note || '',
    }),
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Triage update failed');
  return body;
}

export async function createMusicCollectionMovePlan(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy('/music-collection-move-plan', resolveToken(opts), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: opts.type || 'library',
      phase: opts.phase || '',
      triageOnly: opts.triageOnly !== false,
      includeDuplicates: opts.includeDuplicates === true,
      groupType: opts.groupType || 'songKey',
      limit: opts.limit || 5000,
      apply: opts.apply === true,
      staging: opts.staging === true,
    }),
    signal: opts.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body && body.error ? body.error : 'Move plan failed');
  return body;
}
