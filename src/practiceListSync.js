import {
  createTombstone,
  mergeDeletedTuneMaps,
} from './tuneBookSync';
import { practiceListPairHasDifferingFields, normalizePracticeListTuneIds } from './practiceListMergeUtils';

export const PRACTICE_LISTS_BEGIN = '% abcbook-practice-lists-begin';
export const PRACTICE_LISTS_END = '% abcbook-practice-lists-end';
export const PRACTICE_LIST_HEADER_PREFIX = '% abcbook-practice-list ';
export const DELETED_PRACTICE_LIST_PREFIX = '% abcbook-deleted-practice-list ';
export const PRACTICE_LIST_JSON_PREFIX = '% abcbook-practice-list-json ';
const PRACTICE_LIST_JSON_CHUNK_SIZE = 180;

const PRACTICE_LIST_LINE_PREFIXES = [
  PRACTICE_LISTS_BEGIN,
  PRACTICE_LISTS_END,
  PRACTICE_LIST_HEADER_PREFIX,
  DELETED_PRACTICE_LIST_PREFIX,
  PRACTICE_LIST_JSON_PREFIX,
];

function toMs(ts) {
  return parseInt(ts, 10) || 0;
}

function tombstoneWinsOverList(tombAt, listAt) {
  return tombAt > 0 && tombAt >= listAt;
}

function listDisplayName(listRecord) {
  if (!listRecord) return 'Practice list';
  return listRecord.name || 'Practice list';
}

function normalizeListBody(listRecord) {
  if (!listRecord) return null;
  return {
    name: listRecord.name || '',
    tuneIds: normalizePracticeListTuneIds(listRecord.tuneIds),
    updatedAt: toMs(listRecord.updatedAt),
  };
}

function listsEqual(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(normalizeListBody(a)) === JSON.stringify(normalizeListBody(b));
}

function renderListJsonChunks(listId, body) {
  const json = JSON.stringify(body);
  const chunks = [];
  for (let i = 0; i < json.length; i += PRACTICE_LIST_JSON_CHUNK_SIZE) {
    chunks.push(json.slice(i, i + PRACTICE_LIST_JSON_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('{}');
  return chunks.map(function(chunk, idx) {
    return PRACTICE_LIST_JSON_PREFIX + listId + ' ' + (idx + 1) + '/' + chunks.length + ' ' + chunk;
  });
}

export function renderDeletedPracticeListsToAbc(deletedPracticeListsMap) {
  if (!deletedPracticeListsMap) return '';
  return Object.values(deletedPracticeListsMap).map(function(t) {
    const namePart = t.name ? ' ' + t.name : '';
    return DELETED_PRACTICE_LIST_PREFIX + t.id + ' ' + t.deletedAt + namePart;
  }).join('\n');
}

export function parseDeletedPracticeListsFromAbc(abcText) {
  const deleted = {};
  if (!abcText || !abcText.split) return deleted;
  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DELETED_PRACTICE_LIST_PREFIX)) return;
    const rest = trimmed.slice(DELETED_PRACTICE_LIST_PREFIX.length);
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

function parsePracticeListJsonLine(line) {
  if (!line || !line.startsWith(PRACTICE_LIST_JSON_PREFIX)) return null;
  const rest = line.slice(PRACTICE_LIST_JSON_PREFIX.length);
  const firstSpace = rest.indexOf(' ');
  if (firstSpace < 0) return null;
  const listId = rest.slice(0, firstSpace);
  const chunkPart = rest.slice(firstSpace + 1);
  const match = chunkPart.match(/^(\d+)\/(\d+)\s+(.*)$/);
  if (!match) return null;
  return {
    listId: listId,
    index: parseInt(match[1], 10) - 1,
    total: parseInt(match[2], 10),
    data: match[3],
  };
}

function applyPracticeListJsonChunks(chunksByListId) {
  const result = {};
  Object.keys(chunksByListId || {}).forEach(function(listId) {
    const parts = chunksByListId[listId];
    if (!Array.isArray(parts) || parts.length === 0) return;
    const sorted = parts.slice().sort(function(a, b) {
      return a.index - b.index;
    });
    const json = sorted.map(function(part) { return part.data; }).join('');
    try {
      result[listId] = JSON.parse(json);
    } catch (e) {
      // Skip corrupt payloads.
    }
  });
  return result;
}

export function parsePracticeListsFromAbc(abcText) {
  const practiceLists = {};
  const deleted = parseDeletedPracticeListsFromAbc(abcText);
  if (!abcText || !abcText.split) {
    return { practiceLists: practiceLists, deleted: deleted };
  }

  let inSection = false;
  const listUpdatedAt = {};
  const jsonChunks = {};

  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim();
    if (trimmed === PRACTICE_LISTS_BEGIN) {
      inSection = true;
      return;
    }
    if (trimmed === PRACTICE_LISTS_END) {
      inSection = false;
      return;
    }
    if (!inSection) return;

    if (trimmed.startsWith(PRACTICE_LIST_HEADER_PREFIX)) {
      const rest = trimmed.slice(PRACTICE_LIST_HEADER_PREFIX.length).trim();
      const space = rest.indexOf(' ');
      if (space === -1) return;
      const listId = rest.slice(0, space);
      listUpdatedAt[listId] = toMs(rest.slice(space + 1).trim());
      return;
    }

    const jsonChunk = parsePracticeListJsonLine(trimmed);
    if (jsonChunk) {
      if (!jsonChunks[jsonChunk.listId]) jsonChunks[jsonChunk.listId] = [];
      jsonChunks[jsonChunk.listId].push(jsonChunk);
    }
  });

  const bodies = applyPracticeListJsonChunks(jsonChunks);
  Object.keys(bodies).forEach(function(listId) {
    const body = bodies[listId];
    if (!body || typeof body !== 'object') return;
    practiceLists[listId] = Object.assign({}, body, {
      id: listId,
      updatedAt: toMs(body.updatedAt) || listUpdatedAt[listId] || Date.now(),
    });
  });

  return { practiceLists: practiceLists, deleted: deleted };
}

export function renderPracticeListsToAbc(practiceListsMap, deletedPracticeListsMap) {
  const listIds = Object.keys(practiceListsMap || {}).sort();
  const tombstones = renderDeletedPracticeListsToAbc(deletedPracticeListsMap);
  if (listIds.length === 0 && !tombstones) return '';

  const lines = [PRACTICE_LISTS_BEGIN];
  listIds.forEach(function(listId) {
    const listRecord = practiceListsMap[listId];
    if (!listRecord) return;
    const body = normalizeListBody(listRecord);
    const updatedAt = body.updatedAt || Date.now();
    lines.push(PRACTICE_LIST_HEADER_PREFIX + listId + ' ' + updatedAt);
    lines.push.apply(lines, renderListJsonChunks(listId, body));
  });
  if (tombstones) {
    lines.push(tombstones);
  }
  lines.push(PRACTICE_LISTS_END);
  return lines.join('\n');
}

export function stripPracticeListLines(abcText) {
  if (!abcText || !abcText.split) return abcText || '';
  return abcText.split('\n').filter(function(line) {
    const trimmed = line.trim();
    return !PRACTICE_LIST_LINE_PREFIXES.some(function(prefix) {
      return trimmed.startsWith(prefix) || trimmed === prefix;
    });
  }).join('\n');
}

export function comparePracticeLists({ localPracticeLists, localDeleted, remotePracticeLists, remoteDeleted }) {
  const inserts = {};
  const updates = {};
  const deletes = {};
  const localUpdates = {};
  const localInserts = {};

  const localDel = localDeleted || {};
  const remoteDel = remoteDeleted || {};
  const remoteActiveIds = {};

  Object.values(remotePracticeLists || {}).forEach(function(remoteList) {
    if (!remoteList || !remoteList.id) return;
    const id = remoteList.id;
    remoteActiveIds[id] = true;

    const localList = localPracticeLists[id];
    const localTomb = localDel[id];
    const remoteTomb = remoteDel[id];
    const remoteAt = toMs(remoteList.updatedAt);
    const localAt = localList ? toMs(localList.updatedAt) : 0;
    const localTombAt = localTomb ? toMs(localTomb.deletedAt) : 0;
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0;

    if (tombstoneWinsOverList(remoteTombAt, localAt)) {
      if (localList) {
        deletes[id] = Object.assign({ id: id }, localList, { name: listDisplayName(localList) });
      }
      return;
    }

    if (tombstoneWinsOverList(localTombAt, remoteAt)) {
      return;
    }

    if (localList) {
      const hasFieldDiff = practiceListPairHasDifferingFields(localList, remoteList);
      if (remoteAt > localAt) {
        if (hasFieldDiff) updates[id] = [localList, remoteList];
      } else if (remoteAt < localAt) {
        if (hasFieldDiff) localUpdates[id] = [remoteList, localList];
      }
    } else {
      inserts[id] = remoteList;
    }
  });

  Object.keys(localPracticeLists || {}).forEach(function(listId) {
    if (remoteActiveIds[listId]) return;

    const localList = localPracticeLists[listId];
    const remoteTomb = remoteDel[listId];
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0;
    const localAt = toMs(localList.updatedAt);

    if (tombstoneWinsOverList(remoteTombAt, localAt)) {
      deletes[listId] = Object.assign({ id: listId }, localList, { name: listDisplayName(localList) });
      return;
    }

    localInserts[listId] = localList;
  });

  return { inserts, updates, deletes, localUpdates, localInserts };
}

export function mergeDeletedPracticeListMaps(localDeleted, remoteDeleted) {
  return mergeDeletedTuneMaps(localDeleted, remoteDeleted);
}

export function createPracticeListTombstone(listId, name, deletedAt) {
  return createTombstone(listId, name, deletedAt);
}

function listRecordToStorage(listRecord) {
  const next = Object.assign({}, listRecord);
  delete next.id;
  return next;
}

export function buildMergedPracticeLists({ localPracticeLists, localDeleted, remotePracticeLists, remoteDeleted }) {
  const compared = comparePracticeLists({
    localPracticeLists: localPracticeLists,
    localDeleted: localDeleted,
    remotePracticeLists: remotePracticeLists,
    remoteDeleted: remoteDeleted,
  });

  const mergedPracticeLists = Object.assign({}, localPracticeLists || {});
  Object.keys(compared.deletes).forEach(function(id) {
    delete mergedPracticeLists[id];
  });
  Object.values(compared.inserts).forEach(function(listRecord) {
    if (!listRecord || !listRecord.id) return;
    mergedPracticeLists[listRecord.id] = Object.assign({ id: listRecord.id }, listRecord);
  });
  Object.values(compared.updates).forEach(function(pair) {
    if (!pair || !pair[1] || !pair[1].id) return;
    mergedPracticeLists[pair[1].id] = Object.assign({}, pair[1]);
  });

  let mergedDeleted = mergeDeletedPracticeListMaps(localDeleted, remoteDeleted);
  Object.keys(compared.deletes).forEach(function(id) {
    const localList = localPracticeLists[id];
    if (!mergedDeleted[id]) {
      mergedDeleted[id] = createPracticeListTombstone(
        id,
        listDisplayName(localList),
        Date.now()
      );
    }
  });
  Object.keys(mergedPracticeLists).forEach(function(id) {
    delete mergedDeleted[id];
  });

  const storagePracticeLists = {};
  Object.keys(mergedPracticeLists).forEach(function(id) {
    storagePracticeLists[id] = listRecordToStorage(mergedPracticeLists[id]);
  });

  const hadLocalChanges = Object.keys(compared.localInserts).length > 0
    || Object.keys(compared.localUpdates).length > 0;
  const hadRemoteChanges = Object.keys(compared.inserts).length > 0
    || Object.keys(compared.updates).length > 0
    || Object.keys(compared.deletes).length > 0;
  const changed = hadLocalChanges || hadRemoteChanges;

  const added = Object.values(compared.inserts).map(listDisplayName);
  const changedNames = Object.values(compared.updates).map(function(pair) {
    return listDisplayName(pair[1]);
  });
  const deletedNames = Object.values(compared.deletes).map(listDisplayName);

  return {
    compared: compared,
    storagePracticeLists: storagePracticeLists,
    mergedDeleted: mergedDeleted,
    changed: changed,
    needsUpload: changed,
    added: added,
    changedNames: changedNames,
    deleted: deletedNames,
  };
}

export function localPracticeListsDiffer(localPracticeLists, mergedStoragePracticeLists) {
  const localKeys = Object.keys(localPracticeLists || {}).sort();
  const mergedKeys = Object.keys(mergedStoragePracticeLists || {}).sort();
  if (localKeys.join(',') !== mergedKeys.join(',')) return true;
  for (let i = 0; i < localKeys.length; i++) {
    const id = localKeys[i];
    if (!listsEqual(
      Object.assign({ id: id }, localPracticeLists[id]),
      Object.assign({ id: id }, mergedStoragePracticeLists[id])
    )) {
      return true;
    }
  }
  return false;
}
