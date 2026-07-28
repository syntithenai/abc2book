import {
  hasLegacyLocalIndexes,
  INDEX_STORE_KEYS,
} from './tuneIndexStore'

describe('tuneIndexStore', function() {
  const originalGetItem = Storage.prototype.getItem
  const originalRemoveItem = Storage.prototype.removeItem

  afterEach(function() {
    Storage.prototype.getItem = originalGetItem
    Storage.prototype.removeItem = originalRemoveItem
  })

  test('hasLegacyLocalIndexes detects localStorage keys', function() {
    Storage.prototype.getItem = function(key) {
      if (key === INDEX_STORE_KEYS.books) return '{"Folk":["a"]}'
      return null
    }
    expect(hasLegacyLocalIndexes()).toBe(true)
  })

  test('hasLegacyLocalIndexes is false when empty', function() {
    Storage.prototype.getItem = function() { return null }
    expect(hasLegacyLocalIndexes()).toBe(false)
  })
})
