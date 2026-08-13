const DISMISSALS_KEY = 'bookstorage_duplicate_dismissals';

export function duplicatePairKey(tuneIdA, tuneIdB) {
  const a = String(tuneIdA || '');
  const b = String(tuneIdB || '');
  if (!a || !b || a === b) return '';
  return a < b ? a + '|' + b : b + '|' + a;
}

export function readDuplicateDismissals() {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeDuplicateDismissals(dismissals) {
  try {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(dismissals || {}));
  } catch (e) {}
}

export function getDuplicateDismissal(tuneIdA, tuneIdB) {
  const key = duplicatePairKey(tuneIdA, tuneIdB);
  if (!key) return null;
  const all = readDuplicateDismissals();
  return all[key] || null;
}

/**
 * Normalize fingerprints so hashA/hashB always follow sorted tune-id order.
 * @param {string} tuneIdA
 * @param {string} tuneIdB
 * @param {{ hashA?: string, hashB?: string }} fingerprints
 */
function fingerprintsInKeyOrder(tuneIdA, tuneIdB, fingerprints) {
  const fp = fingerprints || {};
  const a = String(tuneIdA || '');
  const b = String(tuneIdB || '');
  const hashForA = fp.hashA || '';
  const hashForB = fp.hashB || '';
  if (a && b && a > b) {
    return { hashA: hashForB, hashB: hashForA };
  }
  return { hashA: hashForA, hashB: hashForB };
}

/**
 * @param {string} tuneIdA
 * @param {string} tuneIdB
 * @param {{ hashA?: string, hashB?: string }} fingerprints
 *   hashA/hashB are for tuneIdA/tuneIdB respectively (any call order).
 */
export function recordDuplicateDismissal(tuneIdA, tuneIdB, fingerprints) {
  const key = duplicatePairKey(tuneIdA, tuneIdB);
  if (!key) return;
  const ordered = fingerprintsInKeyOrder(tuneIdA, tuneIdB, fingerprints);
  const all = readDuplicateDismissals();
  all[key] = {
    hashA: ordered.hashA || '',
    hashB: ordered.hashB || '',
    dismissedAt: Date.now(),
  };
  writeDuplicateDismissals(all);
}

export function clearDuplicateDismissal(tuneIdA, tuneIdB) {
  const key = duplicatePairKey(tuneIdA, tuneIdB);
  if (!key) return;
  const all = readDuplicateDismissals();
  if (!all[key]) return;
  delete all[key];
  writeDuplicateDismissals(all);
}

/**
 * Clear all dismissals involving any of the given tune ids (e.g. after merge).
 */
export function clearDuplicateDismissalsForTuneIds(tuneIds) {
  const ids = {};
  (Array.isArray(tuneIds) ? tuneIds : []).forEach(function(id) {
    if (id) ids[String(id)] = true;
  });
  if (Object.keys(ids).length === 0) return;
  const all = readDuplicateDismissals();
  let changed = false;
  Object.keys(all).forEach(function(key) {
    const parts = key.split('|');
    if (parts.some(function(part) { return ids[part]; })) {
      delete all[key];
      changed = true;
    }
  });
  if (changed) writeDuplicateDismissals(all);
}

/**
 * True when pair was dismissed and content has not clearly changed since.
 *
 * Incomplete fingerprints (empty stored or current hashes) keep the pair
 * dismissed — recomputed hashes from unhydrated tune bodies must not
 * accidentally re-surface a Keep separate decision after refresh.
 *
 * hashA/hashB are for tuneIdA/tuneIdB respectively. Stored fingerprints are
 * written in sorted-id order going forward; matchReverse covers older records.
 */
export function isDuplicatePairDismissed(tuneIdA, tuneIdB, hashA, hashB) {
  const dismissed = getDuplicateDismissal(tuneIdA, tuneIdB);
  if (!dismissed) return false;
  const storedA = dismissed.hashA || '';
  const storedB = dismissed.hashB || '';
  const currentA = String(hashA || '');
  const currentB = String(hashB || '');

  // Ambiguous fingerprints: trust the dismissal by pair id
  if (!storedA || !storedB || !currentA || !currentB) return true;

  const matchForward = storedA === currentA && storedB === currentB;
  const matchReverse = storedA === currentB && storedB === currentA;
  return matchForward || matchReverse;
}

/**
 * Dismiss every pair within a group of tune ids.
 */
export function dismissDuplicateGroup(tuneIds, getTuneImportHash, tunes) {
  const ids = (Array.isArray(tuneIds) ? tuneIds : []).filter(Boolean);
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const idA = ids[i];
      const idB = ids[j];
      const tuneA = tunes && tunes[idA] ? tunes[idA] : null;
      const tuneB = tunes && tunes[idB] ? tunes[idB] : null;
      recordDuplicateDismissal(idA, idB, {
        hashA: typeof getTuneImportHash === 'function' && tuneA ? getTuneImportHash(tuneA) : '',
        hashB: typeof getTuneImportHash === 'function' && tuneB ? getTuneImportHash(tuneB) : '',
      });
    }
  }
}
