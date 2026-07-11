import {
  getBarModel,
  normalizeMeter,
  beatPositionsForBarChords,
  buildMeterMergeOptions,
  fullBarRestAbc,
  isCompoundMeter,
} from './barModel'

describe('barModel', function() {
  test('normalizes C and C|', function() {
    expect(normalizeMeter('C')).toBe('4/4')
    expect(normalizeMeter('C|')).toBe('2/2')
  })

  test('4/4 with L:1/8 has 8 unit slots and 4 beats', function() {
    const model = getBarModel('4/4', '1/8')
    expect(model.unitSlotsPerBar).toBe(8)
    expect(model.beatCount).toBe(4)
    expect(model.beatUnitSlots).toBe(2)
    expect(model.compound).toBe(false)
  })

  test('3/4 with L:1/8 has 6 unit slots and 3 beats', function() {
    const model = getBarModel('3/4', '1/8')
    expect(model.unitSlotsPerBar).toBe(6)
    expect(model.beatCount).toBe(3)
    expect(model.beatUnitSlots).toBe(2)
  })

  test('6/8 is compound with 2 beats', function() {
    const model = getBarModel('6/8', '1/8')
    expect(isCompoundMeter('6/8')).toBe(true)
    expect(model.compound).toBe(true)
    expect(model.unitSlotsPerBar).toBe(6)
    expect(model.beatCount).toBe(2)
    expect(model.beatUnitSlots).toBe(3)
  })

  test('9/8 is compound with 3 beats', function() {
    const model = getBarModel('9/8', '1/8')
    expect(model.beatCount).toBe(3)
    expect(model.unitSlotsPerBar).toBe(9)
    expect(model.beatUnitSlots).toBe(3)
  })

  test('2/2 with L:1/8 has 8 slots and 2 beats', function() {
    const model = getBarModel('2/2', '1/8')
    expect(model.unitSlotsPerBar).toBe(8)
    expect(model.beatCount).toBe(2)
  })

  test('honors custom L:1/4', function() {
    const model = getBarModel('4/4', '1/4')
    expect(model.noteLength).toBe('1/4')
    expect(model.unitSlotsPerBar).toBe(4)
  })

  test('two chords in 6/8 snap to beat starts', function() {
    const model = getBarModel('6/8', '1/8')
    const positions = beatPositionsForBarChords(['G', 'D'], model, null, 0)
    expect(positions[0]).toBe(0)
    expect(positions[1]).toBe(3)
  })

  test('three chords in 3/4 snap to beats when count matches', function() {
    const model = getBarModel('3/4', '1/8')
    const positions = beatPositionsForBarChords(['C', 'F', 'G'], model, null, 0)
    expect(positions).toEqual([0, 2, 4])
  })

  test('anchor mapping uses beat span', function() {
    const model = getBarModel('6/8', '1/8')
    const positions = beatPositionsForBarChords(
      ['G', 'D'],
      model,
      [{ wordIndex: 0 }, { wordIndex: 3 }],
      4
    )
    expect(positions[0]).toBeLessThan(3)
    expect(positions[1]).toBeGreaterThanOrEqual(3)
  })

  test('meter conflict offers keep notation and use sheet', function() {
    const decision = buildMeterMergeOptions('6/8', '3/4')
    expect(decision.options.length).toBe(2)
    expect(decision.options[0].id).toBe('keep-notation')
    expect(decision.options[1].id).toBe('use-sheet')
    expect(decision.assumedDefault).toBe(false)
  })

  test('missing meters assume 4/4 with notice', function() {
    const decision = buildMeterMergeOptions('', '')
    expect(decision.assumedDefault).toBe(true)
    expect(decision.resolvedMeter).toBe('4/4')
  })

  test('fullBarRestAbc matches unit slots', function() {
    expect(fullBarRestAbc(6)).toBe('|: z6 |]')
    expect(fullBarRestAbc(8)).toBe('|: z8 |]')
  })
})
