import {
  readEmbedFromWindowHash,
  isEmbeddedAppFrame,
  buildLyricsToolsIframeSrc,
} from './embedFrameUtils'

describe('embedFrameUtils', function() {
  const originalHash = window.location.hash

  afterEach(function() {
    window.location.hash = originalHash
  })

  test('readEmbedFromWindowHash reads embed=1 from hash query', function() {
    window.location.hash = '#/lyrics?embed=1&tab=lookup&q=hello'
    expect(readEmbedFromWindowHash()).toBe(true)
  })

  test('readEmbedFromWindowHash is false without embed param', function() {
    window.location.hash = '#/lyrics?tab=lookup'
    expect(readEmbedFromWindowHash()).toBe(false)
  })

  test('isEmbeddedAppFrame prefers searchParams', function() {
    const params = new URLSearchParams('embed=1')
    expect(isEmbeddedAppFrame(params)).toBe(true)
  })

  test('buildLyricsToolsIframeSrc includes embed and query', function() {
    const src = buildLyricsToolsIframeSrc('hello world')
    expect(src).toContain('embed=1')
    expect(src).toContain('q=hello%20world')
    expect(src).toContain('#/lyrics')
  })
})
