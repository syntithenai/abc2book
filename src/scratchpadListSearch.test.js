import {
  filterScratchpadItems,
  scratchpadItemSearchHaystack,
  scratchpadItemUpdatedAtMs,
  sortScratchpadItemsByUpdatedAt,
} from './scratchpadListSearch'

describe('scratchpadListSearch', function() {
  test('scratchpadItemSearchHaystack includes title and text body', function() {
    const haystack = scratchpadItemSearchHaystack({
      title: 'Draft chorus',
      type: 'text',
      text: { body: 'Amazing grace' },
    })
    expect(haystack).toContain('draft chorus')
    expect(haystack).toContain('amazing grace')
  })

  test('filterScratchpadItems filters by query', function() {
    const items = [
      { id: 'a', title: 'Alpha', type: 'text' },
      { id: 'b', title: 'Beta motif', type: 'notation' },
    ]
    expect(filterScratchpadItems(items, 'motif').map(function(item) { return item.id })).toEqual(['b'])
    expect(filterScratchpadItems(items, '')).toHaveLength(2)
  })

  test('sortScratchpadItemsByUpdatedAt orders newest first', function() {
    const items = [
      { id: 'old', updatedAt: 100 },
      { id: 'new', updatedAt: 300 },
      { id: 'mid', updatedAt: 200 },
    ]
    expect(sortScratchpadItemsByUpdatedAt(items).map(function(item) { return item.id })).toEqual(['new', 'mid', 'old'])
  })

  test('scratchpadItemUpdatedAtMs parses ISO strings', function() {
    expect(scratchpadItemUpdatedAtMs({ updatedAt: '2020-01-02T00:00:00.000Z' })).toBe(Date.parse('2020-01-02T00:00:00.000Z'))
  })
})
