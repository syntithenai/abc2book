import {
  estimatePlayalongCalibrationLatencySeconds,
  PLAYALONG_CALIBRATION_MAX_MS,
  PLAYALONG_CALIBRATION_MIN_MS,
} from './playalongClapCalibration'
import {
  clampCalibratedOutputLatencySeconds,
  normalizePlayalongSettings,
} from './playalongSettings'
import { getPlayalongOutputLatencySeconds } from './playalongTakes'

describe('playalongClapCalibration', function() {
  test('estimatePlayalongCalibrationLatencySeconds uses median of in-range samples', function() {
    expect(estimatePlayalongCalibrationLatencySeconds([40, 160, 150, 155, 900])).toBeCloseTo(0.1525, 3)
    expect(estimatePlayalongCalibrationLatencySeconds([10, 15])).toBeNull()
    expect(estimatePlayalongCalibrationLatencySeconds([
      PLAYALONG_CALIBRATION_MIN_MS,
      PLAYALONG_CALIBRATION_MAX_MS,
    ])).toBeCloseTo(
      (PLAYALONG_CALIBRATION_MIN_MS + PLAYALONG_CALIBRATION_MAX_MS) / 2000,
      3
    )
  })
})

describe('playalong calibrated latency settings', function() {
  test('normalizePlayalongSettings clamps calibratedOutputLatencySeconds', function() {
    expect(normalizePlayalongSettings({
      calibratedOutputLatencySeconds: 0.18,
    }).calibratedOutputLatencySeconds).toBeCloseTo(0.18, 5)
    expect(clampCalibratedOutputLatencySeconds(0)).toBe(0)
    expect(clampCalibratedOutputLatencySeconds(0.9)).toBe(0.5)
    expect(clampCalibratedOutputLatencySeconds(0.01)).toBe(0)
  })

  test('getPlayalongOutputLatencySeconds prefers calibration over AudioContext', function() {
    expect(getPlayalongOutputLatencySeconds({
      calibratedOutputLatencySeconds: 0.17,
      audioContext: { outputLatency: 0.02, baseLatency: 0.01 },
    })).toBeCloseTo(0.17, 5)
    expect(getPlayalongOutputLatencySeconds({
      audioContext: { outputLatency: 0.02, baseLatency: 0.01 },
    })).toBeCloseTo(0.03, 5)
  })
})
