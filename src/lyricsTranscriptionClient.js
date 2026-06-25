import { fetchViaMediaProxy } from './mediaProxyClient';

function normalizeTranscription(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid transcription response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    throw new Error('Transcription produced no lyrics');
  }
  return {
    text: text,
    segments: Array.isArray(body.segments) ? body.segments : [],
    language: typeof body.language === 'string' ? body.language : '',
    backend: typeof body.backend === 'string' ? body.backend : '',
  };
}

async function parseTranscriptionResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable transcription response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Transcription failed');
  }

  return normalizeTranscription(body);
}

export async function transcribeLyricsSource(options) {
  const {
    source,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!source) {
    throw new Error('No transcription source selected');
  }

  if (typeof onProgress === 'function') {
    onProgress(source.kind === 'recording' ? 'Uploading audio...' : 'Resolving audio...');
  }

  if (source.kind === 'recording') {
    if (!source.blob) {
      throw new Error('Recording data is not available');
    }
    const formData = new FormData();
    formData.append('file', source.blob, source.fileName || 'recording.wav');
    formData.append('sourceName', source.label || source.fileName || 'Recording');
    if (typeof onProgress === 'function') {
      onProgress('Transcribing audio... (this can take several minutes)');
    }
    const response = await fetchViaMediaProxy('/transcribe', accessToken, {
      method: 'POST',
      body: formData,
      signal: signal,
      headers: {
        Accept: 'application/json',
      },
    });
    return parseTranscriptionResponse(response);
  }

  if (!source.src) {
    throw new Error('Media source URL is missing');
  }

  if (typeof onProgress === 'function') {
    onProgress('Transcribing audio... (this can take several minutes)');
  }

  const response = await fetchViaMediaProxy('/transcribe', accessToken, {
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

  return parseTranscriptionResponse(response);
}
