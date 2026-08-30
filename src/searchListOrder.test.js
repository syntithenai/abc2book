import {
  buildOrderedSearchListIds,
  buildOrderedSearchListGroups,
  compareSearchGroupKeys,
  findSearchListGroupIndex,
  findSearchListGroupIds,
  findExplicitBookPageSiblingIds,
  filterExplicitBookPageGroups,
  isExplicitBookPageGroupKey,
  adjacentSearchListGroupFirstId,
  tunePageSectionDomId,
} from './searchListOrder'

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
    expect(buildOrderedSearchListGroups(filtered, null, '')).toEqual([
      { key: '', ids: ['b', 'a'] },
    ])
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
    expect(buildOrderedSearchListGroups(filtered, grouped, 'boost')).toEqual([
      { key: '', ids: ['orphan'] },
      { key: 'A', ids: ['a1', 'a2'] },
      { key: 'Z', ids: ['z1'] },
    ])
  })

  test('page groups keep tuneIndex order within a page', function() {
    const filtered = [
      { id: 'p8a', name: 'First' },
      { id: 'p8b', name: 'Second' },
      { id: 'p9a', name: 'Next page' },
    ]
    const grouped = {
      9: [2],
      8: [0, 1],
    }
    expect(buildOrderedSearchListGroups(filtered, grouped, 'page')).toEqual([
      { key: '8', ids: ['p8a', 'p8b'] },
      { key: '9', ids: ['p9a'] },
    ])
  })

  test('findSearchListGroupIndex and sibling ids', function() {
    const groups = [
      { key: '8', ids: ['p8a', 'p8b'] },
      { key: '9', ids: ['p9a'] },
    ]
    expect(findSearchListGroupIndex(groups, 'p8b')).toBe(0)
    expect(findSearchListGroupIndex(groups, 'p9a')).toBe(1)
    expect(findSearchListGroupIndex(groups, 'missing')).toBe(-1)
    expect(findSearchListGroupIds(groups, 'p8b')).toEqual(['p8a', 'p8b'])
    expect(findSearchListGroupIds(groups, 'missing')).toBe(null)
  })

  test('explicit page siblings ignore unordered blank group', function() {
    const groups = [
      { key: '', ids: ['u1', 'u2', 'u3'] },
      { key: '8', ids: ['p8a', 'p8b'] },
      { key: '9', ids: ['p9a'] },
    ]
    expect(isExplicitBookPageGroupKey('')).toBe(false)
    expect(isExplicitBookPageGroupKey('8')).toBe(true)
    expect(findExplicitBookPageSiblingIds(groups, 'u2')).toBe(null)
    expect(findExplicitBookPageSiblingIds(groups, 'p8b')).toEqual(['p8a', 'p8b'])
    expect(filterExplicitBookPageGroups(groups)).toEqual([
      { key: '8', ids: ['p8a', 'p8b'] },
      { key: '9', ids: ['p9a'] },
    ])
    expect(adjacentSearchListGroupFirstId(filterExplicitBookPageGroups(groups), 'p8b', 1)).toBe('p9a')
  })

  test('adjacentSearchListGroupFirstId steps by page and wraps', function() {
    const groups = [
      { key: '8', ids: ['p8a', 'p8b'] },
      { key: '9', ids: ['p9a'] },
      { key: '10', ids: ['p10a', 'p10b'] },
    ]
    // Mid-page tune → first id of next page
    expect(adjacentSearchListGroupFirstId(groups, 'p8b', 1)).toBe('p9a')
    expect(adjacentSearchListGroupFirstId(groups, 'p9a', 1)).toBe('p10a')
    expect(adjacentSearchListGroupFirstId(groups, 'p10b', 1)).toBe('p8a')
    expect(adjacentSearchListGroupFirstId(groups, 'p9a', -1)).toBe('p8a')
    expect(adjacentSearchListGroupFirstId(groups, 'p8a', -1)).toBe('p10a')
  })

  test('tunePageSectionDomId', function() {
    expect(tunePageSectionDomId('abc123')).toBe('tune-page-section-abc123')
    expect(tunePageSectionDomId('')).toBe('')
    expect(tunePageSectionDomId(null)).toBe('')
  })

  test('returns null when filtered is missing', function() {
    expect(buildOrderedSearchListIds(null, null, '')).toBe(null)
    expect(buildOrderedSearchListIds({}, null, '')).toBe(null)
    expect(buildOrderedSearchListIds([], null, '')).toBe(null)
    expect(buildOrderedSearchListGroups(null, null, '')).toBe(null)
  })
})
