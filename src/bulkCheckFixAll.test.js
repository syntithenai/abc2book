import {
  FIX_ALL_BACKGROUND_ACTIONS,
  FIX_ALL_PREVIEW_ACTIONS,
  orderFixAllActionIds,
} from './bulkCheckFixAll'

describe('bulkCheckFixAll', function() {
  test('orders structure fixes before searches', function() {
    const ordered = orderFixAllActionIds([
      'backgroundInfo',
      'searchArtist',
      'normalizeAbc',
      'sessionLineBreaks',
      'capitalizeTitle',
    ])
    expect(ordered.indexOf('sessionLineBreaks')).toBeLessThan(ordered.indexOf('normalizeAbc'))
    expect(ordered.indexOf('normalizeAbc')).toBeLessThan(ordered.indexOf('capitalizeTitle'))
    expect(ordered.indexOf('capitalizeTitle')).toBeLessThan(ordered.indexOf('searchArtist'))
    expect(ordered.indexOf('searchArtist')).toBeLessThan(ordered.indexOf('backgroundInfo'))
  })

  test('preview and background action sets', function() {
    expect(FIX_ALL_PREVIEW_ACTIONS.has('normalizeAbc')).toBe(true)
    expect(FIX_ALL_PREVIEW_ACTIONS.has('appendFinalBarline')).toBe(true)
    expect(FIX_ALL_BACKGROUND_ACTIONS.has('searchArtist')).toBe(true)
    expect(FIX_ALL_BACKGROUND_ACTIONS.has('backgroundInfo')).toBe(true)
    expect(FIX_ALL_BACKGROUND_ACTIONS.has('searchAbc')).toBe(false)
  })
})
