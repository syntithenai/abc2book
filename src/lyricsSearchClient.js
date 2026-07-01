import { fetchViaMediaProxy } from './mediaProxyClient';

const LYRICS_ACCEPT_HEADER = 'application/x-ndjson, application/json';

function normalizeSingleLyricsResult(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    throw new Error('Lyrics search returned no text');
  }

  const lines = Array.isArray(body.lines) && body.lines.length > 0
    ? body.lines.map(function(line) { return String(line); })
    : text.split('\n');

  return {
    text: text,
    lines: lines,
    stanzas: Array.isArray(body.stanzas) ? body.stanzas : [],
    source: typeof body.source === 'string' ? body.source : '',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    title: typeof body.title === 'string' ? body.title : '',
    artist: typeof body.artist === 'string' ? body.artist : '',
    preview: typeof body.preview === 'string' ? body.preview : '',
    titleOnly: body.titleOnly === true,
  };
}

function normalizeLyricsSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid lyrics search response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleLyricsResult(candidate);
    });
    if (candidates.length === 0) {
      throw new Error('Lyrics search returned no candidates');
    }
    return {
      multiple: true,
      candidates: candidates,
    };
  }

  return Object.assign({ multiple: false }, normalizeSingleLyricsResult(body));
}

export function handleLyricsSearchStreamEvent(event, onProgress) {
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
    throw new Error(event.message || 'Lyrics search failed');
  }
  if (event.type === 'result') {
    return normalizeLyricsSearch(event.body);
  }
  return null;
}

async function parseLyricsSearchResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable lyrics search response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Lyrics search failed');
  }

  return normalizeLyricsSearch(body);
}

async function parseStreamingLyricsSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseLyricsSearchResponse(response);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseLyricsSearchResponse(response);
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
      const parsed = handleLyricsSearchStreamEvent(JSON.parse(line), onProgress);
      if (parsed) result = parsed;
    });
  }

  if (buffer.trim()) {
    const parsed = handleLyricsSearchStreamEvent(JSON.parse(buffer), onProgress);
    if (parsed) result = parsed;
  }

  if (!result) {
    throw new Error('Lyrics search stream ended without a result');
  }
  return result;
}

async function parseSearchResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingLyricsSearchResponse(response, onProgress);
  }
  return parseLyricsSearchResponse(response);
}

export async function searchLyrics(options) {
  const {
    title,
    artist,
    url,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!url && !(title && String(title).trim())) {
    throw new Error('Song title is required');
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting lyrics search...', 0, 'start');
  }

  const response = await fetchViaMediaProxy('/search-lyrics', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title || '',
      artist: artist || '',
      url: url || '',
    }),
    signal: signal,
    headers: {
      Accept: LYRICS_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  });

  return parseSearchResponse(response, onProgress);
}

export { normalizeLyricsSearch };
