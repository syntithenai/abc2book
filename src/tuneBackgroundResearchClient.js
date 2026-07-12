import { fetchViaMediaProxy } from './mediaProxyClient';
import { isGenericArtist } from './genericArtistUtils';

const RESEARCH_ACCEPT_HEADER = 'application/x-ndjson, application/json';
const GOOGLE_SEARCH_BASE = 'https://www.google.com/search?q=';
const GOOGLE_SEARCH_URL_MAX_LENGTH = 2048;
const RESEARCH_QUERY_TOPICS = [
  'song history origin',
  'alternative names aka',
  'first recorded written',
  'who popularized made famous',
  'notable recordings performers covers',
  'record label releases',
  'musical structure key tempo',
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

export function lyricsSearchPhrases(lyrics, maxPhrases) {
  const limit = typeof maxPhrases === 'number' ? maxPhrases : 3;
  const text = String(lyrics || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];

  const lines = [];
  const seen = new Set();
  text.split('\n').forEach(function(rawLine) {
    const line = normalizeSpace(rawLine);
    if (!isMeaningfulLyricLine(line)) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  });
  if (lines.length === 0) return [];

  const phrases = [lines[0]];
  lines.slice(1).sort(function(a, b) { return b.length - a.length; }).forEach(function(line) {
    if (phrases.length >= limit) return;
    if (phrases.some(function(phrase) { return phrase.toLowerCase() === line.toLowerCase(); })) {
      return;
    }
    phrases.push(line.length > 120 ? line.slice(0, 120) : line);
  });
  return phrases.slice(0, limit);
}

function quoteTerm(value) {
  const text = normalizeSpace(value);
  return text ? '"' + text + '"' : '';
}

function dedupeQueries(queries) {
  const seen = new Set();
  const ordered = [];
  queries.forEach(function(query) {
    const normalized = normalizeSpace(query).toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    ordered.push(normalizeSpace(query));
  });
  return ordered;
}

function fitsGoogleSearchUrl(query) {
  return (GOOGLE_SEARCH_BASE + encodeURIComponent(query)).length <= GOOGLE_SEARCH_URL_MAX_LENGTH;
}

function researchArtistParts(artist) {
  const cleanArtist = normalizeSpace(artist);
  if (!cleanArtist || isGenericArtist(cleanArtist)) {
    return { quotedArtist: '', artistPart: '' };
  }
  return {
    quotedArtist: ' ' + quoteTerm(cleanArtist),
    artistPart: ' ' + cleanArtist,
  };
}

export function buildTuneBackgroundResearchQueries(title, artist, lyrics) {
  const cleanTitle = normalizeSpace(title);
  if (!cleanTitle) return [];

  const artistParts = researchArtistParts(artist);
  const base = quoteTerm(cleanTitle) + artistParts.quotedArtist;
  const queries = [
    base + ' song history origin',
    base + ' alternative names aka',
    base + ' first recorded written',
    base + ' who popularized made famous',
    base + ' notable recordings performers covers',
    base + ' record label releases',
    base + ' musical structure key tempo',
    'site:youtube.com ' + quoteTerm(cleanTitle) + artistParts.artistPart,
    'site:thesession.org ' + quoteTerm(cleanTitle),
    'site:discogs.com ' + quoteTerm(cleanTitle) + artistParts.artistPart,
    (cleanTitle + artistParts.artistPart + ' wikipedia').trim(),
  ];

  lyricsSearchPhrases(lyrics).forEach(function(phrase) {
    queries.push(quoteTerm(phrase) + ' song lyrics');
    if (artistParts.quotedArtist) {
      queries.push(quoteTerm(phrase) + artistParts.quotedArtist);
    }
  });

  return dedupeQueries(queries);
}

function buildCondensedBackgroundSearchQuery(title, artist, lyrics) {
  const cleanTitle = normalizeSpace(title);
  if (!cleanTitle) return '';

  const artistParts = researchArtistParts(artist);
  const parts = [quoteTerm(cleanTitle)];
  if (artistParts.quotedArtist) {
    parts.push(artistParts.quotedArtist.trim());
  }

  const lyricPhrases = lyricsSearchPhrases(lyrics, 1);
  if (lyricPhrases.length > 0) {
    parts.push(quoteTerm(lyricPhrases[0]));
  }

  let topicCount = RESEARCH_QUERY_TOPICS.length;
  while (topicCount > 0) {
    const query = parts.concat(RESEARCH_QUERY_TOPICS.slice(0, topicCount)).join(' ');
    if (fitsGoogleSearchUrl(query)) {
      return query;
    }
    topicCount -= 1;
  }

  return parts.join(' ') + ' song history origin';
}

export function buildTuneBackgroundSearchQuery(title, artist, lyrics) {
  const queries = buildTuneBackgroundResearchQueries(title, artist, lyrics);
  if (queries.length === 0) return '';

  for (let count = queries.length; count > 0; count -= 1) {
    const query = queries.slice(0, count).join(' OR ');
    if (fitsGoogleSearchUrl(query)) {
      return query;
    }
  }

  return buildCondensedBackgroundSearchQuery(title, artist, lyrics);
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
    backgroundInfo,
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
      backgroundInfo: typeof backgroundInfo === 'string' ? backgroundInfo : '',
    }),
    signal: signal,
    headers: {
      Accept: RESEARCH_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  });

  return parseResearchResponse(response, onProgress);
}
