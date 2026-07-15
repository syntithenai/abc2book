import { createSetTombstone } from './performanceSetSync';

const STORAGE_KEY = 'bookstorage_performance_sets';
const DELETED_STORAGE_KEY = 'bookstorage_deleted_performance_sets';

const changeListeners = [];
let onSetsChangedHandler = null;

export function setPerformanceSetsChangeHandler(handler) {
  onSetsChangedHandler = typeof handler === 'function' ? handler : null;
}

export function subscribePerformanceSets(listener) {
  if (typeof listener !== 'function') return function() {};
  changeListeners.push(listener);
  return function() {
    const idx = changeListeners.indexOf(listener);
    if (idx !== -1) changeListeners.splice(idx, 1);
  };
}

export function notifyPerformanceSetsChanged() {
  changeListeners.forEach(function(listener) {
    try { listener(); } catch (e) { /* ignore */ }
  });
  if (typeof onSetsChangedHandler === 'function') {
    try { onSetsChangedHandler(); } catch (e) { /* ignore */ }
  }
}

export function readPerformanceSetsMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writePerformanceSetsMap(sets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets || {}));
}

export function readDeletedPerformanceSets() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeDeletedPerformanceSets(deletedSets) {
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(deletedSets || {}));
}

function readSets() {
  return readPerformanceSetsMap();
}

function writeSets(sets) {
  writePerformanceSetsMap(sets);
}

export function listPerformanceSets() {
  const sets = readSets();
  return Object.keys(sets).map(function(id) {
    return normalizePerformanceSetRecord(sets[id], id);
  }).sort(function(a, b) {
    const ad = a.date || '';
    const bd = b.date || '';
    if (ad && bd && ad !== bd) return ad < bd ? 1 : -1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export function normalizePerformanceSetItems(items) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  let pendingBeforeTune = '';

  items.forEach(function(item) {
    if (!item || typeof item !== 'object') return;

    if (item.type === 'note') {
      const text = String(item.text || '').trim();
      if (!text) return;
      if (normalized.length > 0) {
        const last = normalized[normalized.length - 1];
        last.note = last.note ? last.note + ' · ' + text : text;
      } else {
        pendingBeforeTune = pendingBeforeTune ? pendingBeforeTune + ' · ' + text : text;
      }
      return;
    }

    if (!item.tuneId) return;

    const entry = { type: 'tune', tuneId: item.tuneId };
    if (item.transpose != null) entry.transpose = item.transpose;
    if (item.capo != null) entry.capo = item.capo;
    if (item.viewMode) entry.viewMode = item.viewMode;

    const parts = [];
    if (pendingBeforeTune) {
      parts.push(pendingBeforeTune);
      pendingBeforeTune = '';
    }
    const itemNote = String(item.note || '').trim();
    if (itemNote) parts.push(itemNote);
    if (parts.length > 0) entry.note = parts.join(' · ');

    normalized.push(entry);
  });

  if (pendingBeforeTune && normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    last.note = last.note ? last.note + ' · ' + pendingBeforeTune : pendingBeforeTune;
  }

  return normalized;
}

function normalizePerformanceSetRecord(set, setId) {
  const next = Object.assign({}, set);
  if (setId) next.id = setId;
  next.items = normalizePerformanceSetItems(next.items);
  return next;
}

export function getPerformanceSet(setId) {
  const sets = readSets();
  if (!sets[setId]) return null;
  return normalizePerformanceSetRecord(sets[setId], setId);
}

export function savePerformanceSet(set) {
  const sets = readSets();
  const id = set.id || ('set-' + Date.now());
  const normalized = normalizePerformanceSetRecord(set);
  const next = Object.assign({}, normalized, { updatedAt: Date.now() });
  delete next.id;
  sets[id] = next;

  const deleted = readDeletedPerformanceSets();
  if (deleted[id]) {
    delete deleted[id];
    writeDeletedPerformanceSets(deleted);
  }

  writeSets(sets);
  notifyPerformanceSetsChanged();
  return Object.assign({ id: id }, next);
}

export function appendTunesToPerformanceSet(setId, tuneIds) {
  const ids = Array.isArray(tuneIds) ? tuneIds.filter(Boolean) : [];
  if (!setId || !ids.length) return null;
  const existing = getPerformanceSet(setId);
  if (!existing) return null;
  const nextItems = (existing.items || []).concat(ids.map(function(tuneId) {
    return { type: 'tune', tuneId: tuneId };
  }));
  return savePerformanceSet(Object.assign({}, existing, { items: nextItems }));
}

export function deletePerformanceSet(setId) {
  const sets = readSets();
  const existing = sets[setId];
  delete sets[setId];
  writeSets(sets);

  const deleted = readDeletedPerformanceSets();
  deleted[setId] = createSetTombstone(
    setId,
    existing && existing.name ? existing.name : undefined,
    Date.now()
  );
  writeDeletedPerformanceSets(deleted);
  notifyPerformanceSetsChanged();
}

export function duplicatePerformanceSet(setId) {
  const existing = getPerformanceSet(setId);
  if (!existing) return null;
  const copy = Object.assign({}, existing, {
    id: undefined,
    name: (existing.name || 'Set') + ' copy',
    date: new Date().toISOString().slice(0, 10),
  });
  return savePerformanceSet(copy);
}

export function exportPerformanceSetText(set, tunes) {
  if (!set || !Array.isArray(set.items)) return '';
  const items = normalizePerformanceSetItems(set.items);
  const lines = [(set.name || 'Set'), set.date ? 'Date: ' + set.date : '', set.notes || ''];
  items.forEach(function(item, index) {
    const tune = tunes && item.tuneId ? tunes[item.tuneId] : null;
    if (tune && tune.name) {
      let label = tune.composer ? tune.name + ' — ' + tune.composer : tune.name;
      if (item.note) label += ' [' + item.note + ']';
      lines.push((index + 1) + '. ' + label);
    } else if (item.tuneId) {
      let label = item.tuneId + ' (tune not found)';
      if (item.note) label += ' [' + item.note + ']';
      lines.push((index + 1) + '. ' + label);
    }
  });
  return lines.filter(Boolean).join('\n');
}

export function exportAllPerformanceSetsText(sets, tunes) {
  const list = Array.isArray(sets) ? sets : listPerformanceSets();
  if (!list.length) return '';
  return list.map(function(set) {
    return exportPerformanceSetText(set, tunes);
  }).join('\n\n');
}

export function buildSetPlaylistFromSet(set, tunes) {
  if (!set || !Array.isArray(set.items)) return { tunes: [], items: [], currentIndex: 0 };
  const playlistTunes = [];
  const items = [];
  normalizePerformanceSetItems(set.items).forEach(function(item) {
    const tune = tunes && item.tuneId ? tunes[item.tuneId] : null;
    if (tune) {
      playlistTunes.push(tune);
      items.push(Object.assign({}, item, { tune: tune }));
    }
  });
  return {
    setId: set.id,
    name: set.name,
    items: items,
    tunes: playlistTunes,
    currentIndex: 0,
  };
}
