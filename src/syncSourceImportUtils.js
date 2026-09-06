import {
  buildGoogleDocUrl,
  registerSourceFromImport,
  sourceSyncKey,
} from './syncSourcesStore';
import { seedSourceSyncBaseline } from './sourceSyncBaseline';

export function buildFiltersFromImportScope(option) {
  const opts = option || {};
  const filters = {};
  if (opts.scope === 'tune' && opts.tuneId) {
    filters.limitToTuneId = opts.tuneId;
  } else if (opts.scope === 'book' && opts.bookName) {
    filters.limitToBookName = opts.bookName;
  } else if (opts.scope === 'tag' && opts.tagName) {
    filters.limitToTagName = opts.tagName;
  } else if ((opts.scope === 'set' || opts.scope === 'playlist') && Array.isArray(opts.limitToTuneIds) && opts.limitToTuneIds.length > 0) {
    filters.limitToTuneIds = opts.limitToTuneIds;
  }
  return filters;
}

export function collectTuneIdsFromImportResults(results) {
  const ids = [];
  const seen = {};
  function addId(id) {
    const key = String(id || '');
    if (!key || seen[key]) return;
    seen[key] = true;
    ids.push(key);
  }
  if (!results) return ids;
  const buckets = ['inserts', 'updates', 'duplicates', 'localUpdates'];
  buckets.forEach(function(name) {
    const bucket = results[name];
    if (!bucket) return;
    if (Array.isArray(bucket)) {
      bucket.forEach(function(tune) { addId(tune && tune.id); });
      return;
    }
    Object.values(bucket).forEach(function(tune) { addId(tune && tune.id); });
  });
  return ids;
}

export function seedSourceSyncBaselinesAfterImport(source, tunesById, results) {
  const sourceKey = sourceSyncKey(source);
  if (!sourceKey || !tunesById) return;
  collectTuneIdsFromImportResults(results).forEach(function(id) {
    const tune = tunesById[id];
    if (tune) seedSourceSyncBaseline(sourceKey, id, tune);
  });
}

export function stampSrcUrlOnImportResults(results, srcUrl) {
  const url = String(srcUrl || '').trim();
  if (!url || !results) return results;
  function stampTune(tune) {
    if (!tune || tune.srcUrl) return tune;
    return Object.assign({}, tune, { srcUrl: url });
  }
  function stampBucket(bucket) {
    if (!bucket) return bucket;
    if (Array.isArray(bucket)) {
      return bucket.map(stampTune);
    }
    const next = {};
    Object.keys(bucket).forEach(function(key) {
      next[key] = stampTune(bucket[key]);
    });
    return next;
  }
  return Object.assign({}, results, {
    inserts: stampBucket(results.inserts),
    updates: stampBucket(results.updates),
    duplicates: stampBucket(results.duplicates),
    localUpdates: stampBucket(results.localUpdates),
  });
}

export function registerSyncSourceAfterImport(options) {
  const opts = options || {};
  const googleDocumentId = opts.googleDocumentId ? String(opts.googleDocumentId).trim() : '';
  const url = String(opts.url || '').trim() || (googleDocumentId ? buildGoogleDocUrl(googleDocumentId) : '');
  if (!url && !googleDocumentId) return null;

  const scopeOption = Object.assign({}, opts.scopeOption || {}, {
    limitToTuneIds: opts.limitToTuneIds || (opts.scopeOption && opts.scopeOption.limitToTuneIds),
  });
  const filters = opts.filters || buildFiltersFromImportScope(scopeOption);
  const tuneIds = opts.tuneIds || collectTuneIdsFromImportResults(opts.results);

  const source = registerSourceFromImport({
    googleDocumentId: googleDocumentId || undefined,
    url: url,
    label: opts.label,
    filters: filters,
    tuneIds: tuneIds,
  });
  if (source && opts.tunes) {
    seedSourceSyncBaselinesAfterImport(source, opts.tunes, opts.results);
  }
  return source;
}
