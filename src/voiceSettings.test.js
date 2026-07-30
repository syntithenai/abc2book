import {
  DEFAULT_VOICE_SETTINGS,
  getVoiceInputMode,
  isSpeakArtistNamesEnabled,
  isSpeakSongTitlesEnabled,
  isTapVoiceInputMode,
  loadVoiceSettings,
  normalizeSpeakArtistNames,
  normalizeSpeakSongTitles,
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
    expect(localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({ inputMode: 'hold', speakSongTitles: false, speakArtistNames: false })
    )
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

  it('defaults speakSongTitles to false', function() {
    expect(normalizeSpeakSongTitles(null)).toBe(false)
    expect(isSpeakSongTitlesEnabled()).toBe(false)
  })

  it('persists speakSongTitles', function() {
    saveVoiceSettings({ speakSongTitles: true })
    expect(localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({ inputMode: 'tap', speakSongTitles: true, speakArtistNames: false })
    )
    expect(isSpeakSongTitlesEnabled()).toBe(true)
  })

  it('defaults speakArtistNames to false', function() {
    expect(normalizeSpeakArtistNames(null)).toBe(false)
    expect(isSpeakArtistNamesEnabled()).toBe(false)
  })

  it('persists speakArtistNames', function() {
    saveVoiceSettings({ speakArtistNames: true })
    expect(localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({ inputMode: 'tap', speakSongTitles: false, speakArtistNames: true })
    )
    expect(isSpeakArtistNamesEnabled()).toBe(true)
  })
})
