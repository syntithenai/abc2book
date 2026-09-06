import { toTuneUpdatedMs } from './tuneBookSync';

const BASELINE_KEY = 'bookstorage_source_sync_baselines';

export function readSourceSyncBaselines() {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeSourceSyncBaselines(baselines) {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(baselines || {}));
  } catch (e) {}
}

export function getSourceSyncBaseline(sourceKey, tuneId) {
  const key = String(sourceKey || '');
  const id = String(tuneId || '');
  if (!key || !id) return null;
  const all = readSourceSyncBaselines();
  return all[key] && all[key][id] ? all[key][id] : null;
}

export function recordSourceSyncBaseline(sourceKey, tuneId, localTune, incomingTune) {
  const key = String(sourceKey || '');
  const id = String(tuneId || '');
  if (!key || !id) return;
  const all = readSourceSyncBaselines();
  if (!all[key]) all[key] = {};
  all[key][id] = {
    appliedAt: localTune ? toTuneUpdatedMs(localTune.lastUpdated) : 0,
    incomingAt: incomingTune ? toTuneUpdatedMs(incomingTune.lastUpdated) : 0,
    recordedAt: Date.now(),
  };
  writeSourceSyncBaselines(all);
}

/** First-seen legacy tune: mark current local copy as last-known source state. */
export function seedSourceSyncBaseline(sourceKey, tuneId, localTune) {
  const key = String(sourceKey || '');
  const id = String(tuneId || '');
  if (!key || !id || !localTune) return;
  if (getSourceSyncBaseline(key, id)) return;
  recordSourceSyncBaseline(key, id, localTune, localTune);
}

export function hasLocalEditSinceSourceApply(localTune, baseline) {
  if (!localTune || !baseline) return false;
  return toTuneUpdatedMs(localTune.lastUpdated) > toTuneUpdatedMs(baseline.appliedAt);
}

/** Drop all baselines for a source (e.g. source removed). */
export function clearSourceSyncBaselinesForSource(sourceKey) {
  const key = String(sourceKey || '');
  if (!key) return;
  const all = readSourceSyncBaselines();
  if (!all[key]) return;
  delete all[key];
  writeSourceSyncBaselines(all);
}
