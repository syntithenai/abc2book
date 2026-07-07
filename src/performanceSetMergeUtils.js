import { normalizePerformanceSetItems } from './performanceSetStore';

export const PERFORMANCE_SET_FIELD_DEFS = [
  { key: 'name', label: 'Name', defaultImport: true },
  { key: 'date', label: 'Date', defaultImport: true },
  { key: 'notes', label: 'Notes', defaultImport: false },
  { key: 'items', label: 'Playlist tunes', defaultImport: true },
];

const FIELD_DEF_BY_KEY = {};
PERFORMANCE_SET_FIELD_DEFS.forEach(function(def) {
  FIELD_DEF_BY_KEY[def.key] = def;
});

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeSetItems(items) {
  return normalizePerformanceSetItems(Array.isArray(items) ? items : []);
}

export function performanceSetItemsEqual(a, b) {
  return JSON.stringify(normalizeSetItems(a)) === JSON.stringify(normalizeSetItems(b));
}

export function performanceSetFieldValuesEqual(fieldKey, a, b) {
  if (fieldKey === 'items') return performanceSetItemsEqual(a, b);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function performanceSetPairHasDifferingFields(localSet, incomingSet) {
  return buildPerformanceSetFieldRows(localSet, incomingSet).some(function(row) {
    return row.differs;
  });
}

function tuneLabel(tunesById, tuneId) {
  if (!tuneId) return 'Unknown tune';
  const tune = tunesById && tunesById[tuneId];
  if (!tune) return tuneId + ' (missing)';
  return tune.composer ? tune.name + ' — ' + tune.composer : (tune.name || tuneId);
}

export function formatPerformanceSetItemsForDisplay(items, tunesById) {
  const normalized = normalizeSetItems(items);
  if (!normalized.length) return '—';
  return normalized.map(function(item, index) {
    if (!item || !item.tuneId) return String(index + 1) + '. [note]';
    let line = (index + 1) + '. ' + tuneLabel(tunesById, item.tuneId);
    const extras = [];
    if (item.transpose != null && item.transpose !== 0) extras.push('transpose ' + item.transpose);
    if (item.capo != null && item.capo !== 0) extras.push('capo ' + item.capo);
    if (item.viewMode) extras.push(item.viewMode);
    if (extras.length) line += ' (' + extras.join(', ') + ')';
    if (item.note) line += ' — ' + item.note;
    return line;
  }).join('\n');
}

export function formatPerformanceSetFieldValue(fieldKey, value, tunesById) {
  if (fieldKey === 'items') return formatPerformanceSetItemsForDisplay(value, tunesById);
  if (isEmptyValue(value)) return '—';
  return String(value);
}

export function buildPerformanceSetFieldRows(localSet, incomingSet, tunesById) {
  const rows = [];
  PERFORMANCE_SET_FIELD_DEFS.forEach(function(def) {
    const localValue = localSet ? localSet[def.key] : undefined;
    const incomingValue = incomingSet ? incomingSet[def.key] : undefined;
    const incomingPresent = incomingSet && incomingSet.hasOwnProperty(def.key)
      && !isEmptyValue(incomingValue);
    if (!incomingPresent && isEmptyValue(localValue)) return;
    rows.push({
      key: def.key,
      label: def.label,
      defaultImport: def.defaultImport,
      originalValue: localValue,
      importedValue: incomingValue,
      originalDisplay: formatPerformanceSetFieldValue(def.key, localValue, tunesById),
      importedDisplay: formatPerformanceSetFieldValue(def.key, incomingValue, tunesById),
      differs: !performanceSetFieldValuesEqual(def.key, localValue, incomingValue),
    });
  });
  return rows;
}

export function buildDefaultPerformanceSetSelections(rows) {
  const selections = {};
  (rows || []).forEach(function(row) {
    selections[row.key] = row.defaultImport;
  });
  return selections;
}

export function setAllPerformanceSetSelections(rows, selected) {
  const next = {};
  (rows || []).forEach(function(row) {
    next[row.key] = selected;
  });
  return next;
}

export function setRecommendedPerformanceSetSelections(rows) {
  return buildDefaultPerformanceSetSelections(rows);
}

export function applyPerformanceSetSelections(localSet, incomingSet, selections) {
  const merged = cloneValue(localSet || {});
  if (incomingSet && incomingSet.id) merged.id = incomingSet.id;
  if (localSet && localSet.id) merged.id = localSet.id;

  buildPerformanceSetFieldRows(localSet, incomingSet).forEach(function(row) {
    if (selections && selections[row.key] && incomingSet && incomingSet.hasOwnProperty(row.key)) {
      merged[row.key] = cloneValue(incomingSet[row.key]);
    }
  });

  merged.items = normalizeSetItems(merged.items);
  return merged;
}
