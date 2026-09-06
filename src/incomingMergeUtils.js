import {
  applyTuneImportSelections,
  buildDefaultTuneImportSelections,
  buildTuneImportFieldRows,
  setAllTuneImportSelections,
  tunePairHasDifferingImportFields,
} from './tuneImportMergeUtils';
import { mergeTuneCollectionExtras } from './tuneMergeExtras';
import { isLocallyDeletedTune, isIncomingTuneNewer, toTuneUpdatedMs } from './tuneBookSync';
import { isSourceMergeDismissed } from './sourceMergeDismissals';
import {
  getSourceSyncBaseline,
  hasLocalEditSinceSourceApply,
  seedSourceSyncBaseline,
} from './sourceSyncBaseline';

/** Absolute count of deletes that counts as a dangerous mass wipe. */
export const MASS_DELETE_ABSOLUTE_THRESHOLD = 50
/** Fraction of the local library that counts as a dangerous mass wipe. */
export const MASS_DELETE_FRACTION_THRESHOLD = 0.25

export function isMassDeleteBatch(deleteCount, localTuneCount) {
  const deletes = deleteCount > 0 ? deleteCount : 0
  const local = localTuneCount > 0 ? localTuneCount : 0
  if (deletes <= 0) return false
  if (deletes >= MASS_DELETE_ABSOLUTE_THRESHOLD) return true
  if (local > 0 && (deletes / local) >= MASS_DELETE_FRACTION_THRESHOLD) return true
  return false
}

/**
 * Toast "Accept" must not apply a wiped Drive head's delete list.
 * Returns sheet results with deletes cleared when the batch is mass-delete sized.
 */
export function stripMassDeletesFromSheetResults(sheetResults, localTuneCount) {
  if (!sheetResults) return sheetResults
  const deleteCount = sheetResults.deletes ? Object.keys(sheetResults.deletes).length : 0
  if (!isMassDeleteBatch(deleteCount, localTuneCount)) return sheetResults
  return Object.assign({}, sheetResults, { deletes: {} })
}

/**
 * After a local restore, remote wipe tombstones must not be re-imported for
 * tunes that still exist locally — otherwise the next sync deletes them again.
 */
export function sanitizeRemoteDeletedAgainstLocalTunes(remoteDeleted, localTunes) {
  const remote = remoteDeleted || {}
  const local = localTunes || {}
  const localCount = Object.keys(local).length
  const remoteCount = Object.keys(remote).length
  if (!isMassDeleteBatch(remoteCount, localCount)) return remote
  const cleaned = {}
  Object.keys(remote).forEach(function(id) {
    if (local[id]) return
    cleaned[id] = remote[id]
  })
  return cleaned
}

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

export function buildDriveMergeRecords(sheetUpdateResults, options) {
  const opts = options || {};
  const sourceKey = opts.sourceKey || '';
  const getTuneImportHash = opts.getTuneImportHash;
  const skipDismissals = !!opts.skipDismissals;
  const records = [];
  if (!sheetUpdateResults) return records;

  Object.values(sheetUpdateResults.inserts || {}).forEach(function(tune) {
    if (!tune || !tune.id) return;
    if (!skipDismissals && sourceKey && isSourceMergeDismissed(sourceKey, tune.id, tune, getTuneImportHash)) return;
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
    if (!skipDismissals && sourceKey && isSourceMergeDismissed(sourceKey, id, pair[1], getTuneImportHash)) return;
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
    if (!skipDismissals && sourceKey && isSourceMergeDismissed(sourceKey, tune.id, tune, getTuneImportHash)) return;
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

export function buildSourceUrlMergeRecords(localTunes, incomingById, getTuneImportHash, options) {
  const opts = options || {};
  const deletedTunes = opts.deletedTunes || {};
  const sourceKey = opts.sourceKey || '';
  const hashIndex = buildLocalImportHashIndex(localTunes, getTuneImportHash);
  const records = [];
  Object.keys(incomingById || {}).forEach(function(incomingId) {
    const incoming = incomingById[incomingId];
    if (!incoming) return;
    if (isLocallyDeletedTune(deletedTunes, incoming.id || incomingId, incoming.lastUpdated)) return;
    let local = incoming.id && localTunes && localTunes[incoming.id]
      ? localTunes[incoming.id]
      : null;
    if (!local && getTuneImportHash) {
      const hash = getTuneImportHash(incoming);
      if (hash && hashIndex[hash]) local = hashIndex[hash];
    }
    if (local && isLocallyDeletedTune(deletedTunes, local.id, incoming.lastUpdated)) return;
    const recordId = local ? local.id : incomingId;
    if (sourceKey && isSourceMergeDismissed(sourceKey, recordId, incoming, getTuneImportHash)) return;
    if (local && !isIncomingTuneNewer(local, incoming)) return;
    if (local && !tunePairHasDifferingImportFields(local, incoming)) return;
    const rows = buildTuneImportFieldRows(local, incoming).filter(function(row) {
      return row.differs;
    });
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

export function isSourceUrlTuneClash(record, sourceKey) {
  if (!record || !sourceKey) return false;
  if (record.kind === 'insert') return false;
  if (!record.localTune || !record.incomingTune) return false;
  const baseline = getSourceSyncBaseline(sourceKey, record.id);
  if (!baseline) return false;
  return hasLocalEditSinceSourceApply(record.localTune, baseline);
}

/**
 * Split source URL merge records into silent auto-apply, clash (needs merge UI),
 * and legacy tunes that need baseline seeding on first poll.
 */
export function splitSourceUrlMergeRecords(records, sourceKey) {
  const silentRecords = [];
  const clashRecords = [];
  const seededIds = [];
  (records || []).forEach(function(record) {
    if (!record) return;
    if (record.kind === 'insert') {
      silentRecords.push(record);
      return;
    }
    if (!record.localTune) {
      silentRecords.push(record);
      return;
    }
    const baseline = getSourceSyncBaseline(sourceKey, record.id);
    if (!baseline) {
      seedSourceSyncBaseline(sourceKey, record.id, record.localTune);
      seededIds.push(record.id);
      return;
    }
    if (isSourceUrlTuneClash(record, sourceKey)) {
      clashRecords.push(record);
    } else {
      silentRecords.push(record);
    }
  });
  return { silentRecords: silentRecords, clashRecords: clashRecords, seededIds: seededIds };
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
  mergeTuneCollectionExtras(merged, record.localTune, record.incomingTune);
  // The merge decision must supersede the incoming copy even when the remote
  // device's clock is ahead of ours; otherwise the next sync classifies the
  // remote tune as newer again and re-prompts with the same items.
  merged.lastUpdated = Math.max(Date.now(), toTuneUpdatedMs(record.incomingTune.lastUpdated) + 1);
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
      // Stamp newer than incoming so a follow-up sync cannot re-offer this update.
      const accepted = Object.assign({}, pair[1]);
      accepted.lastUpdated = Math.max(
        Date.now(),
        toTuneUpdatedMs(pair[1] && pair[1].lastUpdated) + 1
      );
      tunes[id] = accepted;
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
      const accepted = Object.assign({}, pair[1]);
      accepted.lastUpdated = Math.max(
        Date.now(),
        toTuneUpdatedMs(pair[1] && pair[1].lastUpdated) + 1
      );
      nextTunes[id] = accepted;
    }
  });

  Object.keys(sheetUpdateResults.deletes || {}).forEach(function(id) {
    const sel = recordSelections && recordSelections[id];
    if (sel && sel.accept === false) return;
    deletes[id] = sheetUpdateResults.deletes[id];
  });

  return { tunes: nextTunes, deletes: deletes };
}
