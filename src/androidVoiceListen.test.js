import {
  NATIVE_STT_MIN_CONFIDENCE,
  isNativeTranscriptGoodEnough,
  rmsDbToLevel,
} from './androidVoiceListen'

describe('isNativeTranscriptGoodEnough', () => {
  test('rejects empty transcript', () => {
    expect(isNativeTranscriptGoodEnough('', 0.99)).toBe(false)
    expect(isNativeTranscriptGoodEnough('   ', undefined)).toBe(false)
  })

  test('accepts non-empty transcript when confidence is missing', () => {
    expect(isNativeTranscriptGoodEnough('show wild rover')).toBe(true)
    expect(isNativeTranscriptGoodEnough('show wild rover', undefined)).toBe(true)
    expect(isNativeTranscriptGoodEnough('show wild rover', Number.NaN)).toBe(true)
    // Android sentinel when confidence is unavailable
    expect(isNativeTranscriptGoodEnough('show wild rover', -1)).toBe(true)
  })

  test('requires minimum confidence when score is present', () => {
    expect(isNativeTranscriptGoodEnough('show wild rover', NATIVE_STT_MIN_CONFIDENCE)).toBe(true)
    expect(isNativeTranscriptGoodEnough('show wild rover', 0.9)).toBe(true)
    expect(isNativeTranscriptGoodEnough('show wild rover', 0.44)).toBe(false)
  })
})

describe('rmsDbToLevel', () => {
  test('maps SpeechRecognizer rmsdB range into 0–1', () => {
    expect(rmsDbToLevel(-2)).toBe(0)
    expect(rmsDbToLevel(10)).toBe(1)
    expect(rmsDbToLevel(4)).toBeCloseTo(0.5, 5)
  })
})
