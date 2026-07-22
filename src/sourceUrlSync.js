import { buildSourceUrlMergeRecords, summarizeMergeRecords } from './incomingMergeUtils';
import { normalizeSourceUrlKey } from './incomingMergePrefs';
import { toTuneUpdatedMs } from './tuneBookSync';
import { applyTuneImportSelections, buildDefaultTuneImportSelections, buildTuneImportFieldRows } from './tuneImportMergeUtils';
import {
  listActiveSyncSources,
  sourceSyncKey,
  tuneMatchesSourceFilters,
  updateSyncSourceMeta,
} from './syncSourcesStore';

const POLL_MS = 10 * 60 * 1000;

export function groupTunesBySourceUrl(tunes) {
  const groups = {};
  Object.values(tunes || {}).forEach(function(tune) {
    if (!tune || !tune.srcUrl) return;
    const key = normalizeSourceUrlKey(tune.srcUrl);
    if (!key) return;
    if (!groups[key]) groups[key] = { sourceUrl: tune.srcUrl, tuneIds: [] };
    groups[key].tuneIds.push(tune.id);
  });
  return groups;
}

function filterIncomingTunes(incomingTunes, filters) {
  return (incomingTunes || []).filter(function(tune) {
    return tuneMatchesSourceFilters(tune, filters);
  });
}

function filterLocalTunesForSource(localTunes, source) {
  const allTunes = localTunes || {};
  const key = sourceSyncKey(source);
  const ids = {};
  Object.values(allTunes).forEach(function(tune) {
    if (!tune) return;
    const matchesUrl = tune.srcUrl && normalizeSourceUrlKey(tune.srcUrl) === normalizeSourceUrlKey(key);
    const matchesDoc = source.googleDocumentId && tune.srcUrl && tune.srcUrl.indexOf(source.googleDocumentId) !== -1;
    if (!matchesUrl && !matchesDoc) return;
    if (!tuneMatchesSourceFilters(tune, source.filters)) return;
    ids[tune.id] = tune;
  });
  if (Array.isArray(source.tuneIds) && source.tuneIds.length > 0) {
    source.tuneIds.forEach(function(id) {
      if (allTunes[id] && tuneMatchesSourceFilters(allTunes[id], source.filters)) {
        ids[id] = allTunes[id];
      }
    });
  }
  return ids;
}

export async function fetchSourceUrlAbc(sourceUrl, driveApi) {
  const url = String(sourceUrl || '').trim();
  if (!url) throw new Error('Missing source URL');

  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (docMatch && driveApi) {
    const doc = await new Promise(function(resolve, reject) {
      driveApi.getDocument(docMatch[1]).then(resolve).catch(reject);
    });
    return String(doc || '');
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not fetch source URL');
  return response.text();
}

export function buildSourceUrlMergeBatch(localTunes, sourceUrl, incomingTunes, options) {
  const opts = options || {};
  const getTuneImportHash = opts.getTuneImportHash;
  const filters = opts.filters;
  const deletedTunes = opts.deletedTunes;
  const scopedLocal = {};
  const incomingList = filterIncomingTunes(incomingTunes, filters);
  incomingList.forEach(function(tune) {
    if (tune && tune.id && localTunes[tune.id]) {
      scopedLocal[tune.id] = localTunes[tune.id];
    }
  });
  Object.keys(localTunes || {}).forEach(function(id) {
    const tune = localTunes[id];
    if (!tune || !tune.srcUrl) return;
    if (normalizeSourceUrlKey(tune.srcUrl) !== normalizeSourceUrlKey(sourceUrl)) return;
    if (!tuneMatchesSourceFilters(tune, filters)) return;
    scopedLocal[id] = tune;
  });

  const incomingById = {};
  incomingList.forEach(function(tune) {
    if (tune && tune.id) incomingById[tune.id] = tune;
  });
  const sourceKey = normalizeSourceUrlKey(sourceUrl);
  return {
    kind: 'sourceUrl',
    sourceKey: sourceKey,
    sourceLabel: 'Source: ' + sourceUrl,
    sourceUrl: sourceUrl,
    records: buildSourceUrlMergeRecords(scopedLocal, incomingById, getTuneImportHash, {
      deletedTunes: deletedTunes,
      sourceKey: sourceKey,
    }),
    incomingById: incomingById,
  };
}

export function finalizeSourceUrlMergeBatch(batch) {
  if (!batch) return batch;
  return Object.assign({}, batch, {
    summary: summarizeMergeRecords(batch.records),
  });
}

export async function pollRegisteredSourceUpdates(options) {
  const opts = options || {};
  const tunes = opts.tunes || {};
  const deletedTunes = opts.deletedTunes || {};
  const tunebook = opts.tunebook;
  const driveApi = opts.driveApi;
  const getTuneImportHash = tunebook && tunebook.abcTools && tunebook.abcTools.getTuneImportHash;
  const batches = [];
  if (!tunebook) return batches;

  const sources = opts.sources || listActiveSyncSources();
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    if (!source || source.kind === 'ownTunebook' || source.paused || source.removed) continue;
    const sourceUrl = String(source.url || '').trim();
    if (!sourceUrl) continue;
    try {
      const text = await fetchSourceUrlAbc(sourceUrl, driveApi);
      const incomingTunes = tunebook.abcTools.abc2Tunebook(text);
      const scopedLocal = filterLocalTunesForSource(tunes, source);
      const batch = finalizeSourceUrlMergeBatch(
        buildSourceUrlMergeBatch(
          scopedLocal,
          sourceUrl,
          incomingTunes,
          {
            getTuneImportHash: getTuneImportHash,
            filters: source.filters,
            deletedTunes: deletedTunes,
          }
        )
      );
      batch.abcText = text;
      batch.syncSourceId = source.id;
      if (typeof opts.onSourceUrlAbcFetched === 'function') {
        opts.onSourceUrlAbcFetched(text, sourceUrl);
      }
      updateSyncSourceMeta(source.id, {
        lastSyncAt: Date.now(),
        lastError: undefined,
      });
      if (batch.records && batch.records.length > 0) {
        batches.push(batch);
      }
    } catch (e) {
      updateSyncSourceMeta(source.id, {
        lastSyncAt: Date.now(),
        lastError: e && e.message ? e.message : 'Sync failed',
      });
      if (typeof opts.onError === 'function') opts.onError(e, source);
    }
  }
  return batches;
}

export async function pollSourceUrlUpdates(options) {
  const opts = options || {};
  if (opts.useRegistry !== false) {
    return pollRegisteredSourceUpdates(opts);
  }
  const tunes = opts.tunes || {};
  const deletedTunes = opts.deletedTunes || {};
  const tunebook = opts.tunebook;
  const driveApi = opts.driveApi;
  const getTuneImportHash = tunebook && tunebook.abcTools && tunebook.abcTools.getTuneImportHash;
  const batches = [];
  if (!tunebook) return batches;

  const groups = groupTunesBySourceUrl(tunes);
  const keys = Object.keys(groups);
  for (let i = 0; i < keys.length; i += 1) {
    const group = groups[keys[i]];
    try {
      const text = await fetchSourceUrlAbc(group.sourceUrl, driveApi);
      const incomingTunes = tunebook.abcTools.abc2Tunebook(text);
      const batch = finalizeSourceUrlMergeBatch(
        buildSourceUrlMergeBatch(
          tunes,
          group.sourceUrl,
          incomingTunes,
          {
            getTuneImportHash: getTuneImportHash,
            deletedTunes: deletedTunes,
          }
        )
      );
      batch.abcText = text;
      if (typeof opts.onSourceUrlAbcFetched === 'function') {
        opts.onSourceUrlAbcFetched(text, group.sourceUrl);
      }
      if (batch.records && batch.records.length > 0) {
        batches.push(batch);
      }
    } catch (e) {
      if (typeof opts.onError === 'function') opts.onError(e, group);
    }
  }
  return batches;
}

export function applySourceUrlMergeBatch(localTunes, batch, recordState) {
  const next = Object.assign({}, localTunes || {});
  (batch.records || []).forEach(function(record) {
    const state = recordState && recordState[record.id];
    if (state && state.accept === false) return;
    if (record.kind === 'delete') {
      delete next[record.id];
      return;
    }
    if (record.kind === 'insert') {
      next[record.id] = record.incomingTune;
      return;
    }
    const selections = state && state.fieldSelections
      ? state.fieldSelections
      : buildDefaultTuneImportSelections(buildTuneImportFieldRows(record.localTune, record.incomingTune).filter(function(r) { return r.differs; }));
    next[record.id] = applyTuneImportSelections(record.localTune, record.incomingTune, selections);
    next[record.id].lastUpdated = Math.max(Date.now(), toTuneUpdatedMs(record.incomingTune.lastUpdated) + 1);
  });
  return next;
}

export function startSourceUrlPolling(options) {
  const opts = options || {};
  let timer = null;

  async function tick() {
    if (typeof opts.onPoll !== 'function') return;
    try {
      await opts.onPoll();
    } catch (e) {
      if (typeof opts.onError === 'function') opts.onError(e);
    }
  }

  timer = setInterval(tick, POLL_MS);
  tick();

  return function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

export { getSourceMergePref, setSourceMergePref, normalizeSourceUrlKey } from './incomingMergePrefs';
