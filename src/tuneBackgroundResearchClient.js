import { fetchViaMediaProxy } from './mediaProxyClient';
import { isGenericArtist } from './genericArtistUtils';

const RESEARCH_ACCEPT_HEADER = 'application/x-ndjson, application/json';
const GOOGLE_SEARCH_BASE = 'https://www.google.com/search?q=';
const GOOGLE_SEARCH_URL_MAX_LENGTH = 2048;
const RESEARCH_TOPIC_PHRASES = [
  'what is the song about',
  'history and origin',
  'alternative names',
  'first recording',
  'who popularized it',
  'notable performers and covers',
  'record labels',
  'cultural context',
  'musical structure key tempo',
  'youtube recordings',
];

export function normalizeTuneBackgroundResearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid tune background research response');
  }

  if (body.error) {
    throw new Error(body.error);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    throw new Error('Tune background research returned no text');
  }

  return {
    text: text,
    sources: Array.isArray(body.sources) ? body.sources : [],
    searchBackend: typeof body.searchBackend === 'string' ? body.searchBackend : '',
    model: typeof body.model === 'string' ? body.model : '',
    title: typeof body.title === 'string' ? body.title : '',
    artist: typeof body.artist === 'string' ? body.artist : '',
    timing: body.timing && typeof body.timing === 'object' ? {
      searchMs: typeof body.timing.searchMs === 'number' ? body.timing.searchMs : 0,
      summarizeMs: typeof body.timing.summarizeMs === 'number' ? body.timing.summarizeMs : 0,
      totalMs: typeof body.timing.totalMs === 'number' ? body.timing.totalMs : 0,
      wordCount: typeof body.timing.wordCount === 'number' ? body.timing.wordCount : 0,
    } : null,
  };
}

export function formatResearchDuration(ms) {
  if (!ms || ms < 1000) return (ms || 0) + 'ms';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + 'm ' + remainder + 's';
}

export function handleTuneBackgroundResearchStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress(
        event.message || '',
        event.progress,
        event.stage || '',
        event.elapsedMs
      );
    }
    return null;
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Tune background research failed');
  }
  if (event.type === 'result') {
    return normalizeTuneBackgroundResearch(event.body);
  }
  return null;
}

async function parseTuneBackgroundResearchResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    throw new Error('Resolver returned an unreadable tune background research response');
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Tune background research failed');
  }

  return normalizeTuneBackgroundResearch(body);
}

async function parseStreamingTuneBackgroundResearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseTuneBackgroundResearchResponse(response);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseTuneBackgroundResearchResponse(response);
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
      const parsed = handleTuneBackgroundResearchStreamEvent(JSON.parse(line), onProgress);
      if (parsed) result = parsed;
    });
  }

  if (buffer.trim()) {
    const parsed = handleTuneBackgroundResearchStreamEvent(JSON.parse(buffer), onProgress);
    if (parsed) result = parsed;
  }

  if (!result) {
    throw new Error('Tune background research stream ended without a result');
  }
  return result;
}

async function parseResearchResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingTuneBackgroundResearchResponse(response, onProgress);
  }
  return parseTuneBackgroundResearchResponse(response);
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isMeaningfulLyricLine(line) {
  const text = normalizeSpace(line);
  if (text.length < 8) return false;
  if (/^\[[^\]]+\]$/.test(text)) return false;
  if (/^(verse|chorus|bridge|intro|outro|refrain)\b/i.test(text)) return false;
  return (text.match(/[A-Za-z]/g) || []).length >= 6;
}

export function extractFirstLyricLine(lyrics) {
  const text = String(lyrics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return '';
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeSpace(lines[i]);
    if (isMeaningfulLyricLine(line)) {
      return line.length > 100 ? line.slice(0, 97).trim() + '...' : line;
    }
  }
  return '';
}

function quoteTerm(value) {
  const text = normalizeSpace(value);
  return text ? '"' + text + '"' : '';
}

function assembleBackgroundSearchQuery(parts) {
  return parts.filter(Boolean).join(' ');
}

function fitsGoogleSearchUrl(query) {
  return (GOOGLE_SEARCH_BASE + encodeURIComponent(query)).length <= GOOGLE_SEARCH_URL_MAX_LENGTH;
}

export function buildTuneBackgroundSearchQuery(title, artist, lyrics) {
  const cleanTitle = normalizeSpace(title);
  if (!cleanTitle) return '';

  const cleanArtist = normalizeSpace(artist);
  const lyricLine = extractFirstLyricLine(lyrics);
  const topicWords = RESEARCH_TOPIC_PHRASES.join(' ').split(' ');

  let includeLyric = Boolean(lyricLine);
  let topicCount = topicWords.length;

  while (topicCount > 0) {
    const parts = [quoteTerm(cleanTitle)];
    if (cleanArtist && !isGenericArtist(cleanArtist)) {
      parts.push(quoteTerm(cleanArtist));
    }
    if (includeLyric && lyricLine) {
      parts.push(quoteTerm(lyricLine));
    }
    parts.push(topicWords.slice(0, topicCount).join(' '));
    const query = assembleBackgroundSearchQuery(parts);
    if (fitsGoogleSearchUrl(query)) {
      return query;
    }
    if (includeLyric && lyricLine) {
      includeLyric = false;
      continue;
    }
    topicCount -= 2;
  }

  return quoteTerm(cleanTitle) + ' song history origin first recording performers';
}

export function buildTuneBackgroundSearchUrl(title, artist, lyrics) {
  const query = buildTuneBackgroundSearchQuery(title, artist, lyrics);
  if (!query) return GOOGLE_SEARCH_BASE;
  return GOOGLE_SEARCH_BASE + encodeURIComponent(query);
}

export function buildWikipediaSearchUrl(title, artist) {
  const query = encodeURIComponent((title || '') + ' ' + (artist || ''));
  return 'https://en.wikipedia.org/wiki/Special:Search?search=' + query;
}

export async function researchTuneBackground(options) {
  const {
    title,
    artist,
    lyrics,
    accessToken,
    signal,
    onProgress,
  } = options;

  if (!(title && String(title).trim())) {
    throw new Error('Song title is required');
  }

  const response = await fetchViaMediaProxy('/research-tune-background', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title || '',
      artist: artist || '',
      lyrics: typeof lyrics === 'string' ? lyrics : '',
    }),
    signal: signal,
    headers: {
      Accept: RESEARCH_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  });

  return parseResearchResponse(response, onProgress);
}
