const PREFS_KEY = 'bookstorage_source_merge_prefs';

export function readIncomingMergePrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeIncomingMergePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs || {}));
  } catch (e) {}
}

export function getSourceMergePref(sourceKey) {
  const prefs = readIncomingMergePrefs();
  return prefs[sourceKey] || null;
}

export function setSourceMergePref(sourceKey, value) {
  const prefs = readIncomingMergePrefs();
  if (!value) {
    delete prefs[sourceKey];
  } else {
    prefs[sourceKey] = value;
  }
  writeIncomingMergePrefs(prefs);
}

export const DRIVE_TUNEBOOK_SOURCE_KEY = 'google-drive-tunebook';
export const PERFORMANCE_SETS_DRIVE_SOURCE_KEY = 'google-drive-performance-sets';
export const PLAYLISTS_DRIVE_SOURCE_KEY = 'google-drive-playlists';

export function normalizeSourceUrlKey(url) {
  return String(url || '').trim().toLowerCase().replace(/\/+$/, '');
}
