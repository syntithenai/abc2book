import { buildSourceUrlMergeRecords, summarizeMergeRecords } from './incomingMergeUtils';
import { getSourceMergePref, normalizeSourceUrlKey, setSourceMergePref } from './incomingMergePrefs';
import { applyTuneImportSelections, buildDefaultTuneImportSelections, buildTuneImportFieldRows } from './tuneImportMergeUtils';

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

export function buildSourceUrlMergeBatch(localTunes, sourceUrl, incomingTunes, getTuneImportHash) {
  const incomingById = {};
  (incomingTunes || []).forEach(function(tune) {
    if (tune && tune.id) incomingById[tune.id] = tune;
  });
  return {
    kind: 'sourceUrl',
    sourceKey: normalizeSourceUrlKey(sourceUrl),
    sourceLabel: 'Source: ' + sourceUrl,
    sourceUrl: sourceUrl,
    records: buildSourceUrlMergeRecords(localTunes, incomingById, getTuneImportHash),
    incomingById: incomingById,
  };
}

export function finalizeSourceUrlMergeBatch(batch) {
  if (!batch) return batch;
  return Object.assign({}, batch, {
    summary: summarizeMergeRecords(batch.records),
  });
}

export async function pollSourceUrlUpdates(options) {
  const opts = options || {};
  const tunes = opts.tunes || {};
  const tunebook = opts.tunebook;
  const driveApi = opts.driveApi;
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
          tunebook.abcTools && tunebook.abcTools.getTuneImportHash
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
    next[record.id].lastUpdated = Date.now();
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

export { getSourceMergePref, setSourceMergePref, normalizeSourceUrlKey };
