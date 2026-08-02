import {
  assignedNotationChunkIds,
  partitionNotationChunksForSelect,
  previewSnippet,
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

  test('previewSnippet collapses lines', function() {
    expect(previewSnippet('line one\nline two', 50)).toBe('line one / line two')
  })
})
