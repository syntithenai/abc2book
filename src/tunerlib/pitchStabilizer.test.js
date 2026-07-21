import {
  createPitchStabilizer,
  createNoteStripController,
  formatDetectedFrequencyLabel,
  medianOf,
  stddev,
  DEFAULT_GATE_THRESHOLD
} from './pitchStabilizer'

describe('pitchStabilizer', function() {
  test('medianOf rejects outliers', function() {
    expect(medianOf([100, 100, 100, 500, 102])).toBe(100)
  })

  test('stddev returns spread of values', function() {
    expect(stddev([0, 0, 0, 0])).toBe(0)
    expect(stddev([0, 2])).toBe(1)
  })

  test('gate blocks low input level', function() {
    const stabilizer = createPitchStabilizer({ gateThreshold: 0.05 })
    const result = stabilizer.process(440, 0.01, 0, 'A4', 1000)
    expect(result.freq).toBe(null)
  })

  test('hold keeps last reading after silence', function() {
    const stabilizer = createPitchStabilizer({ holdAfterMs: 300 })
    stabilizer.process(440, 0.1, 2, 'A4', 1000)
    const held = stabilizer.process(0, 0, null, '', 1500)
    expect(held.isHeld).toBe(true)
    expect(held.freq).toBe(440)
    expect(held.cents).toBe(2)
  })

  test('reset clears held state', function() {
    const stabilizer = createPitchStabilizer()
    stabilizer.process(440, 0.1, 0, 'A4', 1000)
    stabilizer.reset()
    const result = stabilizer.process(0, 0, null, '', 2000)
    expect(result.freq).toBe(null)
  })

  test('getStabilityCents tracks live variance', function() {
    const stabilizer = createPitchStabilizer()
    stabilizer.pushCents(0)
    stabilizer.pushCents(4)
    expect(stabilizer.getStabilityCents()).toBeGreaterThan(0)
  })

  test('getDisplayCents returns median of recent samples', function() {
    const stabilizer = createPitchStabilizer()
    stabilizer.pushCents(2)
    stabilizer.pushCents(4)
    stabilizer.pushCents(3)
    expect(stabilizer.getDisplayCents()).toBe(3)
  })

  test('note strip controller waits for stable pitch before switching', function() {
    const controller = createNoteStripController({ holdMs: 200 })
    expect(controller.shouldUpdate(67, false, 1000)).toBe(false)
    expect(controller.shouldUpdate(67, false, 1100)).toBe(false)
    expect(controller.shouldUpdate(67, false, 1250)).toBe(true)
    expect(controller.shouldUpdate(67, false, 1300)).toBe(false)
    expect(controller.shouldUpdate(69, false, 1400)).toBe(false)
    expect(controller.shouldUpdate(69, false, 1650)).toBe(true)
  })

  test('note strip controller ignores held readings', function() {
    const controller = createNoteStripController({ holdMs: 100 })
    controller.shouldUpdate(67, false, 1000)
    expect(controller.shouldUpdate(67, true, 1200)).toBe(false)
  })

  test('note strip controller resets on instrument change', function() {
    const controller = createNoteStripController({ holdMs: 100 })
    controller.shouldUpdate(67, false, 1000)
    controller.shouldUpdate(67, false, 1200)
    controller.reset()
    expect(controller.shouldUpdate(67, false, 1300)).toBe(false)
  })

  test('formatDetectedFrequencyLabel uses stabilized frequency', function() {
    expect(formatDetectedFrequencyLabel(440, 440)).toBe('A4')
    expect(formatDetectedFrequencyLabel(392, 440)).toBe('G4')
  })

  test('configure updates stabilizer window and hold', function() {
    const stabilizer = createPitchStabilizer({ windowSize: 5, holdAfterMs: 100 })
    stabilizer.configure({ windowSize: 9, holdAfterMs: 250 })
    stabilizer.process(440, 0.1, 0, 'A4', 1000)
    const held = stabilizer.process(0, 0, null, '', 1200)
    expect(held.freq).toBe(440)
    expect(held.isHeld).toBe(false)
  })
})
