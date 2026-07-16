import { buildOrderedSearchListIds, compareSearchGroupKeys } from './searchListOrder'

describe('searchListOrder', function() {
  test('compareSearchGroupKeys puts empty keys first', function() {
    expect(compareSearchGroupKeys('books', '', 'A')).toBe(-1)
    expect(compareSearchGroupKeys('books', 'A', '')).toBe(1)
  })

  test('ungrouped filtered list keeps array order', function() {
    const filtered = [
      { id: 'b', name: 'Beta' },
      { id: 'a', name: 'Alpha' },
    ]
    expect(buildOrderedSearchListIds(filtered, null, '')).toEqual(['b', 'a'])
    expect(buildOrderedSearchListIds(filtered, {}, '')).toEqual(['b', 'a'])
  })

  test('grouped list follows sorted group keys and includes empty group', function() {
    const filtered = [
      { id: 'z1', name: 'Zed' },
      { id: 'a1', name: 'Ada' },
      { id: 'orphan', name: 'Orphan' },
      { id: 'a2', name: 'Abe' },
    ]
    const grouped = {
      '': [2],
      Z: [0],
      A: [1, 3],
    }
    // Empty group sorts first (same as IndexLayout blank confidence section).
    expect(buildOrderedSearchListIds(filtered, grouped, 'boost')).toEqual([
      'orphan', 'a1', 'a2', 'z1',
    ])
  })

  test('returns null when filtered is missing', function() {
    expect(buildOrderedSearchListIds(null, null, '')).toBe(null)
    expect(buildOrderedSearchListIds({}, null, '')).toBe(null)
    expect(buildOrderedSearchListIds([], null, '')).toBe(null)
  })
})
