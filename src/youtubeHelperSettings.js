/** User preference to ignore the TuneBook Helper extension without uninstalling it. */

const STORAGE_KEY = 'bookstorage_youtube_helper_disabled'

export function isYoutubeHelperDisabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function setYoutubeHelperDisabled(disabled) {
  try {
    if (disabled) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('youtubeHelperSettingsChanged'))
  }
}
