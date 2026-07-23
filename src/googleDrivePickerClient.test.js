import {
  normalizeDriveFileId,
  tokenHasDriveAccess,
  GOOGLE_DRIVE_FILE_SCOPE,
} from './googleDrivePickerClient'

describe('normalizeDriveFileId', function() {
  test('returns plain file id strings', function() {
    expect(normalizeDriveFileId('abc123XYZ-_abc123XYZ')).toBe('abc123XYZ-_abc123XYZ')
  })

  test('extracts id from objects', function() {
    expect(normalizeDriveFileId({ id: 'file123456789012345678' })).toBe('file123456789012345678')
  })

  test('rejects error objects from failed createDocument', function() {
    expect(normalizeDriveFileId({ error: 'forbidden' })).toBe('')
  })
})

describe('tokenHasDriveAccess', function() {
  test('detects drive.file scope', function() {
    expect(tokenHasDriveAccess({
      scope: 'openid email ' + GOOGLE_DRIVE_FILE_SCOPE,
    })).toBe(true)
  })

  test('returns false for identity-only scope', function() {
    expect(tokenHasDriveAccess({ scope: 'openid email profile' })).toBe(false)
  })
})
