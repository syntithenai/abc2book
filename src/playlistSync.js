import {
  createTombstone,
  mergeDeletedTuneMaps,
} from './tuneBookSync';
import { playlistPairHasDifferingFields } from './playlistMergeUtils';

export const PLAYLISTS_BEGIN = '% abcbook-playlists-begin';
export const PLAYLISTS_END = '% abcbook-playlists-end';
export const PLAYLIST_HEADER_PREFIX = '% abcbook-playlist ';
export const DELETED_PLAYLIST_PREFIX = '% abcbook-deleted-playlist ';
export const PLAYLIST_JSON_PREFIX = '% abcbook-playlist-json ';
const PLAYLIST_JSON_CHUNK_SIZE = 180;

const PLAYLIST_LINE_PREFIXES = [
  PLAYLISTS_BEGIN,
  PLAYLISTS_END,
  PLAYLIST_HEADER_PREFIX,
  DELETED_PLAYLIST_PREFIX,
  PLAYLIST_JSON_PREFIX,
];

function toMs(ts) {
  return parseInt(ts, 10) || 0;
}

function tombstoneWinsOverPlaylist(tombAt, playlistAt) {
  return tombAt > 0 && tombAt >= playlistAt;
}

function playlistDisplayName(playlistRecord) {
  if (!playlistRecord) return 'Playlist';
  return playlistRecord.name || 'Playlist';
}

function normalizePlaylistBody(playlistRecord) {
  if (!playlistRecord) return null;
  return {
    name: playlistRecord.name || '',
    items: Array.isArray(playlistRecord.items) ? playlistRecord.items : [],
    followTune: !!playlistRecord.followTune,
    loop: !!playlistRecord.loop,
    shuffle: !!playlistRecord.shuffle,
    autoAdvance: playlistRecord.autoAdvance !== false,
    updatedAt: toMs(playlistRecord.updatedAt),
  };
}

function playlistsEqual(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(normalizePlaylistBody(a)) === JSON.stringify(normalizePlaylistBody(b));
}

function renderPlaylistJsonChunks(playlistId, body) {
  const json = JSON.stringify(body);
  const chunks = [];
  for (let i = 0; i < json.length; i += PLAYLIST_JSON_CHUNK_SIZE) {
    chunks.push(json.slice(i, i + PLAYLIST_JSON_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('{}');
  return chunks.map(function(chunk, idx) {
    return PLAYLIST_JSON_PREFIX + playlistId + ' ' + (idx + 1) + '/' + chunks.length + ' ' + chunk;
  });
}

export function renderDeletedPlaylistsToAbc(deletedPlaylistsMap) {
  if (!deletedPlaylistsMap) return '';
  return Object.values(deletedPlaylistsMap).map(function(t) {
    const namePart = t.name ? ' ' + t.name : '';
    return DELETED_PLAYLIST_PREFIX + t.id + ' ' + t.deletedAt + namePart;
  }).join('\n');
}

export function parseDeletedPlaylistsFromAbc(abcText) {
  const deleted = {};
  if (!abcText || !abcText.split) return deleted;
  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DELETED_PLAYLIST_PREFIX)) return;
    const rest = trimmed.slice(DELETED_PLAYLIST_PREFIX.length);
    const space = rest.indexOf(' ');
    if (space === -1) return;
    const id = rest.slice(0, space);
    const remainder = rest.slice(space + 1).trim();
    const secondSpace = remainder.indexOf(' ');
    const deletedAt = secondSpace === -1
      ? parseInt(remainder, 10) || 0
      : parseInt(remainder.slice(0, secondSpace), 10) || 0;
    const name = secondSpace === -1 ? '' : remainder.slice(secondSpace + 1).trim();
    if (!id) return;
    if (!deleted[id] || deletedAt >= deleted[id].deletedAt) {
      deleted[id] = { id: id, deletedAt: deletedAt, name: name || undefined };
    }
  });
  return deleted;
}

function parsePlaylistJsonLine(line) {
  if (!line || !line.startsWith(PLAYLIST_JSON_PREFIX)) return null;
  const rest = line.slice(PLAYLIST_JSON_PREFIX.length);
  const firstSpace = rest.indexOf(' ');
  if (firstSpace < 0) return null;
  const playlistId = rest.slice(0, firstSpace);
  const chunkPart = rest.slice(firstSpace + 1);
  const match = chunkPart.match(/^(\d+)\/(\d+)\s+(.*)$/);
  if (!match) return null;
  return {
    playlistId: playlistId,
    index: parseInt(match[1], 10) - 1,
    total: parseInt(match[2], 10),
    data: match[3],
  };
}

function applyPlaylistJsonChunks(chunksByPlaylistId) {
  const result = {};
  Object.keys(chunksByPlaylistId || {}).forEach(function(playlistId) {
    const parts = chunksByPlaylistId[playlistId];
    if (!Array.isArray(parts) || parts.length === 0) return;
    const sorted = parts.slice().sort(function(a, b) {
      return a.index - b.index;
    });
    const json = sorted.map(function(part) { return part.data; }).join('');
    try {
      result[playlistId] = JSON.parse(json);
    } catch (e) {
      // Skip corrupt playlist payloads.
    }
  });
  return result;
}

export function parsePlaylistsFromAbc(abcText) {
  const playlists = {};
  const deleted = parseDeletedPlaylistsFromAbc(abcText);
  if (!abcText || !abcText.split) {
    return { playlists: playlists, deleted: deleted };
  }

  let inSection = false;
  const playlistUpdatedAt = {};
  const jsonChunks = {};

  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim();
    if (trimmed === PLAYLISTS_BEGIN) {
      inSection = true;
      return;
    }
    if (trimmed === PLAYLISTS_END) {
      inSection = false;
      return;
    }
    if (!inSection) return;

    if (trimmed.startsWith(PLAYLIST_HEADER_PREFIX)) {
      const rest = trimmed.slice(PLAYLIST_HEADER_PREFIX.length).trim();
      const space = rest.indexOf(' ');
      if (space === -1) return;
      const playlistId = rest.slice(0, space);
      playlistUpdatedAt[playlistId] = toMs(rest.slice(space + 1).trim());
      return;
    }

    const jsonChunk = parsePlaylistJsonLine(trimmed);
    if (jsonChunk) {
      if (!jsonChunks[jsonChunk.playlistId]) jsonChunks[jsonChunk.playlistId] = [];
      jsonChunks[jsonChunk.playlistId].push(jsonChunk);
      return;
    }
  });

  const bodies = applyPlaylistJsonChunks(jsonChunks);
  Object.keys(bodies).forEach(function(playlistId) {
    const body = bodies[playlistId];
    if (!body || typeof body !== 'object') return;
    playlists[playlistId] = Object.assign({}, body, {
      id: playlistId,
      updatedAt: toMs(body.updatedAt) || playlistUpdatedAt[playlistId] || Date.now(),
    });
  });

  return { playlists: playlists, deleted: deleted };
}

export function renderPlaylistsToAbc(playlistsMap, deletedPlaylistsMap) {
  const playlistIds = Object.keys(playlistsMap || {}).sort();
  const tombstones = renderDeletedPlaylistsToAbc(deletedPlaylistsMap);
  if (playlistIds.length === 0 && !tombstones) return '';

  const lines = [PLAYLISTS_BEGIN];
  playlistIds.forEach(function(playlistId) {
    const playlistRecord = playlistsMap[playlistId];
    if (!playlistRecord) return;
    const body = normalizePlaylistBody(playlistRecord);
    const updatedAt = body.updatedAt || Date.now();
    lines.push(PLAYLIST_HEADER_PREFIX + playlistId + ' ' + updatedAt);
    lines.push.apply(lines, renderPlaylistJsonChunks(playlistId, body));
  });
  if (tombstones) {
    lines.push(tombstones);
  }
  lines.push(PLAYLISTS_END);
  return lines.join('\n');
}

export function stripPlaylistLines(abcText) {
  if (!abcText || !abcText.split) return abcText || '';
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim();
    return !PLAYLIST_LINE_PREFIXES.some(function(prefix) {
      return trimmed.startsWith(prefix) || trimmed === prefix;
    });
  }).join('\n');
}

export function comparePlaylists({ localPlaylists, localDeleted, remotePlaylists, remoteDeleted }) {
  const inserts = {};
  const updates = {};
  const deletes = {};
  const localUpdates = {};
  const localInserts = {};

  const localDel = localDeleted || {};
  const remoteDel = remoteDeleted || {};
  const remoteActiveIds = {};

  Object.values(remotePlaylists || {}).forEach(function(remotePlaylist) {
    if (!remotePlaylist || !remotePlaylist.id) return;
    const id = remotePlaylist.id;
    remoteActiveIds[id] = true;

    const localPlaylist = localPlaylists[id];
    const localTomb = localDel[id];
    const remoteTomb = remoteDel[id];
    const remoteAt = toMs(remotePlaylist.updatedAt);
    const localAt = localPlaylist ? toMs(localPlaylist.updatedAt) : 0;
    const localTombAt = localTomb ? toMs(localTomb.deletedAt) : 0;
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0;

    if (tombstoneWinsOverPlaylist(remoteTombAt, localAt)) {
      if (localPlaylist) {
        deletes[id] = Object.assign({ id: id }, localPlaylist, { name: playlistDisplayName(localPlaylist) });
      }
      return;
    }

    if (tombstoneWinsOverPlaylist(localTombAt, remoteAt)) {
      return;
    }

    if (localPlaylist) {
      const hasFieldDiff = playlistPairHasDifferingFields(localPlaylist, remotePlaylist);
      if (remoteAt > localAt) {
        if (hasFieldDiff) updates[id] = [localPlaylist, remotePlaylist];
      } else if (remoteAt < localAt) {
        if (hasFieldDiff) localUpdates[id] = [remotePlaylist, localPlaylist];
      }
    } else {
      inserts[id] = remotePlaylist;
    }
  });

  Object.keys(localPlaylists || {}).forEach(function(playlistId) {
    if (remoteActiveIds[playlistId]) return;

    const localPlaylist = localPlaylists[playlistId];
    const remoteTomb = remoteDel[playlistId];
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0;
    const localAt = toMs(localPlaylist.updatedAt);

    if (tombstoneWinsOverPlaylist(remoteTombAt, localAt)) {
      deletes[playlistId] = Object.assign({ id: playlistId }, localPlaylist, { name: playlistDisplayName(localPlaylist) });
      return;
    }

    localInserts[playlistId] = localPlaylist;
  });

  return { inserts, updates, deletes, localUpdates, localInserts };
}

export function mergeDeletedPlaylistMaps(localDeleted, remoteDeleted) {
  return mergeDeletedTuneMaps(localDeleted, remoteDeleted);
}

export function createPlaylistTombstone(playlistId, name, deletedAt) {
  return createTombstone(playlistId, name, deletedAt);
}

function playlistRecordToStorage(playlistRecord) {
  const next = Object.assign({}, playlistRecord);
  delete next.id;
  return next;
}

export function buildMergedPlaylists({ localPlaylists, localDeleted, remotePlaylists, remoteDeleted }) {
  const compared = comparePlaylists({
    localPlaylists: localPlaylists,
    localDeleted: localDeleted,
    remotePlaylists: remotePlaylists,
    remoteDeleted: remoteDeleted,
  });

  const mergedPlaylists = Object.assign({}, localPlaylists || {});
  Object.keys(compared.deletes).forEach(function(id) {
    delete mergedPlaylists[id];
  });
  Object.values(compared.inserts).forEach(function(playlistRecord) {
    if (!playlistRecord || !playlistRecord.id) return;
    mergedPlaylists[playlistRecord.id] = Object.assign({ id: playlistRecord.id }, playlistRecord);
  });
  Object.values(compared.updates).forEach(function(pair) {
    if (!pair || !pair[1] || !pair[1].id) return;
    mergedPlaylists[pair[1].id] = Object.assign({}, pair[1]);
  });

  let mergedDeleted = mergeDeletedPlaylistMaps(localDeleted, remoteDeleted);
  Object.keys(compared.deletes).forEach(function(id) {
    const localPlaylist = localPlaylists[id];
    if (!mergedDeleted[id]) {
      mergedDeleted[id] = createPlaylistTombstone(
        id,
        playlistDisplayName(localPlaylist),
        Date.now()
      );
    }
  });
  Object.keys(mergedPlaylists).forEach(function(id) {
    delete mergedDeleted[id];
  });

  const storagePlaylists = {};
  Object.keys(mergedPlaylists).forEach(function(id) {
    storagePlaylists[id] = playlistRecordToStorage(mergedPlaylists[id]);
  });

  const hadLocalChanges = Object.keys(compared.localInserts).length > 0
    || Object.keys(compared.localUpdates).length > 0;
  const hadRemoteChanges = Object.keys(compared.inserts).length > 0
    || Object.keys(compared.updates).length > 0
    || Object.keys(compared.deletes).length > 0;
  const changed = hadLocalChanges || hadRemoteChanges;

  const added = Object.values(compared.inserts).map(playlistDisplayName);
  const changedNames = Object.values(compared.updates).map(function(pair) {
    return playlistDisplayName(pair[1]);
  });
  const deletedNames = Object.values(compared.deletes).map(playlistDisplayName);

  return {
    compared: compared,
    storagePlaylists: storagePlaylists,
    mergedDeleted: mergedDeleted,
    changed: changed,
    needsUpload: changed,
    added: added,
    changedNames: changedNames,
    deleted: deletedNames,
  };
}

export function localPlaylistsDiffer(localPlaylists, mergedStoragePlaylists) {
  const localKeys = Object.keys(localPlaylists || {}).sort();
  const mergedKeys = Object.keys(mergedStoragePlaylists || {}).sort();
  if (localKeys.join(',') !== mergedKeys.join(',')) return true;
  for (let i = 0; i < localKeys.length; i++) {
    const id = localKeys[i];
    if (!playlistsEqual(
      Object.assign({ id: id }, localPlaylists[id]),
      Object.assign({ id: id }, mergedStoragePlaylists[id])
    )) {
      return true;
    }
  }
  return false;
}
