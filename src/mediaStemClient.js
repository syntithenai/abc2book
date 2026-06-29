import { fetchViaMediaProxy } from './mediaProxyClient';
import { STEM_NAME_BY_FILTER } from './pitchTempoUtils';

function normalizeStemResponse(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid stem separation response');
  }
  if (body.error) {
    throw new Error(body.error);
  }
  if (!body.cacheId || !body.stems || typeof body.stems !== 'object') {
    throw new Error('Resolver returned incomplete stem separation data');
  }
  return {
    cacheId: body.cacheId,
    model: typeof body.model === 'string' ? body.model : '',
    samplerate: typeof body.samplerate === 'number' ? body.samplerate : 0,
    duration: typeof body.duration === 'number' ? body.duration : 0,
    backend: typeof body.backend === 'string' ? body.backend : '',
    stems: body.stems,
    cached: !!body.cached,
  };
}

async function decodeStemResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable stem separation response');
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Stem separation failed');
  }
  return normalizeStemResponse(body);
}

async function decodeStemAudio(arrayBuffer) {
  const decodeModule = await import('audio-decode');
  const decode = decodeModule.default || decodeModule;
  return decode(arrayBuffer);
}

export async function separateStemsFromSource(options) {
  const {
    source,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!source) {
    throw new Error('No media source selected');
  }

  if (typeof onProgress === 'function') {
    onProgress(source.kind === 'recording' ? 'Uploading audio...' : 'Resolving audio...');
  }

  let response;
  if (source.kind === 'recording') {
    if (!source.blob) {
      throw new Error('Recording data is not available');
    }
    const formData = new FormData();
    formData.append('file', source.blob, source.fileName || 'recording.wav');
    if (typeof onProgress === 'function') {
      onProgress('Separating stems...');
    }
    response = await fetchViaMediaProxy('/separate-stems', accessToken, {
      method: 'POST',
      body: formData,
      signal: signal,
      headers: {
        Accept: 'application/json',
      },
    });
  } else {
    if (!source.src) {
      throw new Error('Media source URL is missing');
    }
    if (typeof onProgress === 'function') {
      onProgress('Separating stems...');
    }
    response = await fetchViaMediaProxy('/separate-stems', accessToken, {
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
  }

  return decodeStemResponse(response);
}

export async function fetchStemBuffers(separation, accessToken, signal) {
  const stemBuffers = {};
  const stemNames = Object.keys(STEM_NAME_BY_FILTER).map(function(key) {
    return STEM_NAME_BY_FILTER[key];
  });

  await Promise.all(stemNames.map(async function(stemName) {
    const stemPath = separation.stems[stemName];
    if (!stemPath) return;
    const response = await fetchViaMediaProxy(stemPath, accessToken, {
      signal: signal,
      headers: {
        Accept: 'audio/wav',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch stem: ' + stemName);
    }
    const arrayBuffer = await response.arrayBuffer();
    stemBuffers[stemName] = await decodeStemAudio(arrayBuffer);
  }));

  return stemBuffers;
}
