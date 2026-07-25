import {
  scratchpadInlineHeaderTokens,
  prependInlineHeadersToNotes,
} from './scratchpadNotationInlineHeaders'

describe('scratchpadNotationInlineHeaders', function() {
  test('emits inline tokens for differing meter, key, and tempo', function() {
    const tokens = scratchpadInlineHeaderTokens(
      { meter: '6/8', key: 'Am', tempo: 90 },
      { meter: '4/4', key: 'C', tempo: 120 }
    )
    expect(tokens).toEqual(['[M:6/8]', '[K:Am]', '[Q:3/8=90]'])
  })

  test('skips matching meta', function() {
    const tokens = scratchpadInlineHeaderTokens(
      { meter: '4/4', key: 'C', tempo: 120 },
      { meter: '4/4', key: 'C', tempo: 120 }
    )
    expect(tokens).toEqual([])
  })

  test('injectInlineHeadersAtBar inserts at bar index', function() {
    const { injectInlineHeadersAtBar } = require('./scratchpadNotationInlineHeaders')
    const notes = injectInlineHeadersAtBar(
      ['CDEF | efg | GABc |'],
      ['[M:6/8]', '[Q:3/8=90]'],
      2
    )
    expect(notes[0]).toContain('[M:6/8] [Q:3/8=90] efg')
  })
})
