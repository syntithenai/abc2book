import {
  createTombstone,
  mergeDeletedTuneMaps,
} from './tuneBookSync';
import { performanceSetPairHasDifferingFields } from './performanceSetMergeUtils';

export const PERFORMANCE_SETS_BEGIN = '% abcbook-performance-sets-begin';
export const PERFORMANCE_SETS_END = '% abcbook-performance-sets-end';
export const PERFORMANCE_SET_HEADER_PREFIX = '% abcbook-performance-set ';
export const DELETED_SET_PREFIX = '% abcbook-deleted-set ';
export const SET_JSON_PREFIX = '% abcbook-set-json ';
const SET_JSON_CHUNK_SIZE = 180;

const PERFORMANCE_SET_LINE_PREFIXES = [
  PERFORMANCE_SETS_BEGIN,
  PERFORMANCE_SETS_END,
  PERFORMANCE_SET_HEADER_PREFIX,
  DELETED_SET_PREFIX,
  SET_JSON_PREFIX,
];

function toMs(ts) {
  return parseInt(ts, 10) || 0;
}

function tombstoneWinsOverSet(tombAt, setAt) {
  return tombAt > 0 && tombAt >= setAt;
}

function setDisplayName(setRecord) {
  if (!setRecord) return 'Set';
  return setRecord.name || 'Set';
}

function normalizeSetBody(setRecord) {
  if (!setRecord) return null;
  return {
    name: setRecord.name || '',
    date: setRecord.date || '',
    notes: setRecord.notes || '',
    items: Array.isArray(setRecord.items) ? setRecord.items : [],
    updatedAt: toMs(setRecord.updatedAt),
  };
}

function setsEqual(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(normalizeSetBody(a)) === JSON.stringify(normalizeSetBody(b));
}

function renderSetJsonChunks(setId, body) {
  const json = JSON.stringify(body);
  const chunks = [];
  for (let i = 0; i < json.length; i += SET_JSON_CHUNK_SIZE) {
    chunks.push(json.slice(i, i + SET_JSON_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('{}');
  return chunks.map(function(chunk, idx) {
    return SET_JSON_PREFIX + setId + ' ' + (idx + 1) + '/' + chunks.length + ' ' + chunk;
  });
}

export function renderDeletedSetsToAbc(deletedSetsMap) {
  if (!deletedSetsMap) return '';
  return Object.values(deletedSetsMap).map(function(t) {
    const namePart = t.name ? ' ' + t.name : '';
    return DELETED_SET_PREFIX + t.id + ' ' + t.deletedAt + namePart;
  }).join('\n');
}

export function parseDeletedSetsFromAbc(abcText) {
  const deleted = {};
  if (!abcText || !abcText.split) return deleted;
  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DELETED_SET_PREFIX)) return;
    const rest = trimmed.slice(DELETED_SET_PREFIX.length);
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

function parseSetJsonLine(line) {
  if (!line || !line.startsWith(SET_JSON_PREFIX)) return null;
  const rest = line.slice(SET_JSON_PREFIX.length);
  const firstSpace = rest.indexOf(' ');
  if (firstSpace < 0) return null;
  const setId = rest.slice(0, firstSpace);
  const chunkPart = rest.slice(firstSpace + 1);
  const match = chunkPart.match(/^(\d+)\/(\d+)\s+(.*)$/);
  if (!match) return null;
  return {
    setId: setId,
    index: parseInt(match[1], 10) - 1,
    total: parseInt(match[2], 10),
    data: match[3],
  };
}

function applySetJsonChunks(chunksBySetId) {
  const result = {};
  Object.keys(chunksBySetId || {}).forEach(function(setId) {
    const parts = chunksBySetId[setId];
    if (!Array.isArray(parts) || parts.length === 0) return;
    const sorted = parts.slice().sort(function(a, b) {
      return a.index - b.index;
    });
    const json = sorted.map(function(part) { return part.data; }).join('');
    try {
      result[setId] = JSON.parse(json);
    } catch (e) {
      // Skip corrupt set payloads.
    }
  });
  return result;
}

export function parsePerformanceSetsFromAbc(abcText) {
  const sets = {};
  const deleted = parseDeletedSetsFromAbc(abcText);
  if (!abcText || !abcText.split) {
    return { sets: sets, deleted: deleted };
  }

  let inSection = false;
  const setUpdatedAt = {};
  const jsonChunks = {};

  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim();
    if (trimmed === PERFORMANCE_SETS_BEGIN) {
      inSection = true;
      return;
    }
    if (trimmed === PERFORMANCE_SETS_END) {
      inSection = false;
      return;
    }
    if (!inSection) return;

    if (trimmed.startsWith(PERFORMANCE_SET_HEADER_PREFIX)) {
      const rest = trimmed.slice(PERFORMANCE_SET_HEADER_PREFIX.length).trim();
      const space = rest.indexOf(' ');
      if (space === -1) return;
      const setId = rest.slice(0, space);
      setUpdatedAt[setId] = toMs(rest.slice(space + 1).trim());
      return;
    }

    const jsonChunk = parseSetJsonLine(trimmed);
    if (jsonChunk) {
      if (!jsonChunks[jsonChunk.setId]) jsonChunks[jsonChunk.setId] = [];
      jsonChunks[jsonChunk.setId].push(jsonChunk);
      return;
    }
  });

  const bodies = applySetJsonChunks(jsonChunks);
  Object.keys(bodies).forEach(function(setId) {
    const body = bodies[setId];
    if (!body || typeof body !== 'object') return;
    sets[setId] = Object.assign({}, body, {
      id: setId,
      updatedAt: toMs(body.updatedAt) || setUpdatedAt[setId] || Date.now(),
    });
  });

  return { sets: sets, deleted: deleted };
}

export function renderPerformanceSetsToAbc(setsMap, deletedSetsMap) {
  const setIds = Object.keys(setsMap || {}).sort();
  const tombstones = renderDeletedSetsToAbc(deletedSetsMap);
  if (setIds.length === 0 && !tombstones) return '';

  const lines = [PERFORMANCE_SETS_BEGIN];
  setIds.forEach(function(setId) {
    const setRecord = setsMap[setId];
    if (!setRecord) return;
    const body = normalizeSetBody(setRecord);
    const updatedAt = body.updatedAt || Date.now();
    lines.push(PERFORMANCE_SET_HEADER_PREFIX + setId + ' ' + updatedAt);
    lines.push.apply(lines, renderSetJsonChunks(setId, body));
  });
  if (tombstones) {
    lines.push(tombstones);
  }
  lines.push(PERFORMANCE_SETS_END);
  return lines.join('\n');
}

export function stripPerformanceSetLines(abcText) {
  if (!abcText || !abcText.split) return abcText || '';
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim();
    return !PERFORMANCE_SET_LINE_PREFIXES.some(function(prefix) {
      return trimmed.startsWith(prefix) || trimmed === prefix;
    });
  }).join('\n');
}

export function comparePerformanceSets({ localSets, localDeleted, remoteSets, remoteDeleted }) {
  const inserts = {};
  const updates = {};
  const deletes = {};
  const localUpdates = {};
  const localInserts = {};

  const localDel = localDeleted || {};
  const remoteDel = remoteDeleted || {};
  const remoteActiveIds = {};

  Object.values(remoteSets || {}).forEach(function(remoteSet) {
    if (!remoteSet || !remoteSet.id) return;
    const id = remoteSet.id;
    remoteActiveIds[id] = true;

    const localSet = localSets[id];
    const localTomb = localDel[id];
    const remoteTomb = remoteDel[id];
    const remoteSetAt = toMs(remoteSet.updatedAt);
    const localSetAt = localSet ? toMs(localSet.updatedAt) : 0;
    const localTombAt = localTomb ? toMs(localTomb.deletedAt) : 0;
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0;

    if (tombstoneWinsOverSet(remoteTombAt, localSetAt)) {
      if (localSet) {
        deletes[id] = Object.assign({ id: id }, localSet, { name: setDisplayName(localSet) });
      }
      return;
    }

    if (tombstoneWinsOverSet(localTombAt, remoteSetAt)) {
      return;
    }

    if (localSet) {
      const hasFieldDiff = performanceSetPairHasDifferingFields(localSet, remoteSet);
      if (remoteSetAt > localSetAt) {
        if (hasFieldDiff) updates[id] = [localSet, remoteSet];
      } else if (remoteSetAt < localSetAt) {
        if (hasFieldDiff) localUpdates[id] = [remoteSet, localSet];
      }
    } else {
      inserts[id] = remoteSet;
    }
  });

  Object.keys(localSets || {}).forEach(function(setId) {
    if (remoteActiveIds[setId]) return;

    const localSet = localSets[setId];
    const remoteTomb = remoteDel[setId];
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0;
    const localSetAt = toMs(localSet.updatedAt);

    if (tombstoneWinsOverSet(remoteTombAt, localSetAt)) {
      deletes[setId] = Object.assign({ id: setId }, localSet, { name: setDisplayName(localSet) });
      return;
    }

    localInserts[setId] = localSet;
  });

  return { inserts, updates, deletes, localUpdates, localInserts };
}

export function mergeDeletedSetMaps(localDeleted, remoteDeleted) {
  return mergeDeletedTuneMaps(localDeleted, remoteDeleted);
}

export function createSetTombstone(setId, name, deletedAt) {
  return createTombstone(setId, name, deletedAt);
}

function setRecordToStorage(setRecord) {
  const next = Object.assign({}, setRecord);
  delete next.id;
  return next;
}

export function buildMergedPerformanceSets({ localSets, localDeleted, remoteSets, remoteDeleted }) {
  const compared = comparePerformanceSets({
    localSets: localSets,
    localDeleted: localDeleted,
    remoteSets: remoteSets,
    remoteDeleted: remoteDeleted,
  });

  const mergedSets = Object.assign({}, localSets || {});
  Object.keys(compared.deletes).forEach(function(id) {
    delete mergedSets[id];
  });
  Object.values(compared.inserts).forEach(function(setRecord) {
    if (!setRecord || !setRecord.id) return;
    mergedSets[setRecord.id] = Object.assign({ id: setRecord.id }, setRecord);
  });
  Object.values(compared.updates).forEach(function(pair) {
    if (!pair || !pair[1] || !pair[1].id) return;
    mergedSets[pair[1].id] = Object.assign({}, pair[1]);
  });

  let mergedDeleted = mergeDeletedSetMaps(localDeleted, remoteDeleted);
  Object.keys(compared.deletes).forEach(function(id) {
    const localSet = localSets[id];
    if (!mergedDeleted[id]) {
      mergedDeleted[id] = createSetTombstone(
        id,
        setDisplayName(localSet),
        Date.now()
      );
    }
  });
  Object.keys(mergedSets).forEach(function(id) {
    delete mergedDeleted[id];
  });

  const storageSets = {};
  Object.keys(mergedSets).forEach(function(id) {
    storageSets[id] = setRecordToStorage(mergedSets[id]);
  });

  const hadLocalChanges = Object.keys(compared.localInserts).length > 0
    || Object.keys(compared.localUpdates).length > 0;
  const hadRemoteChanges = Object.keys(compared.inserts).length > 0
    || Object.keys(compared.updates).length > 0
    || Object.keys(compared.deletes).length > 0;
  const changed = hadLocalChanges || hadRemoteChanges;

  const added = Object.values(compared.inserts).map(setDisplayName);
  const changedNames = Object.values(compared.updates).map(function(pair) {
    return setDisplayName(pair[1]);
  });
  const deletedNames = Object.values(compared.deletes).map(setDisplayName);

  return {
    compared: compared,
    storageSets: storageSets,
    mergedDeleted: mergedDeleted,
    changed: changed,
    needsUpload: changed,
    added: added,
    changedNames: changedNames,
    deleted: deletedNames,
  };
}

export function localPerformanceSetsDiffer(localSets, mergedStorageSets) {
  const localKeys = Object.keys(localSets || {}).sort();
  const mergedKeys = Object.keys(mergedStorageSets || {}).sort();
  if (localKeys.join(',') !== mergedKeys.join(',')) return true;
  for (let i = 0; i < localKeys.length; i++) {
    const id = localKeys[i];
    if (!setsEqual(
      Object.assign({ id: id }, localSets[id]),
      Object.assign({ id: id }, mergedStorageSets[id])
    )) {
      return true;
    }
  }
  return false;
}
