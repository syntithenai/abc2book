import {
  BULK_EDIT_FIELDS,
  coerceBulkFieldValue,
  isBulkChangeRowComplete,
  prepareBulkActions,
  prepareBulkChanges,
} from './bulkEditFields'

describe('bulkEditFields', function() {
  test('includes transpose with correct key', function() {
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'transpose' })).toBe(true)
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'tranpose' })).toBe(false)
  })

  test('includes genres field', function() {
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'genres' })).toBe(true)
  })

  test('coerces numeric fields', function() {
    expect(coerceBulkFieldValue('capo', '3')).toBe('3')
    expect(coerceBulkFieldValue('capo', '')).toBe(0)
    expect(coerceBulkFieldValue('boost', '21')).toBe('20')
    expect(coerceBulkFieldValue('difficulty', '-2')).toBe('0')
  })

  test('normalizes key field values', function() {
    expect(coerceBulkFieldValue('key', 'a mix')).toBe('Amixolydian')
    expect(coerceBulkFieldValue('key', 'Am')).toBe('Am')
    expect(coerceBulkFieldValue('key', 'custom-key')).toBe('custom-key')
    expect(coerceBulkFieldValue('key', '')).toBe('')
  })

  test('validates complete rows', function() {
    expect(isBulkChangeRowComplete({ field: 'key', value: 'D' })).toBe(true)
    expect(isBulkChangeRowComplete({ field: 'key', value: '' })).toBe(true)
    expect(isBulkChangeRowComplete({ field: 'boost', value: '' })).toBe(true)
    expect(isBulkChangeRowComplete({ field: 'boost', value: '5' })).toBe(true)
    expect(isBulkChangeRowComplete({ field: '', value: 'D' })).toBe(false)
  })

  test('prepareBulkChanges dedupes by field and keeps last value', function() {
    var changes = prepareBulkChanges([
      { field: 'key', value: 'D' },
      { field: 'capo', value: '2' },
      { field: 'key', value: 'G' },
      { field: '', value: 'ignored' },
    ])

    expect(changes).toEqual([
      { key: 'key', value: 'G' },
      { key: 'capo', value: '2' },
    ])
  })

  test('cache is an action field and cache lock is a tune field', function() {
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'cache' && field.action })).toBe(true)
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'mediaCacheLocked' })).toBe(true)
    expect(isBulkChangeRowComplete({ field: 'cache', value: 'save' })).toBe(true)
    expect(isBulkChangeRowComplete({ field: 'mediaCacheLocked', value: 'true' })).toBe(true)
    expect(coerceBulkFieldValue('mediaCacheLocked', 'false')).toBe(false)

    var prepared = prepareBulkChanges([
      { field: 'cache', value: 'save' },
      { field: 'mediaCacheLocked', value: 'true' },
      { field: 'key', value: 'D' },
    ])
    expect(prepared).toEqual([
      { key: 'mediaCacheLocked', value: true },
      { key: 'key', value: 'D' },
    ])

    expect(prepareBulkActions([
      { field: 'cache', value: 'clear-all' },
      { field: 'mediaCacheLocked', value: 'true' },
    ])).toEqual([
      { key: 'cache', value: 'clear-all' },
    ])
  })
})
