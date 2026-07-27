import {
  capoOffsetForShapeKey,
  clampCapoOffset,
  chordTransposeWithCapo,
  buildCapoQuickOptions,
} from './capoViewUtils'

describe('capoViewUtils', function() {
  test('clampCapoOffset limits fret range', function() {
    expect(clampCapoOffset(-1)).toBe(0)
    expect(clampCapoOffset(5)).toBe(5)
    expect(clampCapoOffset(99)).toBe(12)
    expect(clampCapoOffset('')).toBe(0)
  })

  test('capoOffsetForShapeKey maps sounding key to guitar shapes', function() {
    expect(capoOffsetForShapeKey('G', 'A')).toBe(2)
    expect(capoOffsetForShapeKey('C', 'A')).toBe(9)
    expect(capoOffsetForShapeKey('D', 'A')).toBe(7)
    expect(capoOffsetForShapeKey('G', 'G')).toBe(0)
  })

  test('chordTransposeWithCapo subtracts capo when enabled', function() {
    expect(chordTransposeWithCapo(2, 3, true)).toBe(-1)
    expect(chordTransposeWithCapo(2, 3, false)).toBe(2)
  })

  test('buildCapoQuickOptions uses tune key and transpose', function() {
    const options = buildCapoQuickOptions({ key: 'A', transpose: 0 }, 'A|D|E|A|')
    const gShape = options.find(function(o) { return o.shapeKey === 'G' })
    expect(gShape && gShape.offset).toBe(2)
  })
})
