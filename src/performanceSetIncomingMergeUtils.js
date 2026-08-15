import {
  applyPerformanceSetSelections,
  buildDefaultPerformanceSetSelections,
  buildPerformanceSetFieldRows,
  performanceSetPairHasDifferingFields,
  setAllPerformanceSetSelections,
} from './performanceSetMergeUtils';
import {
  buildMergedPerformanceSets,
  comparePerformanceSets,
  createSetTombstone,
  mergeDeletedSetMaps,
  parsePerformanceSetsFromAbc,
} from './performanceSetSync';
import {
  readDeletedPerformanceSets,
  readPerformanceSetsMap,
  writeDeletedPerformanceSets,
  writePerformanceSetsMap,
  notifyPerformanceSetsChanged,
} from './performanceSetStore';
import { readLastDriveUploadSnapshot } from './driveUploadShrinkGuard';

function setsMapWithIds(storageMap) {
  const withIds = {};
  Object.keys(storageMap || {}).forEach(function(id) {
    withIds[id] = Object.assign({ id: id }, storageMap[id]);
  });
  return withIds;
}

function setRecordToStorage(setRecord) {
  const next = Object.assign({}, setRecord);
  delete next.id;
  return next;
}

function setDisplayName(setRecord) {
  if (!setRecord) return 'Set';
  return setRecord.name || 'Set';
}

export function summarizePerformanceSetMergeRecords(records) {
  if (!records || !records.length) return '';
  let insertCount = 0;
  let updateCount = 0;
  let deleteCount = 0;
  records.forEach(function(record) {
    if (record.kind === 'insert') insertCount += 1;
    else if (record.kind === 'update') updateCount += 1;
    else if (record.kind === 'delete') deleteCount += 1;
  });
  const parts = [];
  if (insertCount) parts.push(insertCount + ' to add');
  if (updateCount) parts.push(updateCount + ' to update');
  if (deleteCount) parts.push(deleteCount + ' to remove');
  return parts.join(', ');
}

export function buildPerformanceSetMergeRecords(compared) {
  const records = [];
  if (!compared) return records;

  Object.values(compared.inserts || {}).forEach(function(setRecord) {
    if (!setRecord || !setRecord.id) return;
    records.push({
      id: setRecord.id,
      kind: 'insert',
      label: setDisplayName(setRecord),
      localSet: null,
      incomingSet: setRecord,
    });
  });

  Object.keys(compared.updates || {}).forEach(function(id) {
    const pair = compared.updates[id];
    if (!pair || !pair[1]) return;
    if (!performanceSetPairHasDifferingFields(pair[0], pair[1])) return;
    records.push({
      id: id,
      kind: 'update',
      label: setDisplayName(pair[0]) || setDisplayName(pair[1]) || id,
      localSet: pair[0],
      incomingSet: pair[1],
    });
  });

  Object.keys(compared.deletes || {}).forEach(function(id) {
    const localSet = compared.deletes[id];
    records.push({
      id: id,
      kind: 'delete',
      label: setDisplayName(localSet) || id,
      localSet: localSet,
      incomingSet: null,
    });
  });

  return records;
}

export function buildDefaultFieldSelectionsForSetRecord(record, onlyDiffering, tunesById) {
  const rows = buildPerformanceSetFieldRows(record.localSet, record.incomingSet, tunesById);
  const filtered = onlyDiffering ? rows.filter(function(row) { return row.differs; }) : rows;
  return buildDefaultPerformanceSetSelections(filtered);
}

export function buildFieldSelectionsForSetRecord(record, onlyDiffering, tunesById) {
  const rows = buildPerformanceSetFieldRows(record.localSet, record.incomingSet, tunesById);
  const filtered = onlyDiffering ? rows.filter(function(row) { return row.differs; }) : rows;
  return setAllPerformanceSetSelections(filtered, true);
}

export function preparePerformanceSetMergeFromAbc(abcText, tunesById) {
  const remote = parsePerformanceSetsFromAbc(abcText || '');
  const localStorageSets = readPerformanceSetsMap();
  const localDeleted = readDeletedPerformanceSets();
  const localSets = setsMapWithIds(localStorageSets);
  const lastUpload = readLastDriveUploadSnapshot() || {};
  const compared = comparePerformanceSets({
    localSets: localSets,
    localDeleted: localDeleted,
    remoteSets: remote.sets,
    remoteDeleted: remote.deleted,
    lastUpdatedById: lastUpload.setUpdatedAtById,
    lastDeletedAtById: lastUpload.setDeletedAtById,
  });
  const records = buildPerformanceSetMergeRecords(compared);
  const hasIncoming = records.length > 0;
  const hasLocalOnly = Object.keys(compared.localUpdates || {}).length > 0
    || Object.keys(compared.localInserts || {}).length > 0;

  return {
    abcText: abcText || '',
    compared: compared,
    remote: remote,
    localSets: localSets,
    localDeleted: localDeleted,
    records: records,
    summary: summarizePerformanceSetMergeRecords(records),
    hasIncoming: hasIncoming,
    hasLocalOnly: hasLocalOnly,
    tunesById: tunesById || {},
  };
}

function writeStorageFromSetsMap(setsMap, deletedMap) {
  const storageSets = {};
  Object.keys(setsMap || {}).forEach(function(id) {
    storageSets[id] = setRecordToStorage(Object.assign({ id: id }, setsMap[id]));
  });
  writePerformanceSetsMap(storageSets);
  writeDeletedPerformanceSets(deletedMap || {});
  notifyPerformanceSetsChanged();
}

export function applyPerformanceSetMergeAcceptAll(prepared) {
  if (!prepared) return { changed: false };

  const mergeResult = buildMergedPerformanceSets({
    localSets: prepared.localSets,
    localDeleted: prepared.localDeleted,
    remoteSets: prepared.remote.sets,
    remoteDeleted: prepared.remote.deleted,
  });

  if (!mergeResult.changed) {
    return { changed: false, needsUpload: false };
  }

  writePerformanceSetsMap(mergeResult.storageSets);
  writeDeletedPerformanceSets(mergeResult.mergedDeleted);
  notifyPerformanceSetsChanged();
  return {
    changed: true,
    needsUpload: mergeResult.needsUpload,
  };
}

export function applyPerformanceSetMergeWithSelections(prepared, recordState) {
  if (!prepared) return { changed: false };

  if (!recordState) {
    return applyPerformanceSetMergeAcceptAll(prepared);
  }

  const setsMap = Object.assign({}, prepared.localSets || {});
  let deletedMap = Object.assign({}, prepared.localDeleted || {});

  (prepared.records || []).forEach(function(record) {
    const state = recordState[record.id] || {};
    if (state.accept === false) return;

    if (record.kind === 'delete') {
      delete setsMap[record.id];
      if (!deletedMap[record.id]) {
        deletedMap[record.id] = createSetTombstone(
          record.id,
          setDisplayName(record.localSet),
          Date.now()
        );
      }
      return;
    }

    if (record.kind === 'insert') {
      setsMap[record.id] = Object.assign({}, record.incomingSet);
      delete deletedMap[record.id];
      return;
    }

    const selections = state.fieldSelections
      || buildDefaultFieldSelectionsForSetRecord(record, true, prepared.tunesById);
    const merged = applyPerformanceSetSelections(record.localSet, record.incomingSet, selections);
    merged.updatedAt = Date.now();
    setsMap[record.id] = merged;
    delete deletedMap[record.id];
  });

  Object.values(prepared.compared.localUpdates || {}).forEach(function(pair) {
    if (!pair || !pair[1] || !pair[1].id) return;
    setsMap[pair[1].id] = Object.assign({}, pair[1]);
    delete deletedMap[pair[1].id];
  });

  Object.values(prepared.compared.localInserts || {}).forEach(function(setRecord) {
    if (!setRecord || !setRecord.id) return;
    setsMap[setRecord.id] = Object.assign({}, setRecord);
    delete deletedMap[setRecord.id];
  });

  deletedMap = mergeDeletedSetMaps(deletedMap, prepared.remote.deleted || {});

  writeStorageFromSetsMap(setsMap, deletedMap);
  return { changed: true, needsUpload: true };
}
