import {
  STORAGE_FLAG_USE_CATALOG,
  STORAGE_FLAG_USE_SHARDED_SYNC,
  STORAGE_SCHEMA_VERSION_KEY,
  CURRENT_SCHEMA_VERSION,
} from './tuneScaleConstants'

export function isCatalogStorageEnabled() {
  try {
    return localStorage.getItem(STORAGE_FLAG_USE_CATALOG) === 'true'
  } catch (e) {
    return false
  }
}

export function setCatalogStorageEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_FLAG_USE_CATALOG, enabled ? 'true' : 'false')
  } catch (e) {
    // ignore
  }
}

export function isShardedSyncEnabled() {
  try {
    return localStorage.getItem(STORAGE_FLAG_USE_SHARDED_SYNC) === 'true'
  } catch (e) {
    return false
  }
}

export function setShardedSyncEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_FLAG_USE_SHARDED_SYNC, enabled ? 'true' : 'false')
  } catch (e) {
    // ignore
  }
}

export function getSchemaVersion() {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_SCHEMA_VERSION_KEY), 10)
    return Number.isFinite(v) ? v : 1
  } catch (e) {
    return 1
  }
}

export function setSchemaVersion(version) {
  try {
    localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(version || CURRENT_SCHEMA_VERSION))
  } catch (e) {
    // ignore
  }
}
