import {
  applyTuneImportSelections,
  buildDefaultTuneImportSelections,
  buildTuneImportFieldRows,
  setAllTuneImportSelections,
  tunePairHasDifferingImportFields,
} from './tuneImportMergeUtils';
import { isIncomingTuneNewer } from './tuneBookSync';

export function sheetUpdateResultsNeedAttention(results) {
  if (!results) return false;
  if (results.deletes && Object.keys(results.deletes).length > 0) return true;
  if (results.updates && Object.keys(results.updates).length > 0) return true;
  if (results.inserts && Object.keys(results.inserts).length > 0) return true;
  return false;
}

export function summarizeSheetUpdateResults(results) {
  if (!results) return '';
  const parts = [];
  const insertCount = results.inserts ? Object.keys(results.inserts).length : 0;
  const updateCount = results.updates ? Object.keys(results.updates).length : 0;
  const deleteCount = results.deletes ? Object.keys(results.deletes).length : 0;
  if (insertCount) parts.push(insertCount + ' to add');
  if (updateCount) parts.push(updateCount + ' to update');
  if (deleteCount) parts.push(deleteCount + ' to remove');
  return parts.join(', ');
}

export function summarizeMergeRecords(records) {
  if (!records || !records.length) return '';
  const parts = [];
  let insertCount = 0;
  let updateCount = 0;
  let deleteCount = 0;
  records.forEach(function(record) {
    if (record.kind === 'insert') insertCount += 1;
    else if (record.kind === 'update') updateCount += 1;
    else if (record.kind === 'delete') deleteCount += 1;
  });
  if (insertCount) parts.push(insertCount + ' to add');
  if (updateCount) parts.push(updateCount + ' to update');
  if (deleteCount) parts.push(deleteCount + ' to remove');
  return parts.join(', ');
}

export function buildDriveMergeRecords(sheetUpdateResults) {
  const records = [];
  if (!sheetUpdateResults) return records;

  Object.values(sheetUpdateResults.inserts || {}).forEach(function(tune) {
    if (!tune || !tune.id) return;
    records.push({
      id: tune.id,
      kind: 'insert',
      label: tune.name || tune.id,
      localTune: null,
      incomingTune: tune,
    });
  });

  Object.keys(sheetUpdateResults.updates || {}).forEach(function(id) {
    const pair = sheetUpdateResults.updates[id];
    if (!pair || !pair[1]) return;
    if (!tunePairHasDifferingImportFields(pair[0], pair[1])) return;
    records.push({
      id: id,
      kind: 'update',
      label: pair[0] && pair[0].name ? pair[0].name : id,
      localTune: pair[0],
      incomingTune: pair[1],
    });
  });

  Object.values(sheetUpdateResults.deletes || {}).forEach(function(tune) {
    if (!tune || !tune.id) return;
    records.push({
      id: tune.id,
      kind: 'delete',
      label: tune.name || tune.id,
      localTune: tune,
      incomingTune: null,
    });
  });

  return records;
}

export function buildLocalImportHashIndex(localTunes, getTuneImportHash) {
  const index = {};
  if (!getTuneImportHash) return index;
  Object.values(localTunes || {}).forEach(function(tune) {
    if (!tune || !tune.id) return;
    const hash = getTuneImportHash(tune);
    if (hash && !index[hash]) index[hash] = tune;
  });
  return index;
}

export function resolveLocalTuneForIncoming(localTunes, incoming, getTuneImportHash) {
  if (!incoming) return null;
  if (incoming.id && localTunes && localTunes[incoming.id]) {
    return localTunes[incoming.id];
  }
  if (!getTuneImportHash) return null;
  const hash = getTuneImportHash(incoming);
  if (!hash) return null;
  const index = buildLocalImportHashIndex(localTunes, getTuneImportHash);
  return index[hash] || null;
}

export function buildSourceUrlMergeRecords(localTunes, incomingById, getTuneImportHash) {
  const hashIndex = buildLocalImportHashIndex(localTunes, getTuneImportHash);
  const records = [];
  Object.keys(incomingById || {}).forEach(function(incomingId) {
    const incoming = incomingById[incomingId];
    if (!incoming) return;
    let local = incoming.id && localTunes && localTunes[incoming.id]
      ? localTunes[incoming.id]
      : null;
    if (!local && getTuneImportHash) {
      const hash = getTuneImportHash(incoming);
      if (hash && hashIndex[hash]) local = hashIndex[hash];
    }
    if (local && !isIncomingTuneNewer(local, incoming)) return;
    if (local && !tunePairHasDifferingImportFields(local, incoming)) return;
    const rows = buildTuneImportFieldRows(local, incoming).filter(function(row) {
      return row.differs;
    });
    const recordId = local ? local.id : incomingId;
    records.push({
      id: recordId,
      kind: local ? 'update' : 'insert',
      label: (local && local.name) || incoming.name || recordId,
      localTune: local,
      incomingTune: incoming,
      differingRows: rows,
    });
  });
  return records;
}

export function buildFieldSelectionsForRecord(record, onlyDiffering) {
  const rows = buildTuneImportFieldRows(record.localTune, record.incomingTune);
  const filtered = onlyDiffering ? rows.filter(function(row) { return row.differs; }) : rows;
  return setAllTuneImportSelections(filtered, true);
}

export function buildDefaultFieldSelectionsForRecord(record, onlyDiffering) {
  const rows = buildTuneImportFieldRows(record.localTune, record.incomingTune);
  const filtered = onlyDiffering ? rows.filter(function(row) { return row.differs; }) : rows;
  return buildDefaultTuneImportSelections(filtered);
}

export function applyRecordFieldMerge(record, selections) {
  if (record.kind === 'insert') {
    return record.incomingTune;
  }
  if (record.kind === 'delete') {
    return null;
  }
  if (!record.localTune || !record.incomingTune) {
    return record.incomingTune || record.localTune;
  }
  const merged = applyTuneImportSelections(record.localTune, record.incomingTune, selections);
  merged.lastUpdated = Date.now();
  return merged;
}

export function applyDriveRecordStateToTunes(currentTunes, sheetUpdateResults, recordState) {
  const tunes = Object.assign({}, currentTunes || {});
  const deletesToApply = {};

  Object.values(sheetUpdateResults.inserts || {}).forEach(function(tune) {
    if (!tune || !tune.id) return;
    const state = recordState && recordState[tune.id];
    if (state && state.accept === false) return;
    tunes[tune.id] = tune;
  });

  Object.keys(sheetUpdateResults.updates || {}).forEach(function(id) {
    const pair = sheetUpdateResults.updates[id];
    if (!pair || !pair[1]) return;
    const state = recordState && recordState[id];
    if (state && state.accept === false) return;
    if (state && state.fieldSelections && pair[0]) {
      tunes[id] = applyRecordFieldMerge({
        kind: 'update',
        localTune: pair[0],
        incomingTune: pair[1],
      }, state.fieldSelections);
    } else {
      tunes[id] = pair[1];
    }
  });

  Object.keys(sheetUpdateResults.deletes || {}).forEach(function(id) {
    const state = recordState && recordState[id];
    if (state && state.accept === false) return;
    deletesToApply[id] = sheetUpdateResults.deletes[id];
    delete tunes[id];
  });

  return { tunes: tunes, deletes: deletesToApply };
}

export function applyDriveFieldMergeBatch(sheetUpdateResults, recordSelections) {
  const nextTunes = {};
  const deletes = {};

  Object.values(sheetUpdateResults.inserts || {}).forEach(function(tune) {
    if (!tune || !tune.id) return;
    const sel = recordSelections && recordSelections[tune.id];
    if (sel && sel.accept === false) return;
    nextTunes[tune.id] = tune;
  });

  Object.keys(sheetUpdateResults.updates || {}).forEach(function(id) {
    const pair = sheetUpdateResults.updates[id];
    if (!pair) return;
    const sel = recordSelections && recordSelections[id];
    if (sel && sel.accept === false) return;
    if (sel && sel.fieldSelections && pair[0]) {
      nextTunes[id] = applyRecordFieldMerge({
        kind: 'update',
        localTune: pair[0],
        incomingTune: pair[1],
      }, sel.fieldSelections);
    } else {
      nextTunes[id] = pair[1];
    }
  });

  Object.keys(sheetUpdateResults.deletes || {}).forEach(function(id) {
    const sel = recordSelections && recordSelections[id];
    if (sel && sel.accept === false) return;
    deletes[id] = sheetUpdateResults.deletes[id];
  });

  return { tunes: nextTunes, deletes: deletes };
}
