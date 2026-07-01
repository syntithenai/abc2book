import { fetchViaMediaProxy } from './mediaProxyClient';

const PLAYBACK_REGION_ACCEPT_HEADER = 'application/x-ndjson, application/json';

function normalizePlaybackRegionScan(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid playback region response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  return {
    startAt: typeof body.startAt === 'number' ? body.startAt : 0,
    endAt: typeof body.endAt === 'number' ? body.endAt : 0,
    duration: typeof body.duration === 'number' ? body.duration : 0,
    confidence: typeof body.confidence === 'number' ? body.confidence : 0,
    method: typeof body.method === 'string' ? body.method : '',
    backend: typeof body.backend === 'string' ? body.backend : '',
  };
}

async function parsePlaybackRegionScanResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable playback region response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Playback region scan failed');
  }

  return normalizePlaybackRegionScan(body);
}

export function handlePlaybackRegionScanStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress(
        event.message || '',
        event.progress,
        event.stage || ''
      );
    }
    return null;
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Playback region scan failed');
  }
  if (event.type === 'result') {
    return normalizePlaybackRegionScan(event.body);
  }
  return null;
}

async function parseStreamingPlaybackRegionScanResponse(response, onProgress) {
  if (!response.ok) {
    return parsePlaybackRegionScanResponse(response);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parsePlaybackRegionScanResponse(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(function(line) {
      if (!line.trim()) return;
      const parsed = handlePlaybackRegionScanStreamEvent(JSON.parse(line), onProgress);
      if (parsed) result = parsed;
    });
  }

  if (buffer.trim()) {
    const parsed = handlePlaybackRegionScanStreamEvent(JSON.parse(buffer), onProgress);
    if (parsed) result = parsed;
  }

  if (!result) {
    throw new Error('Playback region scan stream ended without a result');
  }
  return result;
}

async function parseScanResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingPlaybackRegionScanResponse(response, onProgress);
  }
  return parsePlaybackRegionScanResponse(response);
}

export async function scanPlaybackRegion(options) {
  const {
    sourceUrl,
    sourceType,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!sourceUrl || !String(sourceUrl).trim()) {
    throw new Error('Media URL is required');
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting scan...', 0, 'start');
  }

  const response = await fetchViaMediaProxy('/detect-playback-region', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      sourceUrl: sourceUrl,
      sourceType: sourceType || 'audio',
    }),
    signal: signal,
    headers: {
      Accept: PLAYBACK_REGION_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  });

  return parseScanResponse(response, onProgress);
}

export { normalizePlaybackRegionScan };
