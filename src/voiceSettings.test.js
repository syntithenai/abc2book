import {
  DEFAULT_VOICE_SETTINGS,
  getVoiceInputMode,
  isTapVoiceInputMode,
  loadVoiceSettings,
  normalizeVoiceInputMode,
  saveVoiceSettings,
  VOICE_SETTINGS_STORAGE_KEY,
} from './voiceSettings'

describe('voiceSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  it('defaults to tap mode', function() {
    expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS)
    expect(getVoiceInputMode()).toBe('tap')
    expect(isTapVoiceInputMode()).toBe(true)
  })

  it('normalizes invalid input modes to tap', function() {
    expect(normalizeVoiceInputMode(null)).toBe('tap')
    expect(normalizeVoiceInputMode('invalid')).toBe('tap')
    expect(normalizeVoiceInputMode('hold')).toBe('hold')
  })

  it('persists hold mode', function() {
    saveVoiceSettings({ inputMode: 'hold' })
    expect(localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)).toBe(JSON.stringify({ inputMode: 'hold' }))
    expect(getVoiceInputMode()).toBe('hold')
    expect(isTapVoiceInputMode()).toBe(false)
  })

  it('dispatches voiceSettingsChanged on save', function() {
    const handler = jest.fn()
    window.addEventListener('voiceSettingsChanged', handler)
    saveVoiceSettings({ inputMode: 'hold' })
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('voiceSettingsChanged', handler)
  })
})
