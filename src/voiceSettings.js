export const VOICE_SETTINGS_STORAGE_KEY = 'bookstorage_voice_settings'

export const VOICE_INPUT_MODES = ['tap', 'hold']

export const DEFAULT_VOICE_SETTINGS = {
  inputMode: 'tap',
  speakSongTitles: false,
  speakArtistNames: false,
}

export function normalizeVoiceInputMode(mode) {
  return mode === 'hold' ? 'hold' : 'tap'
}

export function normalizeSpeakSongTitles(value) {
  return value === true
}

export function normalizeSpeakArtistNames(value) {
  return value === true
}

export function normalizeVoiceSettings(settings) {
  return {
    inputMode: normalizeVoiceInputMode(settings && settings.inputMode),
    speakSongTitles: normalizeSpeakSongTitles(settings && settings.speakSongTitles),
    speakArtistNames: normalizeSpeakArtistNames(settings && settings.speakArtistNames),
  }
}

export function loadVoiceSettings() {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_VOICE_SETTINGS)
    return normalizeVoiceSettings(JSON.parse(raw))
  } catch (e) {
    return Object.assign({}, DEFAULT_VOICE_SETTINGS)
  }
}

export function saveVoiceSettings(partial) {
  const next = normalizeVoiceSettings(Object.assign({}, loadVoiceSettings(), partial))
  try {
    localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('voiceSettingsChanged'))
  }
  return next
}

export function getVoiceInputMode() {
  return loadVoiceSettings().inputMode
}

export function isTapVoiceInputMode() {
  return getVoiceInputMode() === 'tap'
}

export function isSpeakSongTitlesEnabled() {
  return loadVoiceSettings().speakSongTitles === true
}

export function isSpeakArtistNamesEnabled() {
  return loadVoiceSettings().speakArtistNames === true
}
