import {
  readPerformanceSetsMap,
  writePerformanceSetsMap,
  readDeletedPerformanceSets,
  writeDeletedPerformanceSets,
  notifyPerformanceSetsChanged,
} from './performanceSetStore';
import {
  applyPerformanceSetMergeAcceptAll,
  applyPerformanceSetMergeWithSelections,
  preparePerformanceSetMergeFromAbc,
} from './performanceSetIncomingMergeUtils';
import { buildMergedPerformanceSets, parsePerformanceSetsFromAbc } from './performanceSetSync';
import { applyExternalSharePersonalFieldsToSetStorage } from './shareImportPersonalFields';
import { showPerformanceSetSyncToast } from './performanceSetSyncToast';

function setsMapWithIds(storageMap) {
  const withIds = {};
  Object.keys(storageMap || {}).forEach(function(id) {
    withIds[id] = Object.assign({ id: id }, storageMap[id]);
  });
  return withIds;
}

export function mergePerformanceSetsFromTuneBookAbc(abcText, options) {
  const opts = options || {};
  try {
    const prepared = preparePerformanceSetMergeFromAbc(abcText, opts.tunesById);
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
      return Promise.resolve(applyPerformanceSetMergeAcceptAll(prepared)).then(function(result) {
        return Object.assign({ needsReview: false }, result, {
          added: prepared.compared.inserts ? Object.values(prepared.compared.inserts).map(function(s) { return s.name; }) : [],
          changedNames: prepared.compared.updates ? Object.keys(prepared.compared.updates).map(function(id) {
            const pair = prepared.compared.updates[id];
            return pair && pair[1] ? pair[1].name : id;
          }) : [],
          deleted: prepared.compared.deletes ? Object.values(prepared.compared.deletes).map(function(s) { return s.name; }) : [],
          hadIncoming: true,
        });
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

export function applyPreparedPerformanceSetMerge(prepared, recordState) {
  return applyPerformanceSetMergeWithSelections(prepared, recordState);
}

export function acceptPreparedPerformanceSetMerge(prepared) {
  return applyPerformanceSetMergeAcceptAll(prepared);
}

/** @deprecated use mergePerformanceSetsFromTuneBookAbc with interactive:false */
export function mergePerformanceSetsFromTuneBookAbcLegacy(abcText) {
  return mergePerformanceSetsFromTuneBookAbc(abcText, { interactive: false, applySilently: true });
}

export function syncPerformanceSetsFromTuneBookAbc(abcText, options) {
  const opts = options || {};
  return mergePerformanceSetsFromTuneBookAbc(abcText, Object.assign({}, opts, {
    tunesById: opts.tunesById,
  })).then(function(result) {
    if (result.needsReview) {
      return result;
    }
    if (opts.showToast !== false && result.changed && result.hadIncoming) {
      showPerformanceSetSyncToast(result);
    } else if (opts.showToast !== false && result.error) {
      showPerformanceSetSyncToast(result);
    }
    return result;
  });
}

export function replacePerformanceSetsFromTuneBookAbc(abcText) {
  const remote = parsePerformanceSetsFromAbc(abcText || '');
  const storageSets = {};
  Object.keys(remote.sets || {}).forEach(function(id) {
    const setRecord = remote.sets[id];
    const next = Object.assign({}, setRecord);
    delete next.id;
    storageSets[id] = next;
  });
  writePerformanceSetsMap(storageSets);
  writeDeletedPerformanceSets(remote.deleted || {});
  notifyPerformanceSetsChanged();
}

export function importSinglePerformanceSetFromAbc(abcText, setId) {
  if (!setId) return { changed: false };
  try {
    const remote = parsePerformanceSetsFromAbc(abcText || '');
    const remoteSet = remote.sets && remote.sets[setId] ? remote.sets[setId] : null;
    if (!remoteSet) return { changed: false, missing: true };

    const localStorageSets = readPerformanceSetsMap();
    const localDeleted = readDeletedPerformanceSets();
    const localSets = setsMapWithIds(localStorageSets);
    const filteredRemoteSets = {};
    filteredRemoteSets[setId] = remoteSet;

    const mergeResult = buildMergedPerformanceSets({
      localSets: localSets,
      localDeleted: localDeleted,
      remoteSets: filteredRemoteSets,
      remoteDeleted: {},
    });

    if (!mergeResult.changed) {
      return { changed: false };
    }

    applyExternalSharePersonalFieldsToSetStorage(
      mergeResult.storageSets,
      setId,
      localStorageSets
    );

    writePerformanceSetsMap(mergeResult.storageSets);
    writeDeletedPerformanceSets(mergeResult.mergedDeleted);
    notifyPerformanceSetsChanged();
    return {
      changed: true,
      setId: setId,
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
