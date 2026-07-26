import { fetchViaMediaProxy } from './mediaProxyClient';

function normalizeChordDiscovery(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid chord discovery response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  return {
    segments: Array.isArray(body.segments) ? body.segments : [],
    beatTimes: Array.isArray(body.beatTimes) ? body.beatTimes : [],
    tempo: typeof body.tempo === 'number' ? body.tempo : 0,
    duration: typeof body.duration === 'number' ? body.duration : 0,
    backend: typeof body.backend === 'string' ? body.backend : '',
  };
}

async function parseChordDiscoveryResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable chord discovery response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Chord discovery failed');
  }

  return normalizeChordDiscovery(body);
}

export async function discoverChordsFromSource(options) {
  const {
    source,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!source) {
    throw new Error('No media source selected');
  }

  if (source.kind === 'recording') {
    if (!source.blob) {
      throw new Error('Recording data is not available');
    }
    if (typeof onProgress === 'function') {
      onProgress('Uploading audio...');
    }
    const formData = new FormData();
    formData.append('file', source.blob, source.fileName || 'recording.wav');
    const response = await fetchViaMediaProxy('/detect-chords', accessToken, {
      method: 'POST',
      body: formData,
      signal: signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (typeof onProgress === 'function') {
      onProgress('Formatting chords...');
    }
    return parseChordDiscoveryResponse(response);
  }

  if (!source.src) {
    throw new Error('No linked media source selected');
  }

  if (typeof onProgress === 'function') {
    onProgress(source.srcType === 'youtube' ? 'Resolving audio...' : 'Fetching audio...');
  }

  const response = await fetchViaMediaProxy('/detect-chords', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      sourceUrl: source.src,
      sourceType: source.srcType || 'audio',
      sourceName: source.label || '',
    }),
    signal: signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (typeof onProgress === 'function') {
    onProgress('Formatting chords...');
  }

  return parseChordDiscoveryResponse(response);
}
