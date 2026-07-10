import {
  adaptiveDisplayRange,
  centsToNeedleAngle,
  rmsFromTimeDomain,
  smoothNeedleCents,
  targetAdaptiveRange,
  volumeSegmentColors,
  formatCents
} from './tunerDisplayUtils'

describe('tunerDisplayUtils', function() {
  test('rmsFromTimeDomain returns 0 for silence', function() {
    const data = new Uint8Array(128)
    data.fill(128)
    expect(rmsFromTimeDomain(data)).toBe(0)
  })

  test('rmsFromTimeDomain increases with amplitude', function() {
    const quiet = new Uint8Array(128)
    const loud = new Uint8Array(128)
    quiet.fill(128)
    for (let i = 0; i < loud.length; i += 1) {
      loud[i] = 128 + (i % 2 === 0 ? 20 : -20)
    }
    expect(rmsFromTimeDomain(loud)).toBeGreaterThan(rmsFromTimeDomain(quiet))
  })

  test('targetAdaptiveRange steps down as pitch gets closer', function() {
    expect(targetAdaptiveRange(40)).toBe(50)
    expect(targetAdaptiveRange(20)).toBe(25)
    expect(targetAdaptiveRange(8)).toBe(12)
    expect(targetAdaptiveRange(4)).toBe(6)
    expect(targetAdaptiveRange(1)).toBe(3)
  })

  test('adaptiveDisplayRange smooths toward target', function() {
    expect(adaptiveDisplayRange(40, 50, 1)).toBe(50)
    expect(adaptiveDisplayRange(1, 50, 1)).toBe(3)
    expect(adaptiveDisplayRange(1, 50, 0.5)).toBe(26.5)
  })

  test('smoothNeedleCents converges toward target without overshoot', function() {
    let smoothed = 0
    for (let i = 0; i < 60; i += 1) {
      smoothed = smoothNeedleCents(smoothed, 10, 16)
    }
    expect(smoothed).toBeGreaterThan(9)
    expect(smoothed).toBeLessThanOrEqual(10)
  })

  test('smoothNeedleCents holds last value when target is null', function() {
    expect(smoothNeedleCents(5, null, 16)).toBe(5)
  })

  test('centsToNeedleAngle maps cents into angle range', function() {
    expect(centsToNeedleAngle(0, 50, 80)).toBe(0)
    expect(centsToNeedleAngle(50, 50, 80)).toBe(80)
    expect(centsToNeedleAngle(-25, 50, 80)).toBe(-40)
    expect(centsToNeedleAngle(100, 50, 80)).toBe(80)
  })

  test('volumeSegmentColors returns gradient segments', function() {
    const colors = volumeSegmentColors(12)
    expect(colors).toHaveLength(12)
    expect(colors[0]).toMatch(/^rgb\(/)
    expect(colors[11]).not.toBe(colors[0])
  })

  test('formatCents includes sign', function() {
    expect(formatCents(3)).toBe('+3 ¢')
    expect(formatCents(-13)).toBe('-13 ¢')
    expect(formatCents(null)).toBe('— ¢')
  })
})
