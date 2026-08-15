import {
  buildMergedPracticeLists,
  comparePracticeLists,
  parsePracticeListsFromAbc,
} from './practiceListSync';
import {
  readDeletedPracticeLists,
  readPracticeListsMap,
  writeDeletedPracticeLists,
  writePracticeListsMap,
  notifyPracticeListsChanged,
} from './practiceListStore';
import { readLastDriveUploadSnapshot } from './driveUploadShrinkGuard';

function practiceListsMapWithIds(storageMap) {
  const withIds = {};
  Object.keys(storageMap || {}).forEach(function(id) {
    withIds[id] = Object.assign({ id: id }, storageMap[id]);
  });
  return withIds;
}

export function preparePracticeListMergeFromAbc(abcText) {
  const remote = parsePracticeListsFromAbc(abcText || '');
  const localStoragePracticeLists = readPracticeListsMap();
  const localDeleted = readDeletedPracticeLists();
  const localPracticeLists = practiceListsMapWithIds(localStoragePracticeLists);
  const lastUpload = readLastDriveUploadSnapshot() || {};
  const compared = comparePracticeLists({
    localPracticeLists: localPracticeLists,
    localDeleted: localDeleted,
    remotePracticeLists: remote.practiceLists,
    remoteDeleted: remote.deleted,
    lastUpdatedById: lastUpload.practiceListUpdatedAtById,
    lastDeletedAtById: lastUpload.practiceListDeletedAtById,
  });
  const hasIncoming = Object.keys(compared.inserts).length > 0
    || Object.keys(compared.updates).length > 0
    || Object.keys(compared.deletes).length > 0;
  const hasLocalOnly = Object.keys(compared.localUpdates).length > 0
    || Object.keys(compared.localInserts).length > 0;

  return {
    compared: compared,
    remote: remote,
    localPracticeLists: localPracticeLists,
    localDeleted: localDeleted,
    hasIncoming: hasIncoming,
    hasLocalOnly: hasLocalOnly,
  };
}

export function applyPracticeListMergeAcceptAll(prepared) {
  if (!prepared) return { changed: false };

  const mergeResult = buildMergedPracticeLists({
    localPracticeLists: prepared.localPracticeLists,
    localDeleted: prepared.localDeleted,
    remotePracticeLists: prepared.remote.practiceLists,
    remoteDeleted: prepared.remote.deleted,
  });

  if (!mergeResult.changed) {
    return { changed: false, needsUpload: false };
  }

  writePracticeListsMap(mergeResult.storagePracticeLists);
  writeDeletedPracticeLists(mergeResult.mergedDeleted);
  notifyPracticeListsChanged();
  return {
    changed: true,
    needsUpload: mergeResult.needsUpload,
    added: mergeResult.added,
    changedNames: mergeResult.changedNames,
    deleted: mergeResult.deleted,
  };
}
