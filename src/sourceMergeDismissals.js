import { toTuneUpdatedMs } from './tuneBookSync';

const DISMISSALS_KEY = 'bookstorage_source_merge_dismissals';

export function readSourceMergeDismissals() {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeSourceMergeDismissals(dismissals) {
  try {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(dismissals || {}));
  } catch (e) {}
}

export function getSourceMergeDismissal(sourceKey, tuneId) {
  const key = String(sourceKey || '');
  const id = String(tuneId || '');
  if (!key || !id) return null;
  const all = readSourceMergeDismissals();
  return all[key] && all[key][id] ? all[key][id] : null;
}

export function recordSourceMergeDismissal(sourceKey, tuneId, incomingTune, getTuneImportHash) {
  const key = String(sourceKey || '');
  const id = String(tuneId || '');
  if (!key || !id || !incomingTune) return;
  const all = readSourceMergeDismissals();
  if (!all[key]) all[key] = {};
  all[key][id] = {
    incomingUpdatedAt: toTuneUpdatedMs(incomingTune.lastUpdated),
    incomingHash: typeof getTuneImportHash === 'function' ? getTuneImportHash(incomingTune) : undefined,
    dismissedAt: Date.now(),
  };
  writeSourceMergeDismissals(all);
}

export function clearSourceMergeDismissal(sourceKey, tuneId) {
  const key = String(sourceKey || '');
  const id = String(tuneId || '');
  if (!key || !id) return;
  const all = readSourceMergeDismissals();
  if (!all[key] || !all[key][id]) return;
  delete all[key][id];
  if (Object.keys(all[key]).length === 0) delete all[key];
  writeSourceMergeDismissals(all);
}

export function isSourceMergeDismissed(sourceKey, tuneId, incomingTune, getTuneImportHash) {
  const dismissed = getSourceMergeDismissal(sourceKey, tuneId);
  if (!dismissed || !incomingTune) return false;
  const incomingAt = toTuneUpdatedMs(incomingTune.lastUpdated);
  if (incomingAt > dismissed.incomingUpdatedAt) return false;
  if (dismissed.incomingHash && typeof getTuneImportHash === 'function') {
    return getTuneImportHash(incomingTune) === dismissed.incomingHash;
  }
  return incomingAt <= dismissed.incomingUpdatedAt;
}

export function applyMergeDismissalState(sourceKey, batch, recordState, getTuneImportHash) {
  if (!sourceKey || !batch) return;
  // Accept and reject both mark this incoming version handled. Clearing on
  // accept let a stale in-flight Drive compare re-toast the same tune as soon
  // as "Apply selected" ran. recordState is kept for call-site compatibility.
  (batch.records || []).forEach(function(record) {
    if (!record) return;
    const tuneForDismissal = record.incomingTune || record.localTune;
    if (!tuneForDismissal) return;
    recordSourceMergeDismissal(sourceKey, record.id, tuneForDismissal, getTuneImportHash);
  });
}

export function dismissEntireMergeBatch(sourceKey, batch, getTuneImportHash) {
  if (!sourceKey || !batch) return;
  (batch.records || []).forEach(function(record) {
    if (!record || !record.incomingTune) return;
    recordSourceMergeDismissal(sourceKey, record.id, record.incomingTune, getTuneImportHash);
  });
}
