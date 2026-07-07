function normalizeItems(items) {
  if (!Array.isArray(items)) return []
  return items.map(function(item) {
    if (!item || !item.tuneId) return null
    const next = { tuneId: item.tuneId }
    if (item.prefer && item.prefer !== 'auto') next.prefer = item.prefer
    if (item.linkIndex != null) next.linkIndex = item.linkIndex
    return next
  }).filter(Boolean)
}

export function normalizePlaylistItems(items) {
  return normalizeItems(items)
}

export const PLAYLIST_FIELD_DEFS = [
  { key: 'name', label: 'Name', defaultImport: true },
  { key: 'items', label: 'Tunes', defaultImport: true },
  { key: 'followTune', label: 'Follow tune', defaultImport: true },
  { key: 'loop', label: 'Loop', defaultImport: true },
  { key: 'autoAdvance', label: 'Auto advance', defaultImport: true },
];

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function playlistItemsEqual(a, b) {
  return JSON.stringify(normalizeItems(a)) === JSON.stringify(normalizeItems(b));
}

export function playlistFieldValuesEqual(fieldKey, a, b) {
  if (fieldKey === 'items') return playlistItemsEqual(a, b);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function playlistPairHasDifferingFields(localPlaylist, incomingPlaylist) {
  return buildPlaylistFieldRows(localPlaylist, incomingPlaylist).some(function(row) {
    return row.differs;
  });
}

function tuneLabel(tunesById, tuneId) {
  if (!tuneId) return 'Unknown tune';
  const tune = tunesById && tunesById[tuneId];
  if (!tune) return tuneId + ' (missing)';
  return tune.composer ? tune.name + ' — ' + tune.composer : (tune.name || tuneId);
}

export function formatPlaylistItemsForDisplay(items, tunesById) {
  const normalized = normalizeItems(items);
  if (!normalized.length) return '—';
  return normalized.map(function(item, index) {
    if (!item || !item.tuneId) return String(index + 1) + '. [empty]';
    let line = (index + 1) + '. ' + tuneLabel(tunesById, item.tuneId);
    const extras = [];
    if (item.linkIndex != null) extras.push('link ' + (item.linkIndex + 1));
    if (item.prefer && item.prefer !== 'auto') extras.push(item.prefer);
    if (extras.length) line += ' (' + extras.join(', ') + ')';
    return line;
  }).join('\n');
}

export function formatPlaylistFieldValue(fieldKey, value, tunesById) {
  if (fieldKey === 'items') return formatPlaylistItemsForDisplay(value, tunesById);
  if (fieldKey === 'followTune' || fieldKey === 'loop' || fieldKey === 'autoAdvance') {
    return value ? 'Yes' : 'No';
  }
  if (isEmptyValue(value)) return '—';
  return String(value);
}

export function buildPlaylistFieldRows(localPlaylist, incomingPlaylist, tunesById) {
  const rows = [];
  PLAYLIST_FIELD_DEFS.forEach(function(def) {
    const localValue = localPlaylist ? localPlaylist[def.key] : undefined;
    const incomingValue = incomingPlaylist ? incomingPlaylist[def.key] : undefined;
    const incomingPresent = incomingPlaylist && incomingPlaylist.hasOwnProperty(def.key)
      && !isEmptyValue(incomingValue);
    if (!incomingPresent && isEmptyValue(localValue)) return;
    rows.push({
      key: def.key,
      label: def.label,
      defaultImport: def.defaultImport,
      originalValue: localValue,
      importedValue: incomingValue,
      originalDisplay: formatPlaylistFieldValue(def.key, localValue, tunesById),
      importedDisplay: formatPlaylistFieldValue(def.key, incomingValue, tunesById),
      differs: !playlistFieldValuesEqual(def.key, localValue, incomingValue),
    });
  });
  return rows;
}

export function buildDefaultPlaylistSelections(rows) {
  const selections = {};
  (rows || []).forEach(function(row) {
    selections[row.key] = row.defaultImport;
  });
  return selections;
}

export function setAllPlaylistSelections(rows, selected) {
  const next = {};
  (rows || []).forEach(function(row) {
    next[row.key] = selected;
  });
  return next;
}

export function setRecommendedPlaylistSelections(rows) {
  return buildDefaultPlaylistSelections(rows);
}

export function applyPlaylistSelections(localPlaylist, incomingPlaylist, selections) {
  const merged = cloneValue(localPlaylist || {});
  if (incomingPlaylist && incomingPlaylist.id) merged.id = incomingPlaylist.id;
  if (localPlaylist && localPlaylist.id) merged.id = localPlaylist.id;

  buildPlaylistFieldRows(localPlaylist, incomingPlaylist).forEach(function(row) {
    if (selections && selections[row.key] && incomingPlaylist && incomingPlaylist.hasOwnProperty(row.key)) {
      merged[row.key] = cloneValue(incomingPlaylist[row.key]);
    }
  });

  merged.items = normalizeItems(merged.items);
  return merged;
}
