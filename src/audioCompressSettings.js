export const AUDIO_COMPRESS_SETTINGS_STORAGE_KEY = 'bookstorage_audio_compress_settings'

export const AUDIO_COMPRESS_FORMATS = ['wav', 'mp3', 'aac']

export const AUDIO_COMPRESS_FORMAT_OPTIONS = [
  { value: 'wav', label: 'Uncompressed WAV' },
  { value: 'mp3', label: 'Compressed MP3' },
  { value: 'aac', label: 'Compressed AAC' },
]

export const DEFAULT_AUDIO_COMPRESS_SETTINGS = {
  format: 'aac',
}

const MIME_BY_FORMAT = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  aac: 'audio/mp4',
}

const EXTENSION_BY_FORMAT = {
  wav: 'wav',
  mp3: 'mp3',
  aac: 'm4a',
}

export function normalizeAudioCompressFormat(format) {
  if (format === 'wav' || format === 'mp3' || format === 'aac') {
    return format
  }
  return 'aac'
}

export function normalizeAudioCompressSettings(settings) {
  return {
    format: normalizeAudioCompressFormat(settings && settings.format),
  }
}

export function loadAudioCompressSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_COMPRESS_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_AUDIO_COMPRESS_SETTINGS)
    return normalizeAudioCompressSettings(JSON.parse(raw))
  } catch (e) {
    return Object.assign({}, DEFAULT_AUDIO_COMPRESS_SETTINGS)
  }
}

export function saveAudioCompressSettings(settings) {
  const next = normalizeAudioCompressSettings(settings)
  try {
    localStorage.setItem(AUDIO_COMPRESS_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  return next
}

export function getAudioCompressFormat() {
  return loadAudioCompressSettings().format
}

export function getAudioCompressMimeType(format) {
  const normalized = normalizeAudioCompressFormat(format)
  return MIME_BY_FORMAT[normalized]
}

export function getAudioCompressExtension(format) {
  const normalized = normalizeAudioCompressFormat(format)
  return EXTENSION_BY_FORMAT[normalized]
}
