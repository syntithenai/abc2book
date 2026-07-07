import {
  getDefaultAudioDriveUpload,
  preferenceFromUploadSelection,
  setDefaultAudioDriveUpload,
} from './audioDriveUploadPrefs'

describe('audioDriveUploadPrefs', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  it('defaults to unchecked', function() {
    expect(getDefaultAudioDriveUpload()).toBe(false)
  })

  it('persists the default upload preference', function() {
    setDefaultAudioDriveUpload(true)
    expect(getDefaultAudioDriveUpload()).toBe(true)
    setDefaultAudioDriveUpload(false)
    expect(getDefaultAudioDriveUpload()).toBe(false)
  })

  it('derives preference from a uniform selection', function() {
    expect(preferenceFromUploadSelection([true])).toBe(true)
    expect(preferenceFromUploadSelection([false])).toBe(false)
    expect(preferenceFromUploadSelection([true, true])).toBe(true)
    expect(preferenceFromUploadSelection([false, false])).toBe(false)
  })

  it('keeps the previous default for mixed selections', function() {
    setDefaultAudioDriveUpload(true)
    expect(preferenceFromUploadSelection([true, false])).toBe(true)
    setDefaultAudioDriveUpload(false)
    expect(preferenceFromUploadSelection([true, false])).toBe(false)
  })
})
