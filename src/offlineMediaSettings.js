export const OFFLINE_MEDIA_SETTINGS_STORAGE_KEY = 'bookstorage_offline_media_settings'

export const DEFAULT_OFFLINE_MEDIA_SETTINGS = {
  autocacheOnPlay: false,
  prefetchNextTrack: false,
}

export function loadOfflineMediaSettings() {
  try {
    const raw = localStorage.getItem(OFFLINE_MEDIA_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_OFFLINE_MEDIA_SETTINGS)
    const parsed = JSON.parse(raw)
    return normalizeOfflineMediaSettings(parsed)
  } catch (e) {
    return Object.assign({}, DEFAULT_OFFLINE_MEDIA_SETTINGS)
  }
}

export function normalizeOfflineMediaSettings(settings) {
  const autocacheOnPlay = !!(settings && settings.autocacheOnPlay)
  return {
    autocacheOnPlay: autocacheOnPlay,
    prefetchNextTrack: autocacheOnPlay,
  }
}

export function saveOfflineMediaSettings(settings) {
  const next = normalizeOfflineMediaSettings(settings)
  try {
    localStorage.setItem(OFFLINE_MEDIA_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  return next
}
