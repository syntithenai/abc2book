import {
  getBulkImportEnhanceEnabled,
  setBulkImportEnhanceEnabled,
} from './bulkImportEnhanceSettings'

const STORAGE_KEY = 'addSongModal_bulkEnhance'

describe('bulkImportEnhanceSettings', function() {
  beforeEach(function() {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('defaults to off when unset', function() {
    expect(getBulkImportEnhanceEnabled()).toBe(false)
  })

  it('remembers enabled and disabled choices', function() {
    setBulkImportEnhanceEnabled(true)
    expect(getBulkImportEnhanceEnabled()).toBe(true)
    setBulkImportEnhanceEnabled(false)
    expect(getBulkImportEnhanceEnabled()).toBe(false)
  })

  it('migrates legacy session storage value once', function() {
    sessionStorage.setItem(STORAGE_KEY, '1')
    expect(getBulkImportEnhanceEnabled()).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1')
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
