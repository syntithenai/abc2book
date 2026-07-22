import { normalizeSourceUrlKey, setSourceMergePref } from './incomingMergePrefs';
import { groupTunesBySourceUrl } from './sourceUrlSync';
import { matchesShareImportScope } from './shareTunebookUtils';

const STORAGE_KEY = 'bookstorage_sync_sources';
const CHANGE_EVENT = 'syncSourcesChanged';

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'src-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

export function buildGoogleDocUrl(googleDocumentId) {
  const id = String(googleDocumentId || '').trim();
  if (!id) return '';
  return 'https://docs.google.com/document/d/' + id + '/edit';
}

function parseSourceUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw);
    } catch (e) {
      return null;
    }
  }
  if (raw.startsWith('/')) {
    try {
      return new URL(raw, 'https://tunebook.net');
    } catch (e) {
      return null;
    }
  }
  try {
    return new URL(raw, 'https://tunebook.net');
  } catch (e) {
    return null;
  }
}

/** Curated static ABC collections served from tunebook.net /scrape (or same-origin in dev). */
export function isStaticTunebookNetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (raw.startsWith('/scrape/') || raw.startsWith('scrape/')) return true;
  const parsed = parseSourceUrl(raw);
  if (!parsed) return false;
  return parsed.pathname.indexOf('/scrape/') !== -1;
}

export function isManagedSyncSource(source) {
  if (!source || typeof source !== 'object') return false;
  if (source.kind === 'ownTunebook') return true;
  if (source.kind === 'googleDoc' || source.googleDocumentId) return true;
  if (isStaticTunebookNetUrl(source.url)) return true;
  return false;
}

export function normalizeSyncSourceFilters(filters) {
  const raw = filters && typeof filters === 'object' ? filters : {};
  const next = {};
  if (raw.limitToTuneId) next.limitToTuneId = String(raw.limitToTuneId);
  if (Array.isArray(raw.limitToTuneIds) && raw.limitToTuneIds.length > 0) {
    next.limitToTuneIds = raw.limitToTuneIds.map(function(id) { return String(id); });
  }
  if (raw.limitToBookName) next.limitToBookName = String(raw.limitToBookName);
  if (raw.limitToTagName) next.limitToTagName = String(raw.limitToTagName);
  if (Array.isArray(raw.limitToTagNames) && raw.limitToTagNames.length > 0) {
    next.limitToTagNames = raw.limitToTagNames.map(function(name) { return String(name); });
  }
  return next;
}

export function sourceFiltersActive(filters) {
  const f = normalizeSyncSourceFilters(filters);
  return !!(
    f.limitToTuneId
    || (Array.isArray(f.limitToTuneIds) && f.limitToTuneIds.length > 0)
    || f.limitToBookName
    || f.limitToTagName
    || (Array.isArray(f.limitToTagNames) && f.limitToTagNames.length > 0)
  );
}

export function tuneMatchesSourceFilters(tune, filters) {
  if (!tune) return false;
  const f = normalizeSyncSourceFilters(filters);
  if (!sourceFiltersActive(f)) return true;
  return matchesShareImportScope(tune, f);
}

function normalizeSourceRecord(source) {
  if (!source || typeof source !== 'object') return null;
  const kind = source.kind === 'googleDoc' || source.kind === 'url' || source.kind === 'ownTunebook'
    ? source.kind
    : (source.googleDocumentId ? 'googleDoc' : 'url');
  const url = String(source.url || '').trim();
  const googleDocumentId = String(source.googleDocumentId || '').trim();
  const record = {
    id: String(source.id || newId()),
    kind: kind,
    label: String(source.label || '').trim() || defaultSourceLabel({ kind, url, googleDocumentId }),
    url: url || (googleDocumentId ? buildGoogleDocUrl(googleDocumentId) : ''),
    googleDocumentId: googleDocumentId || undefined,
    filters: normalizeSyncSourceFilters(source.filters),
    paused: !!source.paused,
    removed: !!source.removed,
    createdAt: Number(source.createdAt) || Date.now(),
    lastSyncAt: source.lastSyncAt ? Number(source.lastSyncAt) : undefined,
    lastError: source.lastError ? String(source.lastError) : undefined,
    tuneIds: Array.isArray(source.tuneIds) ? source.tuneIds.map(String) : undefined,
  };
  return record;
}

export function defaultSourceLabel(source) {
  const s = source || {};
  if (s.kind === 'ownTunebook') return 'My tunebook';
  if (s.googleDocumentId) return 'Shared tunebook';
  if (s.url) {
    try {
      const parsed = new URL(s.url);
      return parsed.hostname + parsed.pathname;
    } catch (e) {
      return s.url;
    }
  }
  return 'Source';
}

export function readSyncSources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSourceRecord).filter(Boolean);
  } catch (e) {
    return [];
  }
}

export function writeSyncSources(sources) {
  const list = Array.isArray(sources) ? sources.map(normalizeSourceRecord).filter(Boolean) : [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
  return list;
}

export function listSyncSources(options) {
  const opts = options || {};
  const includeRemoved = !!opts.includeRemoved;
  const includePaused = opts.includePaused !== false;
  const managedOnly = !!opts.managedOnly;
  return readSyncSources().filter(function(source) {
    if (!includeRemoved && source.removed) return false;
    if (!includePaused && source.paused) return false;
    if (managedOnly && !isManagedSyncSource(source)) return false;
    return true;
  });
}

export function listActiveSyncSources() {
  return listSyncSources({ includeRemoved: false, includePaused: false, managedOnly: true });
}

export function getSyncSource(id) {
  if (!id) return null;
  return readSyncSources().find(function(source) { return source.id === id; }) || null;
}

export function findSyncSourceByKey(sourceKey) {
  const key = String(sourceKey || '').trim().toLowerCase();
  if (!key) return null;
  return readSyncSources().find(function(source) {
    if (source.removed) return false;
    if (source.googleDocumentId && source.googleDocumentId.toLowerCase() === key) return true;
    if (source.url && normalizeSourceUrlKey(source.url) === key) return true;
    return false;
  }) || null;
}

export function upsertSyncSource(source) {
  const next = normalizeSourceRecord(source);
  if (!next) return null;
  const list = readSyncSources();
  const idx = list.findIndex(function(item) { return item.id === next.id; });
  if (idx === -1) {
    list.push(next);
  } else {
    list[idx] = Object.assign({}, list[idx], next, { id: list[idx].id });
  }
  writeSyncSources(list);
  return getSyncSource(next.id);
}

export function setSourcePaused(id, paused) {
  const source = getSyncSource(id);
  if (!source || source.kind === 'ownTunebook') return null;
  return upsertSyncSource(Object.assign({}, source, { paused: !!paused }));
}

export function removeSyncSource(id) {
  const source = getSyncSource(id);
  if (!source || source.kind === 'ownTunebook') return null;
  const key = sourceSyncKey(source);
  if (key) setSourceMergePref(key, null);
  return upsertSyncSource(Object.assign({}, source, { removed: true, paused: true }));
}

export function updateSyncSourceFilters(id, filters) {
  const source = getSyncSource(id);
  if (!source || source.kind === 'ownTunebook') return null;
  return upsertSyncSource(Object.assign({}, source, { filters: normalizeSyncSourceFilters(filters) }));
}

export function updateSyncSourceMeta(id, patch) {
  const source = getSyncSource(id);
  if (!source) return null;
  const next = Object.assign({}, source, patch || {});
  if (patch && patch.filters) next.filters = normalizeSyncSourceFilters(patch.filters);
  return upsertSyncSource(next);
}

export function sourceSyncKey(source) {
  if (!source) return '';
  if (source.googleDocumentId) return source.googleDocumentId;
  if (source.url) return normalizeSourceUrlKey(source.url);
  return source.id || '';
}

export function buildOwnTunebookSource(googleDocumentId) {
  const id = String(googleDocumentId || '').trim();
  if (!id) return null;
  return {
    id: 'own-tunebook',
    kind: 'ownTunebook',
    label: 'My tunebook',
    googleDocumentId: id,
    url: buildGoogleDocUrl(id),
    filters: {},
    paused: false,
    removed: false,
    createdAt: 0,
  };
}

export function registerSourceFromImport(options) {
  const opts = options || {};
  const googleDocumentId = String(opts.googleDocumentId || '').trim();
  const url = String(opts.url || '').trim() || (googleDocumentId ? buildGoogleDocUrl(googleDocumentId) : '');
  if (!url && !googleDocumentId) return null;
  const kind = googleDocumentId ? 'googleDoc' : 'url';
  if (!isManagedSyncSource({ kind: kind, url: url, googleDocumentId: googleDocumentId || undefined })) {
    return null;
  }

  const key = googleDocumentId || normalizeSourceUrlKey(url);
  const existing = findSyncSourceByKey(key);
  const filters = normalizeSyncSourceFilters(opts.filters);
  const tuneIds = Array.isArray(opts.tuneIds) ? opts.tuneIds.map(String) : undefined;

  if (existing && !existing.removed) {
    const mergedTuneIds = Array.from(new Set([].concat(existing.tuneIds || [], tuneIds || [])));
    return upsertSyncSource(Object.assign({}, existing, {
      label: opts.label || existing.label,
      url: url || existing.url,
      googleDocumentId: googleDocumentId || existing.googleDocumentId,
      filters: Object.keys(filters).length > 0 ? filters : existing.filters,
      tuneIds: mergedTuneIds.length > 0 ? mergedTuneIds : existing.tuneIds,
      paused: false,
      removed: false,
      lastError: undefined,
    }));
  }

  return upsertSyncSource({
    id: existing ? existing.id : newId(),
    kind: kind,
    label: opts.label || defaultSourceLabel({ kind, url, googleDocumentId }),
    url: url,
    googleDocumentId: googleDocumentId || undefined,
    filters: filters,
    tuneIds: tuneIds,
    paused: false,
    removed: false,
    createdAt: Date.now(),
  });
}

export function backfillSourcesFromTunes(tunes) {
  const groups = groupTunesBySourceUrl(tunes || {});
  const keys = Object.keys(groups);
  let created = 0;
  keys.forEach(function(key) {
    const group = groups[key];
    if (!group || !group.sourceUrl) return;
    if (!isStaticTunebookNetUrl(group.sourceUrl)) return;
    const existing = findSyncSourceByKey(key);
    if (existing) return;
    registerSourceFromImport({
      url: group.sourceUrl,
      tuneIds: group.tuneIds,
      label: defaultSourceLabel({ kind: 'url', url: group.sourceUrl }),
    });
    created += 1;
  });
  return created;
}

export function countTunesForSource(source, tunes) {
  if (!source) return 0;
  const allTunes = tunes || {};
  if (Array.isArray(source.tuneIds) && source.tuneIds.length > 0) {
    return source.tuneIds.filter(function(id) {
      const tune = allTunes[id];
      return tune && tuneMatchesSourceFilters(tune, source.filters);
    }).length;
  }
  const key = sourceSyncKey(source);
  let count = 0;
  Object.values(allTunes).forEach(function(tune) {
    if (!tune) return;
    const matchesUrl = tune.srcUrl && normalizeSourceUrlKey(tune.srcUrl) === normalizeSourceUrlKey(key);
    const matchesId = source.googleDocumentId && tune.srcUrl && tune.srcUrl.indexOf(source.googleDocumentId) !== -1;
    if (!matchesUrl && !matchesId) return;
    if (!tuneMatchesSourceFilters(tune, source.filters)) return;
    count += 1;
  });
  return count;
}

export function formatSourceFilters(filters) {
  const f = normalizeSyncSourceFilters(filters);
  const parts = [];
  if (f.limitToTuneId) parts.push('tune: ' + f.limitToTuneId);
  if (Array.isArray(f.limitToTuneIds) && f.limitToTuneIds.length > 0) {
    parts.push('set/playlist: ' + f.limitToTuneIds.length + ' tunes');
  }
  if (f.limitToBookName) parts.push('book: ' + f.limitToBookName);
  if (f.limitToTagName) parts.push('tag: ' + f.limitToTagName);
  if (Array.isArray(f.limitToTagNames) && f.limitToTagNames.length > 0) {
    f.limitToTagNames.forEach(function(tag) { parts.push('tag: ' + tag); });
  }
  return parts;
}

export function subscribeSyncSources(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return function() {};
  }
  const handler = function() { callback(readSyncSources()); };
  window.addEventListener(CHANGE_EVENT, handler);
  return function() {
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}
