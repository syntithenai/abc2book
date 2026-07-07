import {
  BULK_EDIT_FIELDS,
  coerceBulkFieldValue,
  isBulkChangeRowComplete,
  prepareBulkChanges,
} from './bulkEditFields'

describe('bulkEditFields', function() {
  test('includes transpose with correct key', function() {
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'transpose' })).toBe(true)
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'tranpose' })).toBe(false)
  })

  test('includes genre field', function() {
    expect(BULK_EDIT_FIELDS.some(function(field) { return field.key === 'genre' })).toBe(true)
  })

  test('coerces numeric fields', function() {
    expect(coerceBulkFieldValue('capo', '3')).toBe('3')
    expect(coerceBulkFieldValue('capo', '')).toBe(0)
    expect(coerceBulkFieldValue('boost', '21')).toBe('20')
    expect(coerceBulkFieldValue('difficulty', '-2')).toBe('0')
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
})
