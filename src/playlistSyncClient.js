import {
  readPlaylistsMap,
  writePlaylistsMap,
  readDeletedPlaylists,
  writeDeletedPlaylists,
  notifyPlaylistsChanged,
} from './savedPlaylistsStore';
import {
  applyPlaylistMergeAcceptAll,
  applyPlaylistMergeWithSelections,
  preparePlaylistMergeFromAbc,
} from './playlistIncomingMergeUtils';
import { buildMergedPlaylists, parsePlaylistsFromAbc } from './playlistSync';
import { applyExternalSharePersonalFieldsToPlaylistStorage } from './shareImportPersonalFields';

function playlistsMapWithIds(storageMap) {
  const withIds = {};
  Object.keys(storageMap || {}).forEach(function(id) {
    withIds[id] = Object.assign({ id: id }, storageMap[id]);
  });
  return withIds;
}

export function mergePlaylistsFromTuneBookAbc(abcText, options) {
  const opts = options || {};
  try {
    const prepared = preparePlaylistMergeFromAbc(abcText, opts.tunesById);
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
      return Promise.resolve(applyPlaylistMergeAcceptAll(prepared)).then(function(result) {
        return Object.assign({ needsReview: false }, result, {
          added: prepared.compared.inserts ? Object.values(prepared.compared.inserts).map(function(p) { return p.name; }) : [],
          changedNames: prepared.compared.updates ? Object.keys(prepared.compared.updates).map(function(id) {
            const pair = prepared.compared.updates[id];
            return pair && pair[1] ? pair[1].name : id;
          }) : [],
          deleted: prepared.compared.deletes ? Object.values(prepared.compared.deletes).map(function(p) { return p.name; }) : [],
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

export function applyPreparedPlaylistMerge(prepared, recordState) {
  return applyPlaylistMergeWithSelections(prepared, recordState);
}

export function acceptPreparedPlaylistMerge(prepared) {
  return applyPlaylistMergeAcceptAll(prepared);
}

export function syncPlaylistsFromTuneBookAbc(abcText, options) {
  const opts = options || {};
  return mergePlaylistsFromTuneBookAbc(abcText, Object.assign({}, opts, {
    tunesById: opts.tunesById,
  }));
}

export function replacePlaylistsFromTuneBookAbc(abcText) {
  const remote = parsePlaylistsFromAbc(abcText || '');
  const storagePlaylists = {};
  Object.keys(remote.playlists || {}).forEach(function(id) {
    const playlistRecord = remote.playlists[id];
    const next = Object.assign({}, playlistRecord);
    delete next.id;
    storagePlaylists[id] = next;
  });
  writePlaylistsMap(storagePlaylists);
  writeDeletedPlaylists(remote.deleted || {});
  notifyPlaylistsChanged();
}

export function importSinglePlaylistFromAbc(abcText, playlistId) {
  if (!playlistId) return { changed: false };
  try {
    const remote = parsePlaylistsFromAbc(abcText || '');
    const remotePlaylist = remote.playlists && remote.playlists[playlistId] ? remote.playlists[playlistId] : null;
    if (!remotePlaylist) return { changed: false, missing: true };

    const localStoragePlaylists = readPlaylistsMap();
    const localDeleted = readDeletedPlaylists();
    const localPlaylists = playlistsMapWithIds(localStoragePlaylists);
    const filteredRemotePlaylists = {};
    filteredRemotePlaylists[playlistId] = remotePlaylist;

    const mergeResult = buildMergedPlaylists({
      localPlaylists: localPlaylists,
      localDeleted: localDeleted,
      remotePlaylists: filteredRemotePlaylists,
      remoteDeleted: {},
    });

    if (!mergeResult.changed) {
      return { changed: false };
    }

    applyExternalSharePersonalFieldsToPlaylistStorage(
      mergeResult.storagePlaylists,
      playlistId,
      localStoragePlaylists
    );

    writePlaylistsMap(mergeResult.storagePlaylists);
    writeDeletedPlaylists(mergeResult.mergedDeleted);
    notifyPlaylistsChanged();
    return {
      changed: true,
      playlistId: playlistId,
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
