import {
  readPracticeListsMap,
  writePracticeListsMap,
  readDeletedPracticeLists,
  writeDeletedPracticeLists,
  notifyPracticeListsChanged,
} from './practiceListStore';
import {
  applyPracticeListMergeAcceptAll,
  preparePracticeListMergeFromAbc,
} from './practiceListIncomingMergeUtils';
import { buildMergedPracticeLists, parsePracticeListsFromAbc } from './practiceListSync';

function practiceListsMapWithIds(storageMap) {
  const withIds = {};
  Object.keys(storageMap || {}).forEach(function(id) {
    withIds[id] = Object.assign({ id: id }, storageMap[id]);
  });
  return withIds;
}

export function mergePracticeListsFromTuneBookAbc(abcText, options) {
  const opts = options || {};
  try {
    const prepared = preparePracticeListMergeFromAbc(abcText);
    if (!prepared.hasIncoming && !prepared.hasLocalOnly) {
      return Promise.resolve({ changed: false, needsReview: false });
    }
    if (!prepared.hasIncoming) {
      return Promise.resolve({
        changed: prepared.hasLocalOnly,
        needsReview: false,
        needsUpload: prepared.hasLocalOnly,
      });
    }
    if (opts.interactive === false || opts.applySilently) {
      return Promise.resolve(applyPracticeListMergeAcceptAll(prepared)).then(function(result) {
        return Object.assign({ needsReview: false, hadIncoming: true }, result);
      });
    }
    return Promise.resolve({
      changed: true,
      needsReview: true,
      prepared: prepared,
      needsUpload: prepared.hasLocalOnly,
    });
  } catch (e) {
    return Promise.resolve({
      changed: false,
      needsReview: false,
      error: e && e.message ? e.message : 'Unknown error',
    });
  }
}

export function replacePracticeListsFromTuneBookAbc(abcText) {
  const remote = parsePracticeListsFromAbc(abcText || '');
  const storagePracticeLists = {};
  Object.keys(remote.practiceLists || {}).forEach(function(id) {
    const listRecord = remote.practiceLists[id];
    const next = Object.assign({}, listRecord);
    delete next.id;
    storagePracticeLists[id] = next;
  });
  writePracticeListsMap(storagePracticeLists);
  writeDeletedPracticeLists(remote.deleted || {});
  notifyPracticeListsChanged();
}

export function importSinglePracticeListFromAbc(abcText, listId) {
  if (!listId) return { changed: false };
  try {
    const remote = parsePracticeListsFromAbc(abcText || '');
    const remoteList = remote.practiceLists && remote.practiceLists[listId]
      ? remote.practiceLists[listId]
      : null;
    if (!remoteList) return { changed: false, missing: true };

    const localStoragePracticeLists = readPracticeListsMap();
    const localDeleted = readDeletedPracticeLists();
    const localPracticeLists = practiceListsMapWithIds(localStoragePracticeLists);
    const filteredRemotePracticeLists = {};
    filteredRemotePracticeLists[listId] = remoteList;

    const mergeResult = buildMergedPracticeLists({
      localPracticeLists: localPracticeLists,
      localDeleted: localDeleted,
      remotePracticeLists: filteredRemotePracticeLists,
      remoteDeleted: {},
    });

    if (!mergeResult.changed) {
      return { changed: false };
    }

    writePracticeListsMap(mergeResult.storagePracticeLists);
    writeDeletedPracticeLists(mergeResult.mergedDeleted);
    notifyPracticeListsChanged();
    return {
      changed: true,
      listId: listId,
      added: mergeResult.added,
      changedNames: mergeResult.changedNames,
    };
  } catch (e) {
    return {
      changed: false,
      error: e && e.message ? e.message : 'Unknown error',
    };
  }
}
