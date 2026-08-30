import { isPhotoOnlyAbc, isPhotoOnlyTune } from './abcPhotoOnly'

describe('abcPhotoOnly', function() {
  test('isPhotoOnlyAbc detects marker', function() {
    expect(isPhotoOnlyAbc('%% photo only — ABC not transcribed')).toBe(true)
    expect(isPhotoOnlyAbc('% photo only stub')).toBe(true)
    expect(isPhotoOnlyAbc('X:1\nT:Song\nK:C\nCDEF|')).toBe(false)
  })

  test('isPhotoOnlyTune checks joinTier, abccomments, and abc text', function() {
    expect(isPhotoOnlyTune({ joinTier: 'photo_only' })).toBe(true)
    expect(isPhotoOnlyTune({
      abccomments: ['%% photo only — ABC not transcribed; see associated crop image'],
    })).toBe(true)
    expect(isPhotoOnlyTune({ id: 't1' }, 'X:1\n%% photo only\nK:C\n')).toBe(true)
    expect(isPhotoOnlyTune({ id: 't1', voices: { '1': { notes: [] } } }, 'X:1\nK:C\n')).toBe(false)
  })
})
