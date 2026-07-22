import { computePdfSpreadLayout } from './pdfSpreadLayout'

describe('computePdfSpreadLayout', function() {
  test('uses one page at full height on narrow screens', function() {
    const layout = computePdfSpreadLayout({
      containerWidth: 700,
      containerHeight: 900,
      fitMode: 'height',
    })
    expect(layout.spreadCount).toBe(1)
    expect(layout.pageWidth).toBeCloseTo((900 - 48) * 0.707, 1)
  })

  test('adds extra columns only when full-height width still fits', function() {
    const fullHeightWidth = (900 - 48) * 0.707
    const twoPageWidth = fullHeightWidth * 2 + 12
    const layout = computePdfSpreadLayout({
      containerWidth: twoPageWidth + 20,
      containerHeight: 900,
      fitMode: 'height',
    })
    expect(layout.spreadCount).toBe(2)
    expect(layout.pageWidth).toBeCloseTo(fullHeightWidth, 1)
  })

  test('does not add a second column if it would shrink below full height', function() {
    const layout = computePdfSpreadLayout({
      containerWidth: 1000,
      containerHeight: 900,
      fitMode: 'height',
    })
    const fullHeightWidth = (900 - 48) * 0.707
    expect(layout.spreadCount).toBe(1)
    expect(layout.pageWidth).toBeCloseTo(fullHeightWidth, 1)
  })

  test('allows up to four columns on very wide screens', function() {
    const fullHeightWidth = (900 - 48) * 0.707
    const fourPageWidth = (fullHeightWidth * 4) + (12 * 3)
    const layout = computePdfSpreadLayout({
      containerWidth: fourPageWidth + 40,
      containerHeight: 900,
      fitMode: 'height',
    })
    expect(layout.spreadCount).toBe(4)
    expect(layout.pageWidth).toBeCloseTo(fullHeightWidth, 1)
  })

  test('does not use multi-page spread in width fit mode', function() {
    const layout = computePdfSpreadLayout({
      containerWidth: 2400,
      containerHeight: 900,
      fitMode: 'width',
    })
    expect(layout.spreadCount).toBe(1)
    expect(layout.pageWidth).toBeCloseTo(2392, 1)
  })

  test('uses no toolbar allowance when embedded in main bar', function() {
    const layout = computePdfSpreadLayout({
      containerWidth: 700,
      containerHeight: 900,
      fitMode: 'height',
      toolbarEmbedded: true,
    })
    expect(layout.pageWidth).toBeCloseTo(900 * 0.707, 1)
  })
})
