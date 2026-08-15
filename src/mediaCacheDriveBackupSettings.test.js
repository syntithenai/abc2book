import {
  loadMediaCacheDriveBackupSettings,
  saveMediaCacheDriveBackupSettings,
  DEFAULT_MEDIA_CACHE_DRIVE_BACKUP_SETTINGS,
} from './mediaCacheDriveBackupSettings'

describe('mediaCacheDriveBackupSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('loads defaults when unset', function() {
    expect(loadMediaCacheDriveBackupSettings()).toEqual(DEFAULT_MEDIA_CACHE_DRIVE_BACKUP_SETTINGS)
  })

  test('persists the toggle', function() {
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: true })
    expect(loadMediaCacheDriveBackupSettings()).toEqual({ driveBackupCachedMedia: true })
    saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: false })
    expect(loadMediaCacheDriveBackupSettings()).toEqual({ driveBackupCachedMedia: false })
  })
})
