import { fetchViaMediaProxy, getActiveMediaProxyBase } from './mediaProxyClient';
import { requiresResolverProxiedPlayback } from './mediaProxyClient';

function resolveToken(options) {
  const opts = options || {};
  return opts.accessToken || opts.token || null;
}

/** Resolver base Chromecast can fetch from (LAN/public URL, not localhost). */
export function getCastResolverBase(options) {
  const opts = options || {};
  if (opts.resolverBase) return String(opts.resolverBase).replace(/\/$/, '');
  const castBase = process.env.REACT_APP_CAST_RESOLVER_BASE || '';
  if (castBase) return castBase.replace(/\/$/, '');
  return (getActiveMediaProxyBase() || '').replace(/\/$/, '');
}

export function buildCastMediaUrl(src, options) {
  const opts = options || {};
  if (!src || String(src).startsWith('blob:')) return null;
  const base = getCastResolverBase(opts);
  if (!base) return null;
  if (requiresResolverProxiedPlayback(src)) {
    return base + '/proxy-audio?url=' + encodeURIComponent(src);
  }
  if (String(src).startsWith('http://') || String(src).startsWith('https://')) {
    return base + '/proxy-audio?url=' + encodeURIComponent(src);
  }
  return src;
}

export function buildCastHlsUrl(sessionId, options) {
  const opts = options || {};
  const base = getCastResolverBase(opts);
  if (!base || !sessionId) return null;
  return base + '/cast-playback/session/' + encodeURIComponent(sessionId) + '/playlist.m3u8';
}

export async function waitForCastPlaylistReady(sessionId, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 15000;
  const pollMs = opts.pollMs != null ? opts.pollMs : 500;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await getCastSessionStatus(sessionId, opts);
    if (status && status.playlistReady) return status;
    await new Promise(function(resolve) { setTimeout(resolve, pollMs); });
  }
  throw new Error('Cast playlist not ready — check resolver is reachable from your TV');
}

export async function sendCastSessionHeartbeat(sessionId, playheadSeconds, options) {
  const response = await fetchViaMediaProxy(
    '/cast-playback/session/' + encodeURIComponent(sessionId) + '/heartbeat',
    resolveToken(options),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playheadSeconds: playheadSeconds }),
    }
  );
  if (!response.ok) return null;
  return response.json().catch(function() { return null; });
}

export async function createCastPlaybackSession(options) {
  const opts = options || {};
  const response = await fetchViaMediaProxy('/cast-playback/session', resolveToken(opts), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: opts.source,
      sourceType: opts.sourceType,
      startSeconds: opts.startSeconds,
      duration: opts.duration,
      title: opts.title,
      artist: opts.artist,
      pitch: opts.pitch,
      fineTune: opts.fineTune,
      tempo: opts.tempo,
      midiBase64: opts.midiBase64,
      queue: opts.queue,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(function() { return {}; });
    throw new Error(body.error || body.detail || 'Cast session failed');
  }
  return response.json();
}

export async function getCastSessionStatus(sessionId, options) {
  const response = await fetchViaMediaProxy(
    '/cast-playback/session/' + encodeURIComponent(sessionId) + '/status',
    resolveToken(options)
  );
  if (!response.ok) throw new Error('Cast status failed');
  return response.json();
}

export async function seekCastSession(sessionId, seconds, options) {
  const response = await fetchViaMediaProxy(
    '/cast-playback/session/' + encodeURIComponent(sessionId) + '/seek',
    resolveToken(options),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds: seconds }),
    }
  );
  if (!response.ok) throw new Error('Cast seek failed');
  return response.json();
}

export async function advanceCastSession(sessionId, options) {
  const response = await fetchViaMediaProxy(
    '/cast-playback/session/' + encodeURIComponent(sessionId) + '/next',
    resolveToken(options),
    { method: 'POST' }
  );
  if (!response.ok) {
    const body = await response.json().catch(function() { return {}; });
    throw new Error(body.error || body.detail || 'Cast queue advance failed');
  }
  return response.json();
}

export async function deleteCastSession(sessionId, options) {
  const response = await fetchViaMediaProxy(
    '/cast-playback/session/' + encodeURIComponent(sessionId),
    resolveToken(options),
    { method: 'DELETE' }
  );
  if (!response.ok && response.status !== 404) throw new Error('Cast delete failed');
  return true;
}
