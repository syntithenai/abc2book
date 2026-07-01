import { fetchViaMediaProxy } from './mediaProxyClient';

export function normalizeVoiceCommandResponse(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid voice command response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  const timing = body.timing && typeof body.timing === 'object' ? body.timing : {};

  return {
    transcript: typeof body.transcript === 'string' ? body.transcript.trim() : '',
    tool: typeof body.tool === 'string' ? body.tool.trim().toUpperCase() : 'NONE',
    title: typeof body.title === 'string' ? body.title.trim() : '',
    artist: typeof body.artist === 'string' ? body.artist.trim() : '',
    book: typeof body.book === 'string' ? body.book.trim() : '',
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],
    searchText: typeof body.searchText === 'string' ? body.searchText.trim() : '',
    confidence: typeof body.confidence === 'number' ? body.confidence : 0,
    parseMethod: typeof body.parseMethod === 'string' ? body.parseMethod : 'none',
    timing: {
      transcribeMs: typeof timing.transcribeMs === 'number' ? timing.transcribeMs : 0,
      parseMs: typeof timing.parseMs === 'number' ? timing.parseMs : 0,
      totalMs: typeof timing.totalMs === 'number' ? timing.totalMs : 0,
    },
  };
}

async function parseVoiceCommandResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable voice command response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Voice command failed');
  }

  return normalizeVoiceCommandResponse(body);
}

export async function submitVoiceCommand(options) {
  const {
    blob,
    fileName,
    books,
    tags,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!blob) {
    throw new Error('No audio captured');
  }

  if (typeof onProgress === 'function') {
    onProgress('Uploading audio...');
  }

  const formData = new FormData();
  formData.append('file', blob, fileName || 'voice-command.webm');
  formData.append('books', JSON.stringify(Array.isArray(books) ? books : []));
  formData.append('tags', JSON.stringify(Array.isArray(tags) ? tags : []));

  if (typeof onProgress === 'function') {
    onProgress('Processing voice command...');
  }

  const response = await fetchViaMediaProxy('/voice-command', accessToken, {
    method: 'POST',
    body: formData,
    signal: signal,
    headers: {
      Accept: 'application/json',
    },
  });

  return parseVoiceCommandResponse(response);
}
