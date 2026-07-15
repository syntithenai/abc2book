import {
  buildAbcSnippet,
  clipMusicLineToBars,
  countBarsInMusicLine,
} from './abcSnippetPreview'

describe('abcSnippetPreview', function() {
  test('clipMusicLineToBars keeps at most N bars', function() {
    const line = 'CDEF|GABc|cdef|gab c|CDEF|GABc|cdef|gab c|EXTRA|MORE|'
    const clipped = clipMusicLineToBars(line, 8)
    expect(clipped.split('|').filter(Boolean).length).toBeLessThanOrEqual(8)
    expect(clipped).not.toContain('EXTRA')
  })

  test('buildAbcSnippet uses first music line and headers', function() {
    const abc = [
      'X:1',
      'T:Demo',
      'M:4/4',
      'L:1/8',
      'K:G',
      'GAB c2 d|efg a2 b|c2 d e2 f|g2 a b2 c|',
      'second line should be ignored|',
    ].join('\n')
    const snippet = buildAbcSnippet(abc, { maxBars: 3 })
    expect(snippet).toContain('M:4/4')
    expect(snippet).toContain('K:G')
    expect(snippet).not.toContain('T:Demo')
    expect(snippet).toContain('GAB c2 d|')
    expect(snippet).not.toContain('second line')
  })

  test('buildAbcSnippet wraps bare music preview', function() {
    const snippet = buildAbcSnippet('CDEF|GABc|', { maxBars: 8, metadata: { key: 'D' } })
    expect(snippet).toContain('K:D')
    expect(snippet).toContain('CDEF|GABc|')
  })

  test('countBarsInMusicLine counts measures', function() {
    expect(countBarsInMusicLine('CDEF|GABc|cdef|')).toBeGreaterThanOrEqual(2)
  })
})
