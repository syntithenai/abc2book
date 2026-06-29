import localforage from 'localforage';

const CACHE_PREFIX = 'bookstorage_timed_media_';

const storage = localforage.createInstance({
  name: 'abc2book',
  storeName: 'timed_media_cache',
});

export function timedMediaCacheKey(tuneId) {
  return CACHE_PREFIX + String(tuneId || '');
}

function normalizeDraft(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    chordGridText: typeof value.chordGridText === 'string' ? value.chordGridText : '',
    melodyAbcText: typeof value.melodyAbcText === 'string' ? value.melodyAbcText : '',
    transcriptionText: typeof value.transcriptionText === 'string' ? value.transcriptionText : '',
    barsPerLine: parseInt(value.barsPerLine, 10) || 5,
    updatedAt: value.updatedAt || null,
  };
}

export async function loadTimedMediaDraft(tuneId) {
  if (!tuneId) return null;
  const value = await storage.getItem(timedMediaCacheKey(tuneId));
  return normalizeDraft(value);
}

export async function saveTimedMediaDraft(tuneId, draft) {
  if (!tuneId) return;
  const existing = await loadTimedMediaDraft(tuneId);
  const next = Object.assign({}, existing || {}, draft || {}, {
    updatedAt: Date.now(),
  });
  await storage.setItem(timedMediaCacheKey(tuneId), next);
}

export async function clearTimedMediaDraft(tuneId) {
  if (!tuneId) return;
  await storage.removeItem(timedMediaCacheKey(tuneId));
}
