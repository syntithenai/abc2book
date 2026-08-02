import {
  assignedNotationChunkIds,
  assignedNotationSourceItemIds,
  partitionNotationChunksForSelect,
  sortScratchpadItemsForNotationSelect,
  previewSnippet,
  twoTrimmedPreviewLines,
  textScratchpadItemPreviewLines,
} from './scratchpadCompositionUiUtils'

describe('scratchpadCompositionUiUtils', function() {
  test('partitionNotationChunksForSelect puts assigned notation in suggested group', function() {
    const notationChunks = [
      { id: 'n1', label: 'A', order: 0 },
      { id: 'n2', label: 'B', order: 1 },
      { id: 'n3', label: 'C', order: 2 },
    ]
    const composition = {
      pairings: [{ lyricsChunkId: 'l1', notationChunkId: 'n2' }],
    }
    const parts = partitionNotationChunksForSelect(notationChunks, composition, 'n3')
    expect(parts.suggested.map(function(c) { return c.id })).toContain('n2')
    expect(parts.suggested.map(function(c) { return c.id })).toContain('n3')
    expect(parts.other.map(function(c) { return c.id })).toContain('n1')
  })

  test('assignedNotationChunkIds reads explicit pairings', function() {
    const ids = assignedNotationChunkIds({
      pairings: [
        { lyricsChunkId: 'l1', notationChunkId: 'n1' },
        { lyricsChunkId: 'l2', notationChunkId: 'n2' },
      ],
    })
    expect(ids.has('n1')).toBe(true)
    expect(ids.has('n2')).toBe(true)
  })

  test('assignedNotationSourceItemIds maps paired chunks to scratchpad items', function() {
    const ids = assignedNotationSourceItemIds({
      pairings: [{ lyricsChunkId: 'l1', notationChunkId: 'n1' }],
      notationChunks: [
        { id: 'n1', sourceItemId: 'scratch-notation-1' },
        { id: 'n2', sourceItemId: 'scratch-notation-2' },
      ],
    })
    expect(ids.has('scratch-notation-1')).toBe(true)
    expect(ids.has('scratch-notation-2')).toBe(false)
  })

  test('sortScratchpadItemsForNotationSelect puts paired sources first', function() {
    const composition = {
      pairings: [{ lyricsChunkId: 'l1', notationChunkId: 'n1' }],
      notationChunks: [{ id: 'n1', sourceItemId: 'item-b' }],
    }
    const sorted = sortScratchpadItemsForNotationSelect([
      { id: 'item-a', title: 'A' },
      { id: 'item-b', title: 'B' },
      { id: 'item-c', title: 'C' },
    ], composition)
    expect(sorted.map(function(item) { return item.id })).toEqual(['item-b', 'item-a', 'item-c'])
  })

  test('previewSnippet collapses lines', function() {
    expect(previewSnippet('line one\nline two', 50)).toBe('line one / line two')
  })

  test('twoTrimmedPreviewLines returns up to two trimmed lines', function() {
    expect(twoTrimmedPreviewLines('First line\nSecond line\nThird line')).toEqual([
      'First line',
      'Second line',
    ])
  })

  test('textScratchpadItemPreviewLines reads text item body', function() {
    const lines = textScratchpadItemPreviewLines({
      type: 'text',
      text: { body: 'Alpha\nBeta' },
    })
    expect(lines).toEqual(['Alpha', 'Beta'])
  })
})
