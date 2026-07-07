import {
  applyPlaylistSelections,
  buildDefaultPlaylistSelections,
  buildPlaylistFieldRows,
  playlistPairHasDifferingFields,
  setAllPlaylistSelections,
} from './playlistMergeUtils';
import {
  buildMergedPlaylists,
  comparePlaylists,
  createPlaylistTombstone,
  mergeDeletedPlaylistMaps,
  parsePlaylistsFromAbc,
} from './playlistSync';
import {
  readDeletedPlaylists,
  readPlaylistsMap,
  writeDeletedPlaylists,
  writePlaylistsMap,
  notifyPlaylistsChanged,
} from './savedPlaylistsStore';

function playlistsMapWithIds(storageMap) {
  const withIds = {};
  Object.keys(storageMap || {}).forEach(function(id) {
    withIds[id] = Object.assign({ id: id }, storageMap[id]);
  });
  return withIds;
}

function playlistRecordToStorage(playlistRecord) {
  const next = Object.assign({}, playlistRecord);
  delete next.id;
  return next;
}

function playlistDisplayName(playlistRecord) {
  if (!playlistRecord) return 'Playlist';
  return playlistRecord.name || 'Playlist';
}

export function summarizePlaylistMergeRecords(records) {
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

export function buildPlaylistMergeRecords(compared) {
  const records = [];
  if (!compared) return records;

  Object.values(compared.inserts || {}).forEach(function(playlistRecord) {
    if (!playlistRecord || !playlistRecord.id) return;
    records.push({
      id: playlistRecord.id,
      kind: 'insert',
      label: playlistDisplayName(playlistRecord),
      localPlaylist: null,
      incomingPlaylist: playlistRecord,
    });
  });

  Object.keys(compared.updates || {}).forEach(function(id) {
    const pair = compared.updates[id];
    if (!pair || !pair[1]) return;
    if (!playlistPairHasDifferingFields(pair[0], pair[1])) return;
    records.push({
      id: id,
      kind: 'update',
      label: playlistDisplayName(pair[0]) || playlistDisplayName(pair[1]) || id,
      localPlaylist: pair[0],
      incomingPlaylist: pair[1],
    });
  });

  Object.keys(compared.deletes || {}).forEach(function(id) {
    const localPlaylist = compared.deletes[id];
    records.push({
      id: id,
      kind: 'delete',
      label: playlistDisplayName(localPlaylist) || id,
      localPlaylist: localPlaylist,
      incomingPlaylist: null,
    });
  });

  return records;
}

export function buildDefaultFieldSelectionsForPlaylistRecord(record, onlyDiffering, tunesById) {
  const rows = buildPlaylistFieldRows(record.localPlaylist, record.incomingPlaylist, tunesById);
  const filtered = onlyDiffering ? rows.filter(function(row) { return row.differs; }) : rows;
  return buildDefaultPlaylistSelections(filtered);
}

export function buildFieldSelectionsForPlaylistRecord(record, onlyDiffering, tunesById) {
  const rows = buildPlaylistFieldRows(record.localPlaylist, record.incomingPlaylist, tunesById);
  const filtered = onlyDiffering ? rows.filter(function(row) { return row.differs; }) : rows;
  return setAllPlaylistSelections(filtered, true);
}

export function preparePlaylistMergeFromAbc(abcText, tunesById) {
  const remote = parsePlaylistsFromAbc(abcText || '');
  const localStoragePlaylists = readPlaylistsMap();
  const localDeleted = readDeletedPlaylists();
  const localPlaylists = playlistsMapWithIds(localStoragePlaylists);
  const compared = comparePlaylists({
    localPlaylists: localPlaylists,
    localDeleted: localDeleted,
    remotePlaylists: remote.playlists,
    remoteDeleted: remote.deleted,
  });
  const records = buildPlaylistMergeRecords(compared);
  const hasIncoming = records.length > 0;
  const hasLocalOnly = Object.keys(compared.localUpdates || {}).length > 0
    || Object.keys(compared.localInserts || {}).length > 0;

  return {
    abcText: abcText || '',
    compared: compared,
    remote: remote,
    localPlaylists: localPlaylists,
    localDeleted: localDeleted,
    records: records,
    summary: summarizePlaylistMergeRecords(records),
    hasIncoming: hasIncoming,
    hasLocalOnly: hasLocalOnly,
    tunesById: tunesById || {},
  };
}

function writeStorageFromPlaylistsMap(playlistsMap, deletedMap) {
  const storagePlaylists = {};
  Object.keys(playlistsMap || {}).forEach(function(id) {
    storagePlaylists[id] = playlistRecordToStorage(Object.assign({ id: id }, playlistsMap[id]));
  });
  writePlaylistsMap(storagePlaylists);
  writeDeletedPlaylists(deletedMap || {});
  notifyPlaylistsChanged();
}

export function applyPlaylistMergeAcceptAll(prepared) {
  if (!prepared) return { changed: false };

  const mergeResult = buildMergedPlaylists({
    localPlaylists: prepared.localPlaylists,
    localDeleted: prepared.localDeleted,
    remotePlaylists: prepared.remote.playlists,
    remoteDeleted: prepared.remote.deleted,
  });

  if (!mergeResult.changed) {
    return { changed: false, needsUpload: false };
  }

  writePlaylistsMap(mergeResult.storagePlaylists);
  writeDeletedPlaylists(mergeResult.mergedDeleted);
  notifyPlaylistsChanged();
  return {
    changed: true,
    needsUpload: mergeResult.needsUpload,
  };
}

export function applyPlaylistMergeWithSelections(prepared, recordState) {
  if (!prepared) return { changed: false };

  if (!recordState) {
    return applyPlaylistMergeAcceptAll(prepared);
  }

  const playlistsMap = Object.assign({}, prepared.localPlaylists || {});
  let deletedMap = Object.assign({}, prepared.localDeleted || {});

  (prepared.records || []).forEach(function(record) {
    const state = recordState[record.id] || {};
    if (state.accept === false) return;

    if (record.kind === 'delete') {
      delete playlistsMap[record.id];
      if (!deletedMap[record.id]) {
        deletedMap[record.id] = createPlaylistTombstone(
          record.id,
          playlistDisplayName(record.localPlaylist),
          Date.now()
        );
      }
      return;
    }

    if (record.kind === 'insert') {
      playlistsMap[record.id] = Object.assign({}, record.incomingPlaylist);
      delete deletedMap[record.id];
      return;
    }

    const selections = state.fieldSelections
      || buildDefaultFieldSelectionsForPlaylistRecord(record, true, prepared.tunesById);
    const merged = applyPlaylistSelections(record.localPlaylist, record.incomingPlaylist, selections);
    merged.updatedAt = Date.now();
    playlistsMap[record.id] = merged;
    delete deletedMap[record.id];
  });

  Object.values(prepared.compared.localUpdates || {}).forEach(function(pair) {
    if (!pair || !pair[1] || !pair[1].id) return;
    playlistsMap[pair[1].id] = Object.assign({}, pair[1]);
    delete deletedMap[pair[1].id];
  });

  Object.values(prepared.compared.localInserts || {}).forEach(function(playlistRecord) {
    if (!playlistRecord || !playlistRecord.id) return;
    playlistsMap[playlistRecord.id] = Object.assign({}, playlistRecord);
    delete deletedMap[playlistRecord.id];
  });

  deletedMap = mergeDeletedPlaylistMaps(deletedMap, prepared.remote.deleted || {});

  writeStorageFromPlaylistsMap(playlistsMap, deletedMap);
  return { changed: true, needsUpload: true };
}
