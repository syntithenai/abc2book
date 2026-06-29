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
    pending: !!body.pending,
  };
}

function normalizeStemStatus(body) {
  if (!body || typeof body !== 'object') {
    return { stage: 'unknown', progress: 0, message: '' };
  }
  const progress = typeof body.progress === 'number'
    ? Math.max(0, Math.min(100, body.progress))
    : 0;
  return {
    stage: typeof body.stage === 'string' ? body.stage : 'unknown',
    progress: progress,
    message: typeof body.message === 'string' ? body.message : '',
    cached: !!body.cached,
    duration: typeof body.duration === 'number' ? body.duration : 0,
    elapsedSeconds: typeof body.elapsedSeconds === 'number' ? body.elapsedSeconds : 0,
    estimatedSeconds: typeof body.estimatedSeconds === 'number' ? body.estimatedSeconds : 0,
  };
}

async function waitForStemSeparationComplete(separation, accessToken, signal, onProgress, onStatus) {
  if (!separation || !separation.pending) {
    return separation;
  }

  const pollMs = 3000;
  const deadline = Date.now() + (15 * 60 * 1000);
  while (Date.now() < deadline) {
    if (signal && signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const status = await fetchStemSeparationStatus(separation.cacheId, accessToken, signal);
    if (typeof onStatus === 'function') {
      onStatus(status);
    }
    if (typeof onProgress === 'function') {
      onProgress(status.message || 'Separating stems...', status.progress);
    }
    if (status.stage === 'complete' || status.cached || status.progress >= 100) {
      return Object.assign({}, separation, {
        pending: false,
        cached: true,
        duration: status.duration || separation.duration,
      });
    }
    if (status.stage === 'error') {
      throw new Error(status.message || 'Stem separation failed');
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, pollMs);
    });
  }

  throw new Error('Stem separation timed out');
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

export async function fetchStemSeparationStatus(cacheId, accessToken, signal) {
  if (!cacheId) {
    return normalizeStemStatus(null);
  }
  const response = await fetchViaMediaProxy('/stems/' + cacheId + '/status', accessToken, {
    signal: signal,
    headers: {
      Accept: 'application/json',
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable stem status response');
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Stem status request failed');
  }
  return normalizeStemStatus(body);
}

export async function separateStemsFromSource(options) {
  const {
    source,
    accessToken,
    signal,
    onProgress,
    onStatus,
  } = options;

  if (!source) {
    throw new Error('No media source selected');
  }

  if (typeof onProgress === 'function') {
    onProgress('Resolving audio...', 0);
  }

  let response;
  if (source.kind === 'recording') {
    if (!source.blob) {
      throw new Error('Recording data is not available');
    }
    const formData = new FormData();
    formData.append('file', source.blob, source.fileName || 'recording.wav');
    if (typeof onProgress === 'function') {
      onProgress('Uploading audio...', 5);
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
      onProgress('Resolving audio...', 5);
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

  if (typeof onProgress === 'function') {
    onProgress('Separating stems...', 10);
  }

  const separation = await decodeStemResponse(response);
  if (separation.cached) {
    if (typeof onProgress === 'function') {
      onProgress('Stems ready', 100);
    }
    return separation;
  }

  return waitForStemSeparationComplete(
    separation,
    accessToken,
    signal,
    onProgress,
    onStatus
  );
}

export async function fetchStemBuffers(separation, accessToken, signal) {
  const stemBuffers = {};
  const stemWavBytes = {};
  const stemNames = separation && separation.stems
    ? Object.keys(separation.stems)
    : Object.keys(STEM_NAME_BY_FILTER).map(function(key) {
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
    stemWavBytes[stemName] = arrayBuffer;
    stemBuffers[stemName] = await decodeStemAudio(arrayBuffer);
  }));

  return {
    stemBuffers: stemBuffers,
    stemWavBytes: stemWavBytes,
  };
}
