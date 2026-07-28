import { fetchViaMediaProxy } from './mediaProxyClient';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';

function resolveToken(options) {
  const opts = options || {};
  return resolveResolverAccessToken(opts.accessToken || opts.token)
    || getActiveResolverAccessToken()
    || '';
}

export async function postSnapcastPluginAction(action, params, options) {
  const response = await fetchViaMediaProxy('/snapcast-playback/plugin', resolveToken(options), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action: action }, params || {})),
  });
  if (!response.ok) {
    throw new Error('Snapcast plugin action failed');
  }
  return response.json();
}

export async function createSnapcastPlaybackSession(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy('/snapcast-playback/session', resolveToken(opts), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: opts.source,
      sourceType: opts.sourceType || '',
      startSeconds: opts.startSeconds || 0,
      duration: opts.duration || 0,
      groupId: opts.groupId || null,
      title: opts.title || null,
      artist: opts.artist || null,
      pitch: opts.pitch || 0,
      fineTune: opts.fineTune || 0,
      tempo: opts.tempo || 1,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(function() { return {}; });
    throw new Error(body.error || body.detail || 'Snapcast session failed');
  }
  return response.json();
}

export async function getSnapcastSessionStatus(sessionId, options) {
  const response = await fetchViaMediaProxy(
    '/snapcast-playback/session/' + encodeURIComponent(sessionId) + '/status',
    resolveToken(options)
  );
  if (!response.ok) {
    throw new Error('Snapcast status failed');
  }
  return response.json();
}

export async function seekSnapcastSession(sessionId, seconds, options) {
  const response = await fetchViaMediaProxy('/snapcast-playback/session/' + encodeURIComponent(sessionId) + '/seek', resolveToken(options), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seconds: seconds }),
  });
  if (!response.ok) {
    throw new Error('Snapcast seek failed');
  }
  return response.json();
}

export async function deleteSnapcastSession(sessionId, options) {
  const response = await fetchViaMediaProxy('/snapcast-playback/session/' + encodeURIComponent(sessionId), resolveToken(options), {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error('Snapcast stop failed');
  }
  return true;
}
