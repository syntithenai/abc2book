export const MEDIA_CACHE_DRIVE_BACKUP_STORAGE_KEY = 'bookstorage_media_cache_drive_backup'

export const DEFAULT_MEDIA_CACHE_DRIVE_BACKUP_SETTINGS = {
  driveBackupCachedMedia: false,
}

export function loadMediaCacheDriveBackupSettings() {
  try {
    const raw = localStorage.getItem(MEDIA_CACHE_DRIVE_BACKUP_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_MEDIA_CACHE_DRIVE_BACKUP_SETTINGS)
    const parsed = JSON.parse(raw)
    return normalizeMediaCacheDriveBackupSettings(parsed)
  } catch (e) {
    return Object.assign({}, DEFAULT_MEDIA_CACHE_DRIVE_BACKUP_SETTINGS)
  }
}

export function normalizeMediaCacheDriveBackupSettings(settings) {
  return {
    driveBackupCachedMedia: !!(settings && settings.driveBackupCachedMedia),
  }
}

export function saveMediaCacheDriveBackupSettings(settings) {
  const next = normalizeMediaCacheDriveBackupSettings(settings)
  try {
    localStorage.setItem(MEDIA_CACHE_DRIVE_BACKUP_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('mediaCacheDriveBackupSettingsChanged'))
    }
  } catch (e) {}
  return next
}

export function isMediaCacheDriveBackupEnabled() {
  return loadMediaCacheDriveBackupSettings().driveBackupCachedMedia
}
