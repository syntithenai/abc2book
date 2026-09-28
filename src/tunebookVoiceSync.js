import { fetchViaMediaProxy, getSnapcastPlaybackProxyBase } from './mediaProxyClient';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';

// Pushes a compact copy of the tunebook (titles, books, tags, links) to the home resolver so
// local voice control can play a tag or book ("play the eurosession book").
const DEBOUNCE_MS = 5000;
const RETRY_MS = 60000;
const LINK_FIELDS = ['link', 'title', 'mediaKind', 'startAt', 'endAt'];

let timer = null;
let pendingTunes = null;
let lastSignature = '';

function hasNotes(tune) {
  const voices = tune && tune.voices ? Object.values(tune.voices) : [];
  return voices.some(function(v) { return v && Array.isArray(v.notes) && v.notes.length > 0; });
}

export function compactTuneForVoice(tune) {
  if (!tune || !tune.id || !tune.name) return null;
  const links = (Array.isArray(tune.links) ? tune.links : [])
    .filter(function(l) { return l && typeof l.link === 'string' && l.link && l.link.indexOf('data:') !== 0; })
    .map(function(l) {
      const out = {};
      LINK_FIELDS.forEach(function(k) {
        if (l[k] !== undefined && l[k] !== null && l[k] !== '') out[k] = l[k];
      });
      return out;
    });
  return {
    id: String(tune.id),
    name: String(tune.name),
    composer: tune.composer || '',
    books: Array.isArray(tune.books) ? tune.books : [],
    tags: Array.isArray(tune.tags) ? tune.tags : [],
    links: links,
    hasNotes: hasNotes(tune),
  };
}

function signatureOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return text.length + ':' + (hash >>> 0).toString(16);
}

function retryLater() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushTunebookVoiceSync, RETRY_MS);
}

export async function flushTunebookVoiceSync() {
  timer = null;
  const tunes = pendingTunes;
  if (!tunes) return;
  // Only the home resolver (the one that plays Snapcast) keeps the copy.
  if (!getSnapcastPlaybackProxyBase()) {
    retryLater();
    return;
  }
  const compact = Object.values(tunes).map(compactTuneForVoice).filter(Boolean);
  const body = JSON.stringify({ source: 'tunebook-spa', tunes: compact });
  const signature = signatureOf(body);
  if (signature === lastSignature) {
    pendingTunes = null;
    return;
  }
  try {
    const response = await fetchViaMediaProxy('/snapcast-playback/tunebook', getActiveResolverAccessToken(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    lastSignature = signature;
    if (pendingTunes === tunes) pendingTunes = null;
  } catch (err) {
    retryLater();
  }
}

export function scheduleTunebookVoiceSync(tunes) {
  if (!tunes) return;
  pendingTunes = tunes;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushTunebookVoiceSync, DEBOUNCE_MS);
}
